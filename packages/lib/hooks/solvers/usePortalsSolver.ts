import {useCallback, useMemo, useState} from 'react';
import toast from 'react-hot-toast';
import {zeroAddress} from 'viem';
import {useBlockNumber} from 'wagmi';
import useWallet from '@builtbymom/web3/contexts/useWallet';
import {useWeb3} from '@builtbymom/web3/contexts/useWeb3';
import {useApprove} from '@builtbymom/web3/hooks/useApprove';
import {useAsyncTrigger} from '@builtbymom/web3/hooks/useAsyncTrigger';
import {
	ETH_TOKEN_ADDRESS,
	formatTAmount,
	isEthAddress,
	isZeroAddress,
	toAddress,
	toBigInt
} from '@builtbymom/web3/utils';
import {useNotifications} from '@lib/contexts/useNotifications';
import {
	getPortalsApproval,
	PORTALS_NETWORK,
	type TPortalsApproval,
	type TPortalsEstimate
} from '@lib/utils/api.portals';

import {usePortals} from '../usePortals.temp';

import type {Hex, TransactionReceipt} from 'viem';
import type {TAddress} from '@builtbymom/web3/types';
import type {TSolverContextBase} from '@lib/contexts/useSolver.types';
import type {TTokenAmountInputElement} from '@lib/types/utils';

export const usePortalsSolver = (
	inputAsset: TTokenAmountInputElement,
	outputTokenAddress: TAddress | undefined,
	isZapNeeded: boolean,
	isBridgeNeeded: boolean,
	slippage: string = '1',
	deadline: number = 60,
	withPermit: boolean = true
): TSolverContextBase<TPortalsEstimate | null> => {
	const {address, provider} = useWeb3();

	const {addNotification} = useNotifications();
	const {getToken} = useWallet();
	const {data: blockNumber} = useBlockNumber();

	const [approveCtx, set_approveCtx] = useState<TPortalsApproval>();

	/**********************************************************************************************
	 ** It's important not to make extra fetches. For this solver we should disable quote and
	 ** allowance fetches in 4 cases:
	 ** 1. No token selected
	 ** 2. Input amount is either undefined or zero
	 ** 3. Zap is not needed for this configuration
	 ** 4. Bridge is needed for this configuration
	 *********************************************************************************************/
	const isDisabled = useMemo(() => {
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
		disabled: isDisabled
	});

	const {onExecuteDeposit, onRetrieveQuote, latestQuote, isFetchingQuote, isDepositing} = usePortals({
		inputAsset,
		outputTokenAddress,
		slippage,
		permitSignature,
		onClearPermit,
		disabled: isDisabled
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
		if (isDisabled) {
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
		isDisabled,
		inputAsset.token,
		inputAsset.normalizedBigAmount.raw,
		approveCtx?.context.target,
		outputTokenAddress,
		address
	]);

	const onDepositSuccessForSolver = useCallback(
		(receipt: TransactionReceipt) => {
			if (!latestQuote || !inputAsset.token || !outputTokenAddress) {
				return;
			}

			const commonNotificationParams = {
				from: toAddress(address),
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
				timeFinished: Date.now() / 1000
			};

			// A way to identify safe deposit
			if (receipt.blockHash === '0x0') {
				addNotification({
					...commonNotificationParams,
					status: 'pending',
					type: 'portals gnosis',
					blockNumber: blockNumber || 0n,
					safeTxHash: receipt.transactionHash as Hex,
					txHash: undefined
				});
			} else {
				addNotification({
					...commonNotificationParams,
					status: 'success',
					type: 'portals',
					blockNumber: receipt.blockNumber,
					safeTxHash: undefined,
					txHash: receipt.transactionHash
				});
			}
		},
		[addNotification, address, blockNumber, getToken, inputAsset.token, latestQuote, outputTokenAddress]
	);

	const onDepositFailureForSolver = (error?: string): void => {
		if (!error) {
			return;
		}
		toast.error(error);
	};

	useAsyncTrigger(async (): Promise<void> => {
		if (isDisabled) {
			return;
		}

		onRetrieveQuote();
	}, [isDisabled, onRetrieveQuote]);

	return {
		quote: latestQuote || null,
		allowance: amountApproved,
		//todo: add to lib
		isFetchingAllowance: false,
		isApproved,
		isFetchingQuote,
		isApproving,
		isDepositing,
		onExecuteDeposit,
		onDepositSuccessForSolver,
		onDepositFailureForSolver,
		onExecuteWithdraw: onExecuteDeposit, //Deposit and withdraw are the same for Portals
		onApprove
	};
};
