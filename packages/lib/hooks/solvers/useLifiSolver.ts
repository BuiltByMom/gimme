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
import {getContractCallsQuote} from '@lifi/sdk';
import {readContract, sendTransaction, waitForTransactionReceipt} from '@wagmi/core';

import type {TAddress, TNormalizedBN, TToken} from '@builtbymom/web3/types';
import type {TTxResponse} from '@builtbymom/web3/utils/wagmi';
import type {TSolverContextBase} from '@lib/contexts/useSolver.types';
import type {TTokenAmountInputElement} from '@lib/types/utils';
import type {ContractCallsQuoteRequest, LiFiStep} from '@lifi/sdk';

export const useLifiSolver = (
	inputAsset: TTokenAmountInputElement,
	outputTokenAddress: TAddress | undefined,
	outputTokenChainId: number | undefined,
	outputVaultAsset: TToken | undefined,

	isBridgeNeeded: boolean
): TSolverContextBase => {
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
		return !inputAsset.token || !inputAsset.amount || !outputTokenAddress || !isBridgeNeeded;
	}, [inputAsset.amount, inputAsset.token, isBridgeNeeded, outputTokenAddress]);

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
			amount: spendAmount.toString(), // WETH amount
			vaultAddress: outputTokenAddress,
			vaultAsset: outputVaultAsset?.address,
			depositGas: '100000', // e.g. https://polygonscan.com/tx/0xcaf0322cc1ef9e1a0d9049733752f602fb50018c15c04926ea8ecf8c7b39a022
			depositContractAbi: ['function deposit(uint amount, address to) external']
		};
		set_isFetchingQuote(true);

		const depositTxData = encodeFunctionData({
			abi: parseAbi(config.depositContractAbi),
			functionName: 'deposit',
			args: [config.amount, address]
		});

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
			const contactCallsQuoteResponse = await getContractCallsQuote(contractCallsQuoteRequest);
			if (contactCallsQuoteResponse) {
				set_latestQuote(contactCallsQuoteResponse);
				set_isFetchingQuote(false);
				return contactCallsQuoteResponse;
			}
		} catch (e) {
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
		console.log({
			chainId: outputTokenChainId,
			abi: erc20Abi,
			address: toAddress(inputAsset.token.address),
			functionName: 'allowance',
			args: [toAddress(address), toAddress(outputTokenAddress)]
		});
		const allowance = await readContract(retrieveConfig(), {
			chainId: outputTokenChainId,
			abi: erc20Abi,
			address: toAddress(inputAsset.token.address),
			functionName: 'allowance',
			args: [toAddress(address), toAddress(outputTokenAddress)]
		});

		set_isFetchingAllowance(false);

		return toNormalizedBN(allowance, inputAsset.token.decimals);
	}, [address, inputAsset.token, latestQuote, outputTokenAddress, outputTokenChainId, spendAmount]);

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

			const {value, to, data, maxFeePerGas} = latestQuote?.transactionRequest || {};
			const wagmiProvider = await toWagmiProvider(provider);

			assert(isHex(data), 'Data is not hex');
			assert(wagmiProvider.walletClient, 'Wallet client is not set');

			const hash = await sendTransaction(retrieveConfig(), {
				value: toBigInt(value ?? 0),
				to: toAddress(to),
				data,
				chainId: inputAsset.token.chainID,
				maxFeePerGas: toBigInt(maxFeePerGas)
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
