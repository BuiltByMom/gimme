import {useCallback, useMemo, useState} from 'react';
import toast from 'react-hot-toast';
import {BaseError, isHex, zeroAddress} from 'viem';
import {useBlockNumber} from 'wagmi';
import useWallet from '@builtbymom/web3/contexts/useWallet';
import {useWeb3} from '@builtbymom/web3/contexts/useWeb3';
import {useApprove} from '@builtbymom/web3/hooks/useApprove';
import {useAsyncTrigger} from '@builtbymom/web3/hooks/useAsyncTrigger';
import {
	assert,
	ETH_TOKEN_ADDRESS,
	formatTAmount,
	isEthAddress,
	isZeroAddress,
	toAddress,
	toBigInt,
	zeroNormalizedBN
} from '@builtbymom/web3/utils';
import {defaultTxStatus, retrieveConfig, toWagmiProvider} from '@builtbymom/web3/utils/wagmi';
import {useSafeAppsSDK} from '@gnosis.pm/safe-apps-react-sdk';
import {sendTransaction, switchChain, waitForTransactionReceipt} from '@wagmi/core';
import {useNotifications} from '@lib/contexts/useNotifications';
import {isValidPortalsErrorObject} from '@lib/hooks/helpers/isValidPortalsErrorObject';
import {useGetIsStablecoin} from '@lib/hooks/helpers/useGetIsStablecoin';
import {getPortalsApproval, getPortalsTx, getQuote, PORTALS_NETWORK} from '@lib/utils/api.portals';
import {getApproveTransaction} from '@lib/utils/tools.gnosis';

import type {Hex} from 'viem';
import type {TAddress} from '@builtbymom/web3/types';
import type {TTxResponse} from '@builtbymom/web3/utils/wagmi';
import type {BaseTransaction} from '@gnosis.pm/safe-apps-sdk';
import type {TSolverContextBase} from '@lib/contexts/useSolver.types';
import type {TInitSolverArgs} from '@lib/types/solvers';
import type {TTokenAmountInputElement} from '@lib/types/utils';
import type {TPortalsApproval, TPortalsEstimate} from '@lib/utils/api.portals';

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
	const {address, provider, isWalletSafe} = useWeb3();

	const {addNotification} = useNotifications();
	const {getToken} = useWallet();
	const {data: blockNumber} = useBlockNumber();

	const [depositStatus, set_depositStatus] = useState(defaultTxStatus);
	const [latestQuote, set_latestQuote] = useState<TPortalsEstimate>();
	const [approveCtx, set_approveCtx] = useState<TPortalsApproval>();

	const [isFetchingQuote, set_isFetchingQuote] = useState(false);

	const {getIsStablecoin} = useGetIsStablecoin();

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

	/**********************************************************************************************
	 ** The useApprove hook is used to approve the token to spend for the vault. This is used to
	 ** allow the vault to spend the token on behalf of the user. This is required for the deposit
	 ** function to work.
	 **
	 ** @returns isApproved: boolean - Whether the token is approved or not.
	 ** @returns isApproving: boolean - Whether the approval is in progress.
	 ** @returns onApprove: () => void - Function to approve the token.
	 ** @returns amountApproved: bigint - The amount approved.
	 ** @returns permitSignature: TPermitSignature - The permit signature.
	 ** @returns onClearPermit: () => void - Function to clear the permit signature.
	 *********************************************************************************************/
	const {isApproved, isApproving, onApprove, amountApproved, permitSignature, onClearPermit} = useApprove({
		provider,
		chainID: inputAsset.token?.chainID || 0,
		tokenToApprove: toAddress(inputAsset.token?.address),
		spender: toAddress(approveCtx?.context.spender || zeroAddress),
		owner: toAddress(address),
		amountToApprove: toBigInt(inputAsset.normalizedBigAmount?.raw || 0n),
		shouldUsePermit: !!approveCtx?.context.canPermit && withPermit,
		deadline,
		disabled: shouldDisableFetches
	});

	/************************************************************************************************
	 * This useAsyncTrigger hook is responsible for fetching and setting the approval context
	 * for the Portals solver. It runs when the input conditions change and updates the approveCtx
	 * state accordingly. The approval context is crucial for determining whether the user needs
	 * to approve token spending and if a permit can be used instead of a traditional approval.
	 *
	 * Key functionalities:
	 * 1. Checks if fetches should be disabled based on current input conditions
	 * 2. Handles special case for ETH addresses
	 * 3. Fetches approval data from Portals API if conditions are met
	 * 4. Updates the approveCtx state with the fetched approval data
	 *
	 * This process ensures that the correct approval mechanism is in place before executing
	 * a transaction through the Portals solver.
	 ************************************************************************************************/
	useAsyncTrigger(async (): Promise<void> => {
		if (shouldDisableFetches) {
			set_approveCtx(undefined);
			return;
		}
		if (isEthAddress(inputAsset.token?.address)) {
			set_approveCtx(undefined);
			return;
		}
		if (!inputAsset.token || !inputAsset?.normalizedBigAmount?.raw) {
			set_approveCtx(undefined);
			return;
		}

		if (approveCtx?.context.target === outputTokenAddress) {
			return;
		}

		const network = PORTALS_NETWORK.get(inputAsset.token.chainID);
		const {data: approval} = await getPortalsApproval({
			params: {
				sender: toAddress(address),
				inputToken: `${network}:${toAddress(inputAsset.token.address)}`,
				inputAmount: toBigInt(inputAsset.normalizedBigAmount.raw).toString(),
				permitDeadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 60).toString()
			}
		});

		if (!approval) {
			set_approveCtx(undefined);
			return;
		}
		set_approveCtx(approval);
	}, [
		shouldDisableFetches,
		inputAsset.token,
		inputAsset.normalizedBigAmount.raw,
		approveCtx?.context.target,
		outputTokenAddress,
		address
	]);

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

		set_depositStatus(defaultTxStatus);
	}, [onRetrieveQuote, shouldDisableFetches]);

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
				onClearPermit();
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
		getToken,
		onClearPermit
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
					onClearPermit();
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
			permitSignature,
			onClearPermit
		]
	);

	return {
		quote: latestQuote || null,
		allowance: amountApproved,
		// todo: fix?
		isFetchingAllowance: false,
		isApproved,
		isFetchingQuote,
		approvalStatus: {...defaultTxStatus, pending: isApproving ? true : defaultTxStatus.pending},
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
