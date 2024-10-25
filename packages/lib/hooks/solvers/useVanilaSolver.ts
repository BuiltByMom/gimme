import {useCallback, useMemo, useState} from 'react';
import toast from 'react-hot-toast';
import {usePlausible} from 'next-plausible';
import {encodeFunctionData} from 'viem';
import {useWeb3} from '@builtbymom/web3/contexts/useWeb3';
import {useApprove} from '@builtbymom/web3/hooks/useApprove';
import {assert, isAddress, toAddress, toBigInt} from '@builtbymom/web3/utils';
import {defaultTxStatus} from '@builtbymom/web3/utils/wagmi';
import {useSafeAppsSDK} from '@gnosis.pm/safe-apps-react-sdk';
import {TransactionStatus} from '@gnosis.pm/safe-apps-sdk';
import {useNotifications} from '@lib/contexts/useNotifications';
import {YEARN_4626_ROUTER_ABI} from '@lib/utils/abi/yearn4626Router.abi';
import {deposit, depositViaRouter, redeemV3Shares, withdrawShares} from '@lib/utils/actions';
import {PLAUSIBLE_EVENTS} from '@lib/utils/plausible';
import {CHAINS} from '@lib/utils/tools.chains';
import {getApproveTransaction, getDepositTransaction} from '@lib/utils/tools.gnosis';

import type {BaseError} from 'viem';
import type {TTxResponse, TTxStatus} from '@builtbymom/web3/utils/wagmi';
import type {TSolverContextBase} from '@lib/contexts/useSolver.types';
import type {TTokenAmountInputElement} from '@lib/types/utils';
import type {TYDaemonVault} from '@yearn-finance/web-lib/utils/schemas/yDaemonVaultsSchemas';

export const useVanilaSolver = (
	inputAsset: TTokenAmountInputElement,
	vault: TYDaemonVault | undefined,
	isZapNeeded: boolean,
	contextActions: 'DEPOSIT' | 'WITHDRAW',
	deadline: number = 60,
	withPermit: boolean = true
): TSolverContextBase<null> => {
	const plausible = usePlausible();
	const {provider, address} = useWeb3();
	const {sdk} = useSafeAppsSDK();
	const [depositStatus, set_depositStatus] = useState<TTxStatus>(defaultTxStatus);
	const [withdrawStatus, set_withdrawStatus] = useState<TTxStatus>(defaultTxStatus);

	const {addNotification} = useNotifications();

	const shouldDisableFetches =
		!inputAsset.amount || !vault?.address || !inputAsset.token || isZapNeeded || contextActions === 'WITHDRAW';
	/**********************************************************************************************
	 ** The isV3Vault hook is used to determine if the current vault is a V3 vault. It's very
	 ** important to know if the vault is a V3 vault because the deposit and withdraw functions
	 ** are different for V3 vaults, and only V3 vaults support the permit signature.
	 *********************************************************************************************/
	const isV3Vault = useMemo(() => vault?.version?.split('.')?.[0] === '3', [vault?.version]);

	/**********************************************************************************************
	 ** The isLegacyVault is used to determine if the current vault is a legacy vault.
	 **
	 ** @returns isLegacyVault: boolean - Whether the vault is a legacy vault or not.
	 *********************************************************************************************/
	const isLegacyVault = useMemo(() => vault?.kind === 'Legacy', [vault?.kind]);

	/**********************************************************************************************
	 ** The yRouter is the yearn router address for the current chain. If so, we
	 ** can use the permit signature flow for the deposit function.
	 **
	 ** @returns yRouter: TAddress - The yearn router address for the current chain.
	 *********************************************************************************************/
	const yRouter = useMemo(() => toAddress(CHAINS[vault?.chainID || 0]?.yearnRouterAddress), [vault?.chainID]);

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
		chainID: inputAsset?.token?.chainID || 0,
		tokenToApprove: toAddress(inputAsset.token?.address),
		spender: isV3Vault && isAddress(yRouter) ? yRouter : toAddress(vault?.address),
		owner: toAddress(address),
		amountToApprove: toBigInt(inputAsset.normalizedBigAmount?.raw || 0n),
		shouldUsePermit: isV3Vault && isAddress(yRouter) && !isLegacyVault && withPermit,
		deadline,
		disabled: shouldDisableFetches
	});

	/**********************************************************************************************
	 ** Trigger a deposit web3 action, simply trying to deposit `amount` tokens to
	 ** the selected vault.
	 *********************************************************************************************/
	const onExecuteDeposit = useCallback(
		async (onSuccess: () => void): Promise<void> => {
			assert(vault?.address, 'Output token is not set');
			assert(inputAsset.token?.address, 'Input amount is not set');
			set_depositStatus({...defaultTxStatus, pending: true});

			let result: TTxResponse | undefined = undefined;
			try {
				if (permitSignature) {
					result = await depositViaRouter({
						connector: provider,
						statusHandler: set_depositStatus,
						chainID: inputAsset.token?.chainID,
						contractAddress: toAddress(CHAINS[inputAsset.token.chainID].yearnRouterAddress),
						amount: toBigInt(inputAsset.normalizedBigAmount.raw),
						token: toAddress(inputAsset.token.address),
						vault: toAddress(vault?.address),
						permitCalldata: encodeFunctionData({
							abi: YEARN_4626_ROUTER_ABI,
							functionName: 'selfPermit',
							args: [
								toAddress(inputAsset.token.address),
								toBigInt(inputAsset.normalizedBigAmount.raw),
								permitSignature.deadline,
								permitSignature.v,
								permitSignature.r,
								permitSignature.s
							]
						})
					});
				} else {
					result = await deposit({
						connector: provider,
						chainID: inputAsset.token?.chainID,
						contractAddress: toAddress(vault?.address),
						amount: toBigInt(inputAsset?.normalizedBigAmount?.raw),
						statusHandler: set_depositStatus
					});
				}

				if (result.isSuccessful) {
					plausible(PLAUSIBLE_EVENTS.DEPOSIT, {
						props: {
							vaultAddress: toAddress(vault?.address),
							vaultName: vault?.name,
							vaultChainID: vault?.chainID,
							tokenAddress: toAddress(inputAsset.token.address),
							tokenName: inputAsset.token.name,
							isSwap: isZapNeeded,
							tokenAmount: inputAsset.normalizedBigAmount.normalized.toString(),
							action: `Deposit ${inputAsset.normalizedBigAmount.normalized.toString()} ${inputAsset.token.symbol} -> ${vault.token.symbol} on chain ${inputAsset.token.chainID}`
						}
					});
					await addNotification({
						from: toAddress(address),
						fromAddress: toAddress(inputAsset.token.address),
						fromChainId: inputAsset.token.chainID,
						fromTokenName: inputAsset.token.symbol,
						fromAmount: inputAsset.normalizedBigAmount.normalized.toString(),
						toAddress: toAddress(vault?.address),
						toChainId: inputAsset.token.chainID,
						toTokenName: vault.token.symbol,
						status: 'success',
						type: 'vanila',
						timeFinished: Date.now() / 1000,
						blockNumber: result.receipt?.blockNumber || 0n,
						safeTxHash: undefined,
						txHash: result.receipt?.transactionHash
					});

					onSuccess();
					set_depositStatus({...defaultTxStatus, success: true});

					return;
				}
				set_depositStatus({...defaultTxStatus, error: true});
			} catch (error) {
				toast.error((error as BaseError).shortMessage || 'An error occured while creating your transaction!');
				console.error(error);
			} finally {
				if (permitSignature) {
					onClearPermit();
				}
			}
		},
		[
			vault?.address,
			vault?.name,
			vault?.chainID,
			vault?.token?.symbol,
			inputAsset?.token?.address,
			inputAsset?.token?.chainID,
			inputAsset?.token?.name,
			inputAsset?.token?.symbol,
			inputAsset.normalizedBigAmount.raw,
			inputAsset.normalizedBigAmount.normalized,
			permitSignature,
			provider,
			plausible,
			isZapNeeded,
			addNotification,
			address,
			onClearPermit
		]
	);

	/*********************************************************************************************
	 ** Trigger a withdraw web3 action using the vault contract to take back some underlying token
	 ** from this specific vault.
	 *********************************************************************************************/
	const onExecuteWithdraw = useCallback(
		async (onSuccess: () => void): Promise<void> => {
			assert(inputAsset.token, 'Input token is not set');
			assert(inputAsset.amount, 'Input amount is not set');
			assert(vault, 'Vault not found');
			set_withdrawStatus({...defaultTxStatus, pending: true});

			let result;
			if (isV3Vault) {
				result = await redeemV3Shares({
					connector: provider,
					chainID: vault.chainID,
					contractAddress: vault.address,
					amount: inputAsset.normalizedBigAmount.raw,
					maxLoss: 1n
				});
			} else {
				result = await withdrawShares({
					connector: provider,
					chainID: vault.chainID,
					contractAddress: vault.address,
					amount: inputAsset.normalizedBigAmount.raw
				});
			}

			if (result.isSuccessful) {
				onSuccess();
				set_withdrawStatus({...defaultTxStatus, success: true});
				return;
			}
			set_withdrawStatus({...defaultTxStatus, error: true});
		},
		[inputAsset.amount, inputAsset.normalizedBigAmount.raw, inputAsset.token, isV3Vault, provider, vault]
	);

	/*********************************************************************************************
	 ** TODO: What
	 *********************************************************************************************/
	const onDepositForGnosis = useCallback(
		async (onSuccess: () => void): Promise<void> => {
			const approveTransactionForBatch = getApproveTransaction(
				toBigInt(inputAsset.normalizedBigAmount?.raw).toString(),
				toAddress(inputAsset.token?.address),
				toAddress(vault?.address)
			);

			const depositTransactionForBatch = getDepositTransaction(
				toAddress(vault?.address),
				toBigInt(inputAsset.normalizedBigAmount?.raw).toString(),
				toAddress(address)
			);

			set_depositStatus({...defaultTxStatus, pending: true});

			try {
				const res = await sdk.txs.send({txs: [approveTransactionForBatch, depositTransactionForBatch]});
				let result;
				do {
					if (
						result?.txStatus === TransactionStatus.CANCELLED ||
						result?.txStatus === TransactionStatus.FAILED
					) {
						throw new Error('An error occured while creating your transaction!');
					}

					result = await sdk.txs.getBySafeTxHash(res.safeTxHash);
					await new Promise(resolve => setTimeout(resolve, 30_000));
				} while (
					result.txStatus !== 'SUCCESS' &&
					result.txStatus !== 'FAILED' &&
					result.txStatus !== 'CANCELLED'
				);

				set_depositStatus({...defaultTxStatus, success: result?.txStatus === 'SUCCESS'});
				if (result?.txStatus === 'SUCCESS') {
					onSuccess?.();
				}
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
			inputAsset.normalizedBigAmount?.raw,
			inputAsset.token?.address,
			vault?.address,
			address,
			sdk.txs,
			permitSignature,
			onClearPermit
		]
	);

	return {
		quote: null,
		allowance: amountApproved,
		isFetchingAllowance: false,
		isApproved,
		isFetchingQuote: false,
		approvalStatus: {...defaultTxStatus, pending: isApproving ? true : defaultTxStatus.pending},
		depositStatus,
		withdrawStatus,
		set_depositStatus,
		set_withdrawStatus,
		onExecuteDeposit,
		onExecuteWithdraw,
		onExecuteForGnosis: onDepositForGnosis,
		onApprove
	};
};
