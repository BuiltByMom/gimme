import {useCallback, useMemo, useRef, useState} from 'react';
import toast from 'react-hot-toast';
import {BaseError, erc20Abi, isHex, zeroAddress} from 'viem';
import {useBlockNumber} from 'wagmi';
import useWallet from '@builtbymom/web3/contexts/useWallet';
import {useWeb3} from '@builtbymom/web3/contexts/useWeb3';
import {useAsyncTrigger} from '@builtbymom/web3/hooks/useAsyncTrigger';
import {
	assert,
	assertAddress,
	ETH_TOKEN_ADDRESS,
	formatTAmount,
	isEthAddress,
	isZeroAddress,
	MAX_UINT_256,
	toAddress,
	toBigInt,
	toNormalizedBN,
	zeroNormalizedBN
} from '@builtbymom/web3/utils';
import {approveERC20, defaultTxStatus, retrieveConfig, toWagmiProvider} from '@builtbymom/web3/utils/wagmi';
import {useSafeAppsSDK} from '@gnosis.pm/safe-apps-react-sdk';
import {readContract, sendTransaction, switchChain, waitForTransactionReceipt} from '@wagmi/core';
import {useNotifications} from '@lib/contexts/useNotifications';
import {isValidPortalsErrorObject} from '@lib/hooks/helpers/isValidPortalsErrorObject';
import {useGetIsStablecoin} from '@lib/hooks/helpers/useGetIsStablecoin';
import {isPermitSupported, signPermit} from '@lib/hooks/usePermit';
import {getPortalsApproval, getPortalsTx, getQuote, PORTALS_NETWORK} from '@lib/utils/api.portals';
import {getApproveTransaction} from '@lib/utils/tools.gnosis';
import {allowanceKey} from '@yearn-finance/web-lib/utils/helpers';

import type {Hex} from 'viem';
import type {TAddress, TDict, TNormalizedBN} from '@builtbymom/web3/types';
import type {TTxResponse} from '@builtbymom/web3/utils/wagmi';
import type {BaseTransaction} from '@gnosis.pm/safe-apps-sdk';
import type {TSolverContextBase} from '@lib/contexts/useSolver.types';
import type {TPermitSignature} from '@lib/hooks/usePermit.types';
import type {TInitSolverArgs} from '@lib/types/solvers';
import type {TTokenAmountInputElement} from '@lib/types/utils';
import type {TPortalsEstimate} from '@lib/utils/api.portals';

export const usePortalsSolver = (
	inputAsset: TTokenAmountInputElement,
	outputTokenAddress: TAddress | undefined,
	isZapNeeded: boolean,
	isBridgeNeeded: boolean,
	slippage: string = '1',
	deadline: number = 60,
	withPermit: boolean = true
): TSolverContextBase<TPortalsEstimate | null> => {
	const {sdk} = useSafeAppsSDK();
	const {address, provider, isWalletSafe, chainID} = useWeb3();

	const {addNotification} = useNotifications();
	const {getToken} = useWallet();
	const {data: blockNumber} = useBlockNumber();

	const [approvalStatus, set_approvalStatus] = useState(defaultTxStatus);
	const [depositStatus, set_depositStatus] = useState(defaultTxStatus);
	const [allowance, set_allowance] = useState<TNormalizedBN>(zeroNormalizedBN);
	const [isFetchingAllowance, set_isFetchingAllowance] = useState(false);
	const [latestQuote, set_latestQuote] = useState<TPortalsEstimate>();
	const [permitSignature, set_permitSignature] = useState<TPermitSignature | undefined>();
	const [isFetchingQuote, set_isFetchingQuote] = useState(false);
	const spendAmount = inputAsset.normalizedBigAmount?.raw ?? 0n;
	const isAboveAllowance = allowance.raw >= spendAmount;
	const existingAllowances = useRef<TDict<TNormalizedBN>>({});

	/**********************************************************************************************
	 ** It's important not to make extra fetches. For this solver we should disable quote and
	 ** allowance fetches in 4 cases:
	 ** 1. No token selected
	 ** 2. Input amount is either undefined or zero
	 ** 3. Zap is not needed for this configuration
	 ** 4. Bridge is needed for this configuration
	 *********************************************************************************************/
	const shouldDisableFetches = useMemo(() => {
		return !inputAsset.token || !inputAsset.amount || !outputTokenAddress || !isZapNeeded || isBridgeNeeded;
	}, [inputAsset.amount, inputAsset.token, isBridgeNeeded, isZapNeeded, outputTokenAddress]);

	const {getIsStablecoin} = useGetIsStablecoin();

	const onRetrieveQuote = useCallback(async () => {
		if (!inputAsset.token || !outputTokenAddress || inputAsset.normalizedBigAmount === zeroNormalizedBN) {
			return;
		}

		const request: TInitSolverArgs = {
			chainID: inputAsset.token.chainID,
			from: toAddress(address),
			inputToken: inputAsset.token.address,
			outputToken: outputTokenAddress,
			inputAmount: inputAsset.normalizedBigAmount?.raw ?? 0n,
			isDepositing: true,
			stakingPoolAddress: undefined
		};

		set_isFetchingQuote(true);

		const isOutputStablecoin = getIsStablecoin({address: outputTokenAddress, chainID: inputAsset.token.chainID});

		const {result, error} = await getQuote(request, isOutputStablecoin ? 0.1 : 0.5);
		set_isFetchingQuote(false);
		if (!result) {
			if (error) {
				console.error(error);
			}
			set_latestQuote(undefined);

			return undefined;
		}
		set_latestQuote(result);

		return result;
	}, [inputAsset.token, inputAsset.normalizedBigAmount, outputTokenAddress, address, getIsStablecoin]);

	useAsyncTrigger(async (): Promise<void> => {
		if (shouldDisableFetches) {
			return;
		}

		onRetrieveQuote();

		set_permitSignature(undefined);
		set_approvalStatus(defaultTxStatus);
		set_depositStatus(defaultTxStatus);
	}, [onRetrieveQuote, shouldDisableFetches]);

	/**********************************************************************************************
	 * Retrieve the allowance for the token to be used by the solver. This will be used to
	 * determine if the user should approve the token or not.
	 **********************************************************************************************/
	const onRetrieveAllowance = useCallback(
		async (shouldForceRefetch?: boolean): Promise<TNormalizedBN> => {
			if (!latestQuote || !inputAsset.token || !outputTokenAddress) {
				return zeroNormalizedBN;
			}
			if (inputAsset.normalizedBigAmount.raw === zeroNormalizedBN.raw) {
				return zeroNormalizedBN;
			}
			const inputToken = inputAsset.token.address;
			const outputToken = outputTokenAddress;

			if (isZeroAddress(inputToken) || isZeroAddress(outputToken) || isZeroAddress(address)) {
				return zeroNormalizedBN;
			}

			if (isEthAddress(inputToken)) {
				return toNormalizedBN(MAX_UINT_256, 18);
			}

			const key = allowanceKey(
				inputAsset.token?.chainID,
				toAddress(inputToken),
				toAddress(outputToken),
				toAddress(address)
			);
			if (existingAllowances.current[key] && !shouldForceRefetch) {
				return existingAllowances.current[key];
			}

			set_isFetchingAllowance(true);

			try {
				const network = PORTALS_NETWORK.get(inputAsset.token.chainID);
				const {data: approval} = await getPortalsApproval({
					params: {
						sender: toAddress(address),
						inputToken: `${network}:${toAddress(inputToken)}`,
						inputAmount: toBigInt(inputAsset.normalizedBigAmount?.raw).toString()
					}
				});

				if (!approval) {
					throw new Error('Portals approval not found');
				}

				existingAllowances.current[key] = toNormalizedBN(
					toBigInt(approval.context.allowance),
					inputAsset.token.decimals
				);

				set_isFetchingAllowance(false);

				return existingAllowances.current[key];
			} catch (err) {
				set_isFetchingAllowance(false);
				return zeroNormalizedBN;
			}
		},
		[latestQuote, inputAsset.token, inputAsset.normalizedBigAmount, outputTokenAddress, address]
	);

	/**********************************************************************************************
	 * SWR hook to get the expected out for a given in/out pair with a specific amount. This hook
	 * is called when amount/in or out changes. Calls the allowanceFetcher callback.
	 *********************************************************************************************/
	const triggerRetreiveAllowance = useAsyncTrigger(async (): Promise<void> => {
		if (shouldDisableFetches) {
			return;
		}

		set_allowance(await onRetrieveAllowance(true));
	}, [onRetrieveAllowance, shouldDisableFetches]);

	/**********************************************************************************************
	 * Trigger an signature to approve the token to be used by the Portals
	 * solver. A single signature is required, which will allow the spending
	 * of the token by the Portals solver.
	 *********************************************************************************************/
	const onApprove = useCallback(
		async (onSuccess?: () => void): Promise<void> => {
			if (!provider) {
				return;
			}

			assert(inputAsset.token, 'Input token is not set');
			assert(inputAsset.normalizedBigAmount, 'Input amount is not set');
			assert(outputTokenAddress, 'Output token is not set');

			const hasPermitSupported = await isPermitSupported({
				contractAddress: inputAsset.token.address,
				chainID: Number(inputAsset?.token.chainID),
				options: {disableExceptions: true}
			});

			const amount = inputAsset.normalizedBigAmount.raw;

			try {
				const network = PORTALS_NETWORK.get(inputAsset.token.chainID);
				const {data: approval} = await getPortalsApproval({
					params: {
						sender: toAddress(address),
						inputToken: `${network}:${toAddress(inputAsset.token.address)}`,
						inputAmount: toBigInt(inputAsset.normalizedBigAmount.raw).toString()
					}
				});

				if (!approval) {
					return;
				}

				if (hasPermitSupported && withPermit && approval.context.canPermit) {
					set_approvalStatus({...approvalStatus, pending: true});

					/**************************************************************************
					 ** We need to switch chain manually before signing the permit
					 **************************************************************************/
					if (chainID !== inputAsset.token.chainID) {
						await switchChain(retrieveConfig(), {chainId: inputAsset.token.chainID});
					}
					const signResult = await signPermit({
						contractAddress: toAddress(inputAsset.token.address),
						ownerAddress: toAddress(address),
						spenderAddress: toAddress(approval.context.spender),
						value: toBigInt(inputAsset.normalizedBigAmount?.raw),
						deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * deadline),
						chainID: inputAsset.token.chainID
					});

					if (signResult?.signature) {
						set_approvalStatus({...approvalStatus, success: true});
						set_allowance(inputAsset.normalizedBigAmount || zeroNormalizedBN);
						set_permitSignature(signResult);
						onSuccess?.();
					} else {
						set_approvalStatus({...approvalStatus, error: true});
						throw new Error('Error signing a permit.');
					}
				} else {
					const allowance = await readContract(retrieveConfig(), {
						chainId: Number(inputAsset.token.chainID),
						abi: erc20Abi,
						address: toAddress(inputAsset.token.address),
						functionName: 'allowance',
						args: [toAddress(address), toAddress(approval.context.spender)]
					});

					if (allowance < amount) {
						assertAddress(approval.context.spender, 'spender');
						const result = await approveERC20({
							connector: provider,
							chainID: inputAsset.token.chainID,
							contractAddress: inputAsset.token.address,
							spenderAddress: approval.context.spender,
							amount: amount,
							statusHandler: set_approvalStatus
						});
						if (result.isSuccessful) {
							onSuccess?.();
						}
						triggerRetreiveAllowance();
						return;
					}
					onSuccess?.();
					triggerRetreiveAllowance();
					return;
				}
			} catch (error) {
				if (permitSignature) {
					set_permitSignature(undefined);
					set_allowance(zeroNormalizedBN);
				}

				console.error(error);
				toast.error((error as BaseError).shortMessage || (error as BaseError).message) ||
					'An error occured while creating your transaction!';
				return;
			}
		},
		[
			address,
			approvalStatus,
			chainID,
			deadline,
			inputAsset.normalizedBigAmount,
			inputAsset.token,
			outputTokenAddress,
			permitSignature,
			provider,
			triggerRetreiveAllowance,
			withPermit
		]
	);

	/**********************************************************************************************
	 * execute will send the post request to execute the order and wait for it to be executed, no
	 * matter the result. It returns a boolean value indicating whether the order was successful or
	 * not.
	 *********************************************************************************************/
	const execute = useCallback(async (): Promise<TTxResponse> => {
		assert(provider, 'Provider is not set');
		assert(latestQuote, 'Quote is not set');
		assert(inputAsset.token, 'Input token is not set');
		assert(outputTokenAddress, 'Output token is not set');

		try {
			let inputToken = inputAsset.token.address;
			const outputToken = outputTokenAddress;
			if (isEthAddress(inputToken)) {
				inputToken = zeroAddress;
			}
			const network = PORTALS_NETWORK.get(inputAsset.token.chainID);
			const transaction = await getPortalsTx({
				params: {
					sender: toAddress(address),
					inputToken: `${network}:${toAddress(inputToken)}`,
					outputToken: `${network}:${toAddress(outputToken)}`,
					inputAmount: toBigInt(inputAsset.normalizedBigAmount?.raw).toString(),
					slippageTolerancePercentage: slippage,
					validate: isWalletSafe ? 'false' : 'true',
					permitSignature: permitSignature?.signature || undefined,
					permitDeadline: permitSignature?.deadline ? permitSignature.deadline.toString() : undefined
				}
			});

			if (!transaction.result) {
				throw new Error('Transaction data was not fetched from Portals!');
			}

			const {
				tx: {value, to, data, ...rest}
			} = transaction.result;
			const wagmiProvider = await toWagmiProvider(provider);

			if (wagmiProvider.chainId !== inputAsset.token.chainID) {
				try {
					await switchChain(retrieveConfig(), {chainId: inputAsset.token.chainID});
				} catch (error) {
					if (!(error instanceof BaseError)) {
						return {isSuccessful: false, error};
					}
					console.error(error.shortMessage);

					return {isSuccessful: false, error};
				}
			}

			assert(isHex(data), 'Data is not hex');
			assert(wagmiProvider.walletClient, 'Wallet client is not set');
			const hash = await sendTransaction(retrieveConfig(), {
				value: toBigInt(value ?? 0),
				to: toAddress(to),
				data,
				chainId: inputAsset.token.chainID,

				...rest
			});
			const receipt = await waitForTransactionReceipt(retrieveConfig(), {
				chainId: wagmiProvider.chainId,
				timeout: 15 * 60 * 1000, // Polygon can be very, VERY, slow. 15mn timeout just to be sure
				hash
			});

			if (receipt.status === 'success') {
				await addNotification({
					from: receipt.from,
					fromAddress: isZeroAddress(latestQuote.context.inputToken.split(':')[1])
						? ETH_TOKEN_ADDRESS
						: toAddress(latestQuote.context.inputToken.split(':')[1]),
					fromChainId: inputAsset.token.chainID,
					fromTokenName: inputAsset.token.symbol,
					fromAmount: formatTAmount({
						value: toBigInt(latestQuote.context.inputAmount),
						decimals: inputAsset.token.decimals
					}),
					toAddress: toAddress(latestQuote.context.outputToken.split(':')[1]),
					toChainId: inputAsset.token.chainID,
					toTokenName: getToken({
						chainID: inputAsset.token.chainID,
						address: outputTokenAddress
					}).symbol,
					timeFinished: Date.now() / 1000,
					status: 'success',
					type: 'portals',
					blockNumber: receipt.blockNumber,
					safeTxHash: undefined,
					txHash: receipt.transactionHash
				});
				return {isSuccessful: true, receipt: receipt};
			}
			console.error('Fail to perform transaction');
			return {isSuccessful: false};
		} catch (error) {
			console.error(error);
			if (isValidPortalsErrorObject(error)) {
				const errorMessage = error.response.data.message;
				toast.error(errorMessage);
				console.error(errorMessage);
			} else {
				toast.error((error as BaseError).shortMessage || 'An error occured while creating your transaction!');
				console.error(error);
			}

			return {isSuccessful: false};
		} finally {
			if (permitSignature) {
				set_permitSignature(undefined);
				set_allowance(zeroNormalizedBN);
			}
		}
	}, [
		provider,
		latestQuote,
		inputAsset.token,
		inputAsset.normalizedBigAmount?.raw,
		outputTokenAddress,
		address,
		slippage,
		isWalletSafe,
		permitSignature,
		addNotification,
		getToken
	]);

	/**********************************************************************************************
	 * This execute function is not an actual deposit/withdraw, but a swap using the Portals
	 * solver. The deposit will be executed by the Portals solver by simply swapping the input token
	 * for the output token.
	 *********************************************************************************************/
	const onExecuteDeposit = useCallback(
		async (onSuccess: () => void): Promise<void> => {
			assert(provider, 'Provider is not set');

			set_depositStatus({...defaultTxStatus, pending: true});
			const status = await execute();
			if (status.isSuccessful) {
				set_depositStatus({...defaultTxStatus, success: true});
				onSuccess();
			} else {
				set_depositStatus({...defaultTxStatus, error: true});
			}
		},
		[execute, provider]
	);

	const onExecuteForGnosis = useCallback(
		async (onSuccess: () => void): Promise<void> => {
			assert(provider, 'Provider is not set');
			assert(latestQuote, 'Quote is not set');
			assert(inputAsset.token, 'Input token is not set');
			assert(outputTokenAddress, 'Output token is not set');

			set_depositStatus({...defaultTxStatus, pending: true});

			let inputToken = inputAsset.token.address;
			const outputToken = outputTokenAddress;
			if (isEthAddress(inputToken)) {
				inputToken = zeroAddress;
			}

			const network = PORTALS_NETWORK.get(inputAsset.token.chainID);
			const transaction = await getPortalsTx({
				params: {
					sender: toAddress(address),
					inputToken: `${network}:${toAddress(inputToken)}`,
					outputToken: `${network}:${toAddress(outputToken)}`,
					inputAmount: toBigInt(inputAsset.normalizedBigAmount?.raw).toString(),
					slippageTolerancePercentage: slippage,
					validate: isWalletSafe ? 'false' : 'true'
				}
			});

			if (!transaction.result) {
				toast.error('An error occured while fetching your transaction!');
				set_depositStatus({...defaultTxStatus, error: true});

				throw new Error('Transaction data was not fetched from Portals!');
			}

			const {
				tx: {value, to, data}
			} = transaction.result;

			const batch = [];

			if (!isZeroAddress(inputToken)) {
				const approveTransactionForBatch = getApproveTransaction(
					toBigInt(inputAsset.normalizedBigAmount?.raw).toString(),
					toAddress(inputAsset.token?.address),
					toAddress(to)
				);

				batch.push(approveTransactionForBatch);
			}

			const portalsTransactionForBatch: BaseTransaction = {
				to: toAddress(to),
				value: toBigInt(value ?? 0).toString(),
				data
			};
			batch.push(portalsTransactionForBatch);

			try {
				const res = await sdk.txs.send({txs: batch});
				await addNotification({
					from: toAddress(address),
					fromAddress: toAddress(transaction.result.context.inputToken.split(':')[1]),
					fromChainId: inputAsset.token.chainID,
					fromTokenName: inputAsset.token.symbol,
					fromAmount: formatTAmount({
						value: toBigInt(latestQuote.context.inputAmount),
						decimals: inputAsset.token.decimals
					}),
					toAddress: toAddress(transaction.result.context.outputToken.split(':')[1]),
					toChainId: inputAsset.token.chainID,
					toTokenName: getToken({
						chainID: inputAsset.token.chainID,
						address: outputTokenAddress
					}).symbol,
					timeFinished: Date.now() / 1000,
					status: 'pending',
					type: 'portals gnosis',
					blockNumber: blockNumber || 0n,
					safeTxHash: res.safeTxHash as Hex,
					txHash: undefined
				});

				set_depositStatus({...defaultTxStatus, success: true});

				onSuccess?.();
			} catch (error) {
				set_depositStatus({...defaultTxStatus, error: true});
				toast.error((error as BaseError)?.message || 'An error occured while creating your transaction!');
			} finally {
				if (permitSignature) {
					set_permitSignature(undefined);
					set_allowance(zeroNormalizedBN);
				}
			}
		},
		[
			provider,
			latestQuote,
			inputAsset.token,
			inputAsset.normalizedBigAmount?.raw,
			outputTokenAddress,
			address,
			slippage,
			isWalletSafe,
			sdk.txs,
			addNotification,
			getToken,
			blockNumber,
			permitSignature
		]
	);

	return {
		quote: latestQuote || null,
		allowance,
		isFetchingAllowance,
		isApproved: isAboveAllowance,
		isDisabled: !approvalStatus.none,
		isFetchingQuote,
		approvalStatus,
		depositStatus,
		withdrawStatus: depositStatus, //Deposit and withdraw are the same for Portals
		set_depositStatus,
		set_withdrawStatus: set_depositStatus, //Deposit and withdraw are the same for Portals
		onExecuteDeposit,
		onExecuteWithdraw: onExecuteDeposit, //Deposit and withdraw are the same for Portals
		onExecuteForGnosis,
		onApprove
	};
};
