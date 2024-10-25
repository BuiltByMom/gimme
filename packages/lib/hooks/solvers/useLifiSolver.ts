import {useCallback, useMemo} from 'react';
import toast from 'react-hot-toast';
import {usePlausible} from 'next-plausible';
import {useWeb3} from '@builtbymom/web3/contexts/useWeb3';
import {useApprove} from '@builtbymom/web3/hooks/useApprove';
import {useAsyncTrigger} from '@builtbymom/web3/hooks/useAsyncTrigger';
import {ETH_TOKEN_ADDRESS, formatTAmount, isZeroAddress, toAddress, toBigInt} from '@builtbymom/web3/utils';
import {defaultTxStatus} from '@builtbymom/web3/utils/wagmi';
import {useNotifications} from '@lib/contexts/useNotifications';
import {PLAUSIBLE_EVENTS} from '@lib/utils/plausible';

import {useBridge} from '../useBridge.temp';

import type {TransactionReceipt} from 'viem';
import type {TAddress, TToken} from '@builtbymom/web3/types';
import type {TSolverContextBase} from '@lib/contexts/useSolver.types';
import type {TTokenAmountInputElement} from '@lib/types/utils';
import type {LiFiStep} from '@lifi/sdk';

//todo: check gnosis
export const useLifiSolver = (
	inputAsset: TTokenAmountInputElement,
	outputTokenAddress: TAddress | undefined,
	outputTokenChainId: number | undefined,
	outputVaultAsset: TToken | undefined,
	isBridgeNeeded: boolean
): TSolverContextBase<LiFiStep | null> => {
	const plausible = usePlausible();
	const {address, provider} = useWeb3();
	const spendAmount = inputAsset.normalizedBigAmount?.raw ?? 0n;

	const {addNotification} = useNotifications();

	const {onExecuteDeposit, onRetrieveQuote, isFetchingQuote, depositStatus, set_depositStatus, latestQuote} =
		useBridge(inputAsset, outputTokenAddress, outputTokenChainId, outputVaultAsset);

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

	const {isApproved, isApproving, onApprove, amountApproved} = useApprove({
		provider,
		chainID: inputAsset?.token?.chainID || -1,
		tokenToApprove: toAddress(inputAsset.token?.address),
		spender: toAddress(latestQuote?.estimate.approvalAddress),
		owner: toAddress(address),
		amountToApprove: spendAmount,
		shouldUsePermit: false,
		disabled: shouldDisableFetches
	});

	const onDepositSuccessForSolver = useCallback(
		(receipt: TransactionReceipt) => {
			console.log(latestQuote);
			if (!latestQuote) {
				return;
			}
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

			const currentTimestamp = Math.floor(Date.now() / 1000);
			addNotification({
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
		},
		[addNotification, isBridgeNeeded, latestQuote, plausible]
	);

	const onDepositFailureForSolver = (error?: string): void => {
		if (!error) {
			return;
		}
		toast.error(error);
	};

	useAsyncTrigger(async (): Promise<void> => {
		if (shouldDisableFetches) {
			return;
		}
		onRetrieveQuote();
	}, [onRetrieveQuote, shouldDisableFetches]);

	return {
		quote: latestQuote || null,
		allowance: amountApproved,
		//todo: add to lib
		isFetchingAllowance: false,
		isApproved,
		isFetchingQuote,
		approvalStatus: {...defaultTxStatus, pending: isApproving ? true : depositStatus.pending},
		depositStatus,
		withdrawStatus: depositStatus, //Deposit and withdraw are the same for Portals
		set_depositStatus,
		set_withdrawStatus: set_depositStatus, //Deposit and withdraw are the same for Portals
		onExecuteDeposit,
		onExecuteWithdraw: onExecuteDeposit, //Deposit and withdraw are the same for Portals
		onExecuteForGnosis: async (): Promise<void> => undefined, // TODO: add
		onDepositSuccessForSolver,
		onDepositFailureForSolver,
		onApprove
	};
};
