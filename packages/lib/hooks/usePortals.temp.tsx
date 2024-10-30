import {useCallback, useState} from 'react';
import {BaseError, isHex, zeroAddress} from 'viem';
import {useBlockNumber} from 'wagmi';
import {useWeb3} from '@builtbymom/web3/contexts/useWeb3';
import {assert, isEthAddress, isZeroAddress, toAddress, toBigInt, zeroNormalizedBN} from '@builtbymom/web3/utils';
import {retrieveConfig, toWagmiProvider, type TTxResponse} from '@builtbymom/web3/utils/wagmi';
import {useSafeAppsSDK} from '@gnosis.pm/safe-apps-react-sdk';
import {sendTransaction, switchChain, waitForTransactionReceipt} from '@wagmi/core';
import {getPortalsTx, getQuote, PORTALS_NETWORK, type TPortalsEstimate} from '@lib/utils/api.portals';
import {getApproveTransaction} from '@lib/utils/tools.gnosis';

import {isValidPortalsErrorObject} from './helpers/isValidPortalsErrorObject';
import {useGetIsStablecoin} from './helpers/useGetIsStablecoin';

import type {Hex, TransactionReceipt} from 'viem';
import type {TPermitSignature} from '@builtbymom/web3/hooks/usePermit.types';
import type {TAddress} from '@builtbymom/web3/types';
import type {BaseTransaction} from '@gnosis.pm/safe-apps-sdk';
import type {TInitSolverArgs} from '@lib/types/solvers';
import type {TTokenAmountInputElement} from '@lib/types/utils';

export const usePortals = ({
	inputAsset,
	outputTokenAddress,
	slippage,
	permitSignature,
	onClearPermit,
	disabled = false
}: {
	inputAsset: TTokenAmountInputElement;
	outputTokenAddress: TAddress | undefined;
	slippage: string;
	permitSignature: TPermitSignature | undefined;
	onClearPermit: () => void;
	disabled?: boolean;
}): {
	onExecuteDeposit: (
		onSuccess: (receipt: TransactionReceipt) => void,
		onFailure?: (errorMessage?: string) => void
	) => Promise<boolean>;
	onRetrieveQuote: () => Promise<TPortalsEstimate | undefined>;
	latestQuote: TPortalsEstimate | undefined;
	isFetchingQuote: boolean;
	isDepositing: boolean;
} => {
	const {address, provider, isWalletSafe} = useWeb3();
	const {sdk} = useSafeAppsSDK();
	const {data: blockNumber} = useBlockNumber();

	const [latestQuote, set_latestQuote] = useState<TPortalsEstimate>();

	const [isFetchingQuote, set_isFetchingQuote] = useState(false);
	const {getIsStablecoin} = useGetIsStablecoin();
	const [isDepositing, set_isDepositing] = useState(false);

	const onRetrieveQuote = useCallback(async () => {
		if (
			!inputAsset.token ||
			!outputTokenAddress ||
			inputAsset.normalizedBigAmount === zeroNormalizedBN ||
			disabled
		) {
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
	}, [inputAsset.token, inputAsset.normalizedBigAmount, outputTokenAddress, disabled, address, getIsStablecoin]);

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
				return {isSuccessful: true, receipt: receipt};
			}
			console.error('Fail to perform transaction');
			return {isSuccessful: false};
		} catch (error) {
			console.error(error);
			let errorMessage;
			if (isValidPortalsErrorObject(error)) {
				errorMessage = error.response.data.message;

				console.error(errorMessage);
			} else {
				console.error(error);
			}

			return {isSuccessful: false, error: errorMessage};
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
		onClearPermit
	]);

	const onExecuteForGnosis = useCallback(async (): Promise<TTxResponse> => {
		assert(provider, 'Provider is not set');
		assert(latestQuote, 'Quote is not set');
		assert(inputAsset.token, 'Input token is not set');
		assert(outputTokenAddress, 'Output token is not set');

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

			return {
				isSuccessful: true,
				receipt: {
					transactionHash: res.safeTxHash as Hex,
					transactionIndex: -1, // Placeholder since Safe tx doesn't have these
					blockHash: '0x0', // Placeholder since Safe tx doesn't have these
					blockNumber: blockNumber || 0n,
					contractAddress: null,
					cumulativeGasUsed: 0n, // Placeholder since Safe tx doesn't have these
					effectiveGasPrice: 0n, // Placeholder since Safe tx doesn't have these
					from: toAddress(address),
					gasUsed: 0n, // Placeholder since Safe tx doesn't have these
					logs: [], // Placeholder since Safe tx doesn't have these
					logsBloom: '0x0', // Placeholder since Safe tx doesn't have these
					status: 'success',
					to: toAddress(to),
					type: 'legacy' // Placeholder since Safe tx doesn't have these
				}
			};
		} catch (error) {
			console.error(error);
			return {isSuccessful: false, error: error};
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
		sdk.txs,
		blockNumber,
		permitSignature,
		onClearPermit
	]);

	/**********************************************************************************************
	 * This execute function is not an actual deposit/withdraw, but a swap using the Portals
	 * solver. The deposit will be executed by the Portals solver by simply swapping the input token
	 * for the output token.
	 *********************************************************************************************/
	const onExecuteDeposit = useCallback(
		async (
			onSuccess: (receipt: TransactionReceipt) => void,
			onFailure?: (errorMessage?: string) => void
		): Promise<boolean> => {
			assert(provider, 'Provider is not set');
			set_isDepositing(true);
			let status;
			if (isWalletSafe) {
				status = await onExecuteForGnosis();
			} else {
				status = await execute();
			}

			if (status.isSuccessful && status.receipt) {
				onSuccess(status.receipt);
			} else {
				const errorMessage =
					(status.error as BaseError)?.message ||
					(status.error as BaseError)?.shortMessage ||
					(status.error as BaseError)?.details;
				onFailure?.(errorMessage || 'Unknown Error');
			}

			set_isDepositing(false);
			return status.isSuccessful;
		},
		[execute, isWalletSafe, onExecuteForGnosis, provider]
	);

	return {onExecuteDeposit, onRetrieveQuote, isFetchingQuote, isDepositing, latestQuote};
};
