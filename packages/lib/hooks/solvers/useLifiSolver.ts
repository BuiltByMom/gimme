import {useCallback, useMemo, useRef, useState} from 'react';
import toast from 'react-hot-toast';
import {usePlausible} from 'next-plausible';
import {BaseError, encodeFunctionData, erc20Abi, isHex, parseAbi} from 'viem';
import {serialize} from 'wagmi';
import {useWeb3} from '@builtbymom/web3/contexts/useWeb3';
import {useAsyncTrigger} from '@builtbymom/web3/hooks/useAsyncTrigger';
import {
	assert,
	ETH_TOKEN_ADDRESS,
	formatTAmount,
	isEthAddress,
	isZeroAddress,
	MAX_UINT_256,
	toAddress,
	toBigInt,
	toNormalizedBN,
	ZERO_ADDRESS,
	zeroNormalizedBN
} from '@builtbymom/web3/utils';
import {approveERC20, defaultTxStatus, retrieveConfig, toWagmiProvider} from '@builtbymom/web3/utils/wagmi';
import {getContractCallsQuote, getQuote} from '@lifi/sdk';
import {readContract, sendTransaction, switchChain, waitForTransactionReceipt} from '@wagmi/core';
import {useNotifications} from '@lib/contexts/useNotifications';
import {PLAUSIBLE_EVENTS} from '@lib/utils/plausible';
import {createUniqueID} from '@lib/utils/tools.identifiers';

import type {TAddress, TNormalizedBN, TToken} from '@builtbymom/web3/types';
import type {TTxResponse} from '@builtbymom/web3/utils/wagmi';
import type {TSolverContextBase} from '@lib/contexts/useSolver.types';
import type {TTokenAmountInputElement} from '@lib/types/utils';
import type {ContractCallsQuoteRequest, LiFiStep, QuoteRequest} from '@lifi/sdk';

export const useLifiSolver = (
	inputAsset: TTokenAmountInputElement,
	outputTokenAddress: TAddress | undefined,
	outputTokenChainId: number | undefined,
	outputVaultAsset: TToken | undefined,
	isBridgeNeeded: boolean
): TSolverContextBase<LiFiStep | null> => {
	const plausible = usePlausible();
	const {address, provider} = useWeb3();
	const [approvalStatus, set_approvalStatus] = useState(defaultTxStatus);
	const [depositStatus, set_depositStatus] = useState(defaultTxStatus);
	const [allowance, set_allowance] = useState<TNormalizedBN>(zeroNormalizedBN);
	const [isFetchingAllowance, set_isFetchingAllowance] = useState(false);
	const [latestQuote, set_latestQuote] = useState<LiFiStep>();
	const [isFetchingQuote, set_isFetchingQuote] = useState(false);
	const spendAmount = inputAsset.normalizedBigAmount?.raw ?? 0n;
	const isAboveAllowance = allowance.raw >= spendAmount;
	const uniqueIdentifier = useRef<string | undefined>(undefined);

	const {addNotification} = useNotifications();

	/**********************************************************************************************
	 ** It's important not to make extra fetches. For this solver we should disable quote and
	 ** allowance fetches in 4 cases:
	 ** 1. No token selected
	 ** 2. Input amount is either undefined or zero
	 ** 3. Bridge is not needed for this configuration
	 *********************************************************************************************/
	const shouldDisableFetches = useMemo(() => {
		return !inputAsset.token || !inputAsset.amount || !outputTokenAddress || !isBridgeNeeded || !address;
	}, [address, inputAsset.amount, inputAsset.token, isBridgeNeeded, outputTokenAddress]);

	/**********************************************************************************************
	 ** This useCallback hook is used to retrieve a quote from the LiFi API.
	 ** It takes the input asset, output token address, output vault asset, output token chain ID,
	 ** and spend amount as parameters.
	 ** If any of these parameters are missing or the spend amount is zero, the function returns.
	 ** It calculates the from token address based on whether the input asset is an ETH token.
	 ** Then, it creates a configuration object with the necessary parameters for the quote request.
	 ** To successfully retrieve a quote for multichain zap, we should:
	 ** - Fetch quote for bridging the input token to the underlying token of the output vault
	 **   to understand the minimum amount user will receive
	 ** - Get approve tx data to be executed on the lifi side when sending the tx
	 ** - Get deposit tx data so 'deposit' function was executed on the lifi side when sending the tx
	 ** - Build contractCallsQuoteRequest with the approve and deposit tx data. Fetching it will return
	 **   the final quote will help of wich it is possible to perform 3 tx on the lifi side:
	 **   1. bridge
	 **   2. approve
	 **   3. deposit
	 *********************************************************************************************/
	const onRetrieveQuote = useCallback(async () => {
		if (
			!inputAsset.token ||
			!outputTokenAddress ||
			!outputVaultAsset?.address ||
			!outputTokenChainId ||
			spendAmount === 0n
		) {
			return;
		}
		const fromToken = isEthAddress(inputAsset.token.address) ? ZERO_ADDRESS : inputAsset.token.address;
		const config = {
			fromChain: inputAsset.token.chainID,
			toChain: outputTokenChainId,
			fromToken: fromToken,
			amount: spendAmount.toString(),
			vaultAddress: outputTokenAddress,
			vaultAsset: outputVaultAsset?.address,
			depositGas: '1000000',
			depositContractAbi: ['function deposit(uint amount, address to) external']
		};

		const currentIdentifier = createUniqueID(serialize(config));
		uniqueIdentifier.current = createUniqueID(serialize(config));

		set_isFetchingQuote(true);

		const quoteRequest: QuoteRequest = {
			fromChain: config.fromChain,
			toChain: outputTokenChainId,
			fromToken: config.fromToken,
			toToken: outputVaultAsset?.address,
			fromAmount: spendAmount.toString(),
			fromAddress: toAddress(address),
			integrator: 'smol'
		};
		const quote = await getQuote(quoteRequest);
		const approveTxData = encodeFunctionData({
			abi: erc20Abi,
			functionName: 'approve',
			args: [config.vaultAddress, toBigInt(quote.estimate.toAmountMin)]
		});

		const depositTxData = encodeFunctionData({
			abi: parseAbi(config.depositContractAbi),
			functionName: 'deposit',
			args: [quote.estimate.toAmountMin, address]
		});

		const contractCallsQuoteRequest: ContractCallsQuoteRequest = {
			fromChain: config.fromChain,
			fromToken: config.fromToken,
			fromAddress: toAddress(address),
			toChain: config.toChain,
			toToken: config.vaultAsset,
			fromAmount: config.amount,
			contractCalls: [
				{
					fromAmount: quote.estimate.toAmountMin,
					fromTokenAddress: config.vaultAsset,
					toContractAddress: config.vaultAddress,
					toContractCallData: approveTxData,
					toContractGasLimit: config.depositGas
				},
				{
					fromAmount: quote.estimate.toAmountMin,
					fromTokenAddress: config.vaultAsset,
					toContractAddress: config.vaultAddress,
					toContractCallData: depositTxData,
					toContractGasLimit: config.depositGas
				}
			]
		};

		/******************************************************************************************
		 ** Try to retrive the quote or set it to undefined if it fails.
		 *****************************************************************************************/
		let contractCallsQuote: LiFiStep | undefined = undefined;
		try {
			if (uniqueIdentifier.current !== currentIdentifier) {
				return;
			}
			contractCallsQuote = await getContractCallsQuote(contractCallsQuoteRequest);
		} catch (e) {
			console.error(e);
			set_latestQuote(undefined);
			console.error('No possible route found for the quote');
		}

		set_isFetchingQuote(false);

		if (!contractCallsQuote?.action) {
			set_latestQuote(undefined);
			return;
		}
		set_latestQuote(contractCallsQuote);
	}, [address, inputAsset.token, outputTokenAddress, outputTokenChainId, outputVaultAsset?.address, spendAmount]);

	useAsyncTrigger(async (): Promise<void> => {
		if (shouldDisableFetches) {
			return;
		}
		onRetrieveQuote();
	}, [onRetrieveQuote, shouldDisableFetches]);

	/**********************************************************************************************
	 ** Retrieve the allowance for the token to be used by the solver. This will
	 ** be used to determine if the user should approve the token or not.
	 *********************************************************************************************/
	const onRetrieveAllowance = useCallback(async (): Promise<TNormalizedBN> => {
		if (!latestQuote || !inputAsset?.token || !outputTokenAddress) {
			return zeroNormalizedBN;
		}
		if (spendAmount === 0n) {
			return zeroNormalizedBN;
		}

		if (isEthAddress(inputAsset.token.address)) {
			return toNormalizedBN(MAX_UINT_256, 18);
		}

		set_isFetchingAllowance(true);

		const allowance = await readContract(retrieveConfig(), {
			chainId: inputAsset.token.chainID,
			abi: erc20Abi,
			address: toAddress(inputAsset.token.address),
			functionName: 'allowance',
			args: [toAddress(address), toAddress(latestQuote.estimate.approvalAddress)]
		});

		set_isFetchingAllowance(false);

		return toNormalizedBN(allowance, inputAsset.token.decimals);
	}, [address, inputAsset.token, latestQuote, outputTokenAddress, spendAmount]);

	const triggerRetreiveAllowance = useAsyncTrigger(async (): Promise<void> => {
		if (shouldDisableFetches) {
			return;
		}
		set_allowance(await onRetrieveAllowance());
	}, [onRetrieveAllowance, shouldDisableFetches]);

	const onApprove = useCallback(
		async (onSuccess?: () => void): Promise<void> => {
			if (!provider) {
				return;
			}

			assert(inputAsset.token, 'Input token is not set');
			assert(inputAsset.normalizedBigAmount, 'Input amount is not set');
			assert(latestQuote, 'Quote is not fetched');

			try {
				const result = await approveERC20({
					connector: provider,
					chainID: inputAsset.token.chainID,
					contractAddress: inputAsset.token.address,
					spenderAddress: toAddress(latestQuote?.estimate.approvalAddress),
					amount: spendAmount,
					statusHandler: set_approvalStatus
				});
				if (result.isSuccessful) {
					onSuccess?.();
				}
				onSuccess?.();
				triggerRetreiveAllowance();
				return;
			} catch (error) {
				console.error(error);
				return;
			}
		},
		[inputAsset.normalizedBigAmount, inputAsset.token, latestQuote, provider, spendAmount, triggerRetreiveAllowance]
	);

	const execute = useCallback(async (): Promise<TTxResponse> => {
		assert(provider, 'Provider is not set');
		assert(latestQuote, 'Quote is not set');
		assert(inputAsset.token, 'Input token is not set');
		assert(outputTokenAddress, 'Output token is not set');
		try {
			set_depositStatus({...defaultTxStatus, pending: true});

			const {value, to, data, gasLimit, gasPrice, chainId} = latestQuote?.transactionRequest || {};
			const wagmiProvider = await toWagmiProvider(provider);
			assert(isHex(data), 'Data is not hex');
			assert(chainId, 'Chain ID is not set');
			assert(wagmiProvider.walletClient, 'Wallet client is not set');
			if (wagmiProvider.chainId !== chainId) {
				try {
					await switchChain(retrieveConfig(), {chainId});
				} catch (error) {
					if (!(error instanceof BaseError)) {
						return {isSuccessful: false, error};
					}
					toast.error(error.shortMessage);
					console.error(error);
					return {isSuccessful: false, error};
				}
			}

			const hash = await sendTransaction(retrieveConfig(), {
				value: toBigInt(value ?? 0),
				to: toAddress(to),
				data,
				chainId: chainId,
				gas: gasLimit ? BigInt(gasLimit as string) : undefined,
				gasPrice: gasPrice ? BigInt(gasPrice as string) : undefined
			});

			plausible(PLAUSIBLE_EVENTS.DEPOSIT, {
				props: {
					vaultAddress: toAddress(latestQuote.action.toToken.address),
					vaultName: latestQuote.action.toToken.name,
					vaultChainID: latestQuote.action.toChainId,
					tokenAddress: toAddress(latestQuote.action.fromToken.address),
					tokenName: latestQuote.action.fromToken.name,
					isSwap: isBridgeNeeded,
					tokenAmount: latestQuote.action.fromAmount,
					action: `Deposit ${latestQuote.action.fromAmount} ${latestQuote.action.fromToken.symbol} -> ${latestQuote.action.toToken.name} on chain ${latestQuote.action.toChainId}`
				}
			});

			const receipt = await waitForTransactionReceipt(retrieveConfig(), {
				chainId: chainId,
				timeout: 15 * 60 * 1000, // Polygon can be very, VERY, slow. 15mn timeout just to be sure
				hash
			});

			if (receipt.status === 'success') {
				const currentTimestamp = Math.floor(Date.now() / 1000);
				await addNotification({
					from: receipt.from,
					fromAddress: isZeroAddress(latestQuote.action.fromToken.address)
						? ETH_TOKEN_ADDRESS
						: toAddress(latestQuote.action.fromToken.address),
					fromChainId: latestQuote.action.fromChainId,
					fromTokenName: latestQuote.action.fromToken.symbol,
					fromAmount: formatTAmount({
						value: toBigInt(latestQuote.action.fromAmount),
						decimals: latestQuote.action.fromToken.decimals
					}),
					toAddress: toAddress(latestQuote.action.toToken.address),
					toChainId: latestQuote.action.toChainId,
					toTokenName: latestQuote.action.toToken.symbol,
					timeFinished: currentTimestamp + latestQuote.estimate.executionDuration,
					status: 'pending', // tx is pending until funds are received on the destination chain
					type: 'lifi',
					blockNumber: receipt.blockNumber,
					txHash: receipt.transactionHash,
					safeTxHash: undefined
				});

				return {isSuccessful: true, receipt: receipt};
			}
			return {isSuccessful: false, receipt: receipt};
		} catch (error) {
			console.error(error);
			return {isSuccessful: false};
		}
	}, [addNotification, inputAsset.token, isBridgeNeeded, latestQuote, outputTokenAddress, plausible, provider]);

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
		onExecuteForGnosis: async (): Promise<void> => undefined, // TODO: add
		onApprove
	};
};
