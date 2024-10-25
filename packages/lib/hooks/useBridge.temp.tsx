import {useCallback, useRef, useState} from 'react';
import {BaseError, encodeFunctionData, erc20Abi, isHex, parseAbi} from 'viem';
import {serialize} from 'wagmi';
import {useWeb3} from '@builtbymom/web3/contexts/useWeb3';
import {assert, isEthAddress, toAddress, toBigInt, ZERO_ADDRESS} from '@builtbymom/web3/utils';
import {
	defaultTxStatus,
	retrieveConfig,
	toWagmiProvider,
	type TTxResponse,
	type TTxStatus
} from '@builtbymom/web3/utils/wagmi';
import {getContractCallsQuote, getQuote} from '@lifi/sdk';
import {sendTransaction, switchChain, waitForTransactionReceipt} from '@wagmi/core';
import {createUniqueID} from '@lib/utils/tools.identifiers';

import type {TransactionReceipt} from 'viem';
import type {TAddress, TToken} from '@builtbymom/web3/types';
import type {TTokenAmountInputElement} from '@lib/types/utils';
import type {ContractCallsQuoteRequest, LiFiStep, QuoteRequest} from '@lifi/sdk';

export const useBridge = (
	inputAsset: TTokenAmountInputElement,
	outputTokenAddress: TAddress | undefined,
	outputTokenChainId: number | undefined,
	outputVaultAsset: TToken | undefined
): {
	onExecuteDeposit: (onSuccess: () => void, onFailure?: (errorMessage?: string) => void) => Promise<void>;
	onRetrieveQuote: () => Promise<void>;
	isFetchingQuote: boolean;
	depositStatus: TTxStatus;
	set_depositStatus: (status: TTxStatus) => void;
	latestQuote: LiFiStep | undefined;
} => {
	const uniqueIdentifier = useRef<string | undefined>(undefined);
	const spendAmount = inputAsset.normalizedBigAmount?.raw ?? 0n;
	const {address, provider} = useWeb3();

	const [isFetchingQuote, set_isFetchingQuote] = useState(false);
	const [latestQuote, set_latestQuote] = useState<LiFiStep>();

	const [depositStatus, set_depositStatus] = useState(defaultTxStatus);

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
					// toast.error(error.shortMessage);
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

			const receipt = await waitForTransactionReceipt(retrieveConfig(), {
				chainId: chainId,
				timeout: 15 * 60 * 1000, // Polygon can be very, VERY, slow. 15mn timeout just to be sure
				hash
			});

			if (receipt.status === 'success') {
				return {isSuccessful: true, receipt: receipt};
			}
			return {isSuccessful: false, receipt: receipt};
		} catch (error) {
			console.error(error);
			return {isSuccessful: false};
		}
	}, [inputAsset.token, latestQuote, outputTokenAddress, provider]);

	const onExecuteDeposit = useCallback(
		async (
			onSuccess: (receipt: TransactionReceipt) => void,
			onFailure?: (errorMessage?: string) => void
		): Promise<void> => {
			assert(provider, 'Provider is not set');

			set_depositStatus({...defaultTxStatus, pending: true});
			const status = await execute();
			if (status.isSuccessful && status.receipt) {
				set_depositStatus({...defaultTxStatus, success: true});
				onSuccess(status.receipt);
			} else {
				set_depositStatus({...defaultTxStatus, error: true});
				const errorMessage =
					(status.error as BaseError).message ||
					(status.error as BaseError).shortMessage ||
					(status.error as BaseError).details;
				onFailure?.(errorMessage);
			}
		},
		[execute, provider]
	);
	return {onExecuteDeposit, onRetrieveQuote, isFetchingQuote, depositStatus, set_depositStatus, latestQuote};
};
