import {useCallback, useMemo, useState} from 'react';
import {encodeFunctionData, erc20Abi, isHex, parseAbi} from 'viem';
import {useWeb3} from '@builtbymom/web3/contexts/useWeb3';
import {useAsyncTrigger} from '@builtbymom/web3/hooks/useAsyncTrigger';
import {
	assert,
	isEthAddress,
	MAX_UINT_256,
	toAddress,
	toBigInt,
	toNormalizedBN,
	zeroNormalizedBN
} from '@builtbymom/web3/utils';
import {approveERC20, defaultTxStatus, retrieveConfig, toWagmiProvider} from '@builtbymom/web3/utils/wagmi';
import {getContractCallsQuote, getRoutes} from '@lifi/sdk';
import {readContract, sendTransaction, waitForTransactionReceipt} from '@wagmi/core';

import type {TAddress, TNormalizedBN, TToken} from '@builtbymom/web3/types';
import type {TTxResponse} from '@builtbymom/web3/utils/wagmi';
import type {TSolverContextBase} from '@lib/contexts/useSolver.types';
import type {TTokenAmountInputElement} from '@lib/types/utils';
import type {ContractCallsQuoteRequest, LiFiStep, RoutesRequest} from '@lifi/sdk';

export const useLifiSolver = (
	inputAsset: TTokenAmountInputElement,
	outputTokenAddress: TAddress | undefined,
	outputTokenChainId: number | undefined,
	outputVaultAsset: TToken | undefined,

	isBridgeNeeded: boolean
): TSolverContextBase<LiFiStep | null> => {
	const {address, provider} = useWeb3();
	const [approvalStatus, set_approvalStatus] = useState(defaultTxStatus);
	const [depositStatus, set_depositStatus] = useState(defaultTxStatus);
	const [allowance, set_allowance] = useState<TNormalizedBN>(zeroNormalizedBN);
	const [isFetchingAllowance, set_isFetchingAllowance] = useState(false);
	const [latestQuote, set_latestQuote] = useState<LiFiStep>();
	const [isFetchingQuote, set_isFetchingQuote] = useState(false);
	const spendAmount = inputAsset.normalizedBigAmount?.raw ?? 0n;
	const isAboveAllowance = allowance.raw >= spendAmount;

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

		const config = {
			fromChain: inputAsset.token.chainID,
			toChain: outputTokenChainId,
			fromToken: inputAsset.token.address,
			amount: spendAmount.toString(),
			vaultAddress: outputTokenAddress,
			vaultAsset: outputVaultAsset?.address,
			depositGas: '100000',
			depositContractAbi: ['function deposit(uint amount, address to) external']
		};

		set_isFetchingQuote(true);

		const depositTxData = encodeFunctionData({
			abi: parseAbi(config.depositContractAbi),
			functionName: 'deposit',
			args: [config.amount, address]
		});

		const routesRequest: RoutesRequest = {
			fromChainId: inputAsset.token.chainID,
			toChainId: outputTokenChainId,
			fromTokenAddress: inputAsset.token.address,
			toTokenAddress: outputVaultAsset?.address,
			fromAmount: spendAmount.toString()
		};

		const contractCallsQuoteRequest: ContractCallsQuoteRequest = {
			fromChain: config.fromChain,
			fromToken: config.fromToken,
			fromAddress: toAddress(address),
			toChain: config.toChain,
			toToken: config.vaultAsset,
			toAmount: config.amount,
			contractCalls: [
				{
					fromAmount: config.amount,
					fromTokenAddress: config.vaultAsset,
					toContractAddress: config.vaultAddress,
					toContractCallData: depositTxData,
					toContractGasLimit: config.depositGas
				}
			]
		};

		try {
			const allRoutes = await getRoutes(routesRequest);
			const recommendedRoute = allRoutes.routes.find(route => route.tags?.includes('RECOMMENDED'));

			const contactCallsQuoteResponse = await getContractCallsQuote({
				...contractCallsQuoteRequest,
				contractCalls: [
					{
						...contractCallsQuoteRequest.contractCalls[0],
						fromAmount: recommendedRoute?.toAmount || spendAmount.toString()
					}
				],
				toAmount: spendAmount.toString()
			});

			if (contactCallsQuoteResponse) {
				set_latestQuote(contactCallsQuoteResponse);
				set_isFetchingQuote(false);
				return contactCallsQuoteResponse;
			}
		} catch (e) {
			set_latestQuote(undefined);
			console.error(e);
		}
		set_isFetchingQuote(false);
		return null;
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

			const {value, to, data, gasLimit, gasPrice} = latestQuote?.transactionRequest || {};
			const wagmiProvider = await toWagmiProvider(provider);

			assert(isHex(data), 'Data is not hex');
			assert(wagmiProvider.walletClient, 'Wallet client is not set');
			const hash = await sendTransaction(retrieveConfig(), {
				value: toBigInt(value ?? 0),
				to: toAddress(to),
				data,
				gas: gasLimit ? BigInt(gasLimit as string) : undefined,
				gasPrice: gasPrice ? BigInt(gasPrice as string) : undefined
			});

			const receipt = await waitForTransactionReceipt(retrieveConfig(), {
				chainId: wagmiProvider.chainId,
				hash
			});

			if (receipt.status === 'success') {
				return {isSuccessful: true, receipt: receipt};
			}
			return {isSuccessful: false};
		} catch (error) {
			console.error(error);
			return {isSuccessful: false};
		}
	}, [inputAsset.token, latestQuote, outputTokenAddress, provider]);

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
