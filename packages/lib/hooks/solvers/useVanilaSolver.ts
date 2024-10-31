import {useCallback, useMemo} from 'react';
import toast from 'react-hot-toast';
import {usePlausible} from 'next-plausible';
import {useWeb3} from '@builtbymom/web3/contexts/useWeb3';
import {useApprove} from '@builtbymom/web3/hooks/useApprove';
import {useVaultDeposit} from '@builtbymom/web3/hooks/useDeposit';
import {useVaultWithdraw} from '@builtbymom/web3/hooks/useWithdraw';
import {isAddress, toAddress, toBigInt} from '@builtbymom/web3/utils';
import {useNotifications} from '@lib/contexts/useNotifications';
import {PLAUSIBLE_EVENTS} from '@lib/utils/plausible';
import {CHAINS} from '@lib/utils/tools.chains';

import type {TransactionReceipt} from 'viem';
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
	const {isApproved, isApproving, onApprove, amountApproved, permitSignature, isLoading} = useApprove({
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
	 ** The useVaultDeposit hook is used to deposit the token to the vault. It supports both V3
	 ** and legacy vaults and will work with the yRouters if a signature is provided.
	 **
	 ** @returns canDeposit: boolean - Whether the user can deposit the token (no allowance or
	 **			 balance checks are done here).
	 ** @returns isDepositing: boolean - Whether the deposit is in progress.
	 ** @returns onDeposit: () => void - Function to deposit the token.
	 ** @returns maxDepositForUser: bigint - The maximum amount the user can deposit.
	 *********************************************************************************************/
	const {isDepositing, onDeposit} = useVaultDeposit({
		chainID: inputAsset.token?.chainID || 0,
		tokenToDeposit: toAddress(inputAsset.token?.address),
		vault: toAddress(vault?.address),
		owner: toAddress(address),
		amountToDeposit: toBigInt(inputAsset.normalizedBigAmount?.raw || 0n),
		disabled: shouldDisableFetches,
		...(isV3Vault
			? {
					version: 'ERC-4626',
					options: {
						useRouter:
							!isLegacyVault && isAddress(toAddress(CHAINS[vault?.chainID || 0]?.yearnRouterAddress)),
						routerAddress: toAddress(CHAINS[vault?.chainID || 0]?.yearnRouterAddress),
						minOutSlippage: 10n,
						permitSignature
					}
				}
			: {version: 'LEGACY'})
	});

	const onDepositSuccessForSolver = useCallback(
		(receipt: TransactionReceipt) => {
			if (!inputAsset.token || !vault) {
				return;
			}
			plausible(PLAUSIBLE_EVENTS.DEPOSIT, {
				props: {
					vaultAddress: toAddress(vault?.address),
					vaultName: vault?.name,
					vaultChainID: vault?.chainID,
					tokenAddress: toAddress(inputAsset.token?.address),
					tokenName: inputAsset.token?.name,
					isSwap: isZapNeeded,
					tokenAmount: inputAsset.normalizedBigAmount.normalized.toString(),
					action: `Deposit ${inputAsset.normalizedBigAmount.normalized.toString()} ${inputAsset.token.symbol} -> ${vault.token.symbol} on chain ${inputAsset.token.chainID}`
				}
			});
			addNotification({
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
				blockNumber: receipt?.blockNumber || 0n,
				safeTxHash: undefined,
				txHash: receipt?.transactionHash
			});
		},
		[
			addNotification,
			address,
			inputAsset.normalizedBigAmount.normalized,
			inputAsset.token,
			isZapNeeded,
			plausible,
			vault
		]
	);

	const onDepositFailureForSolver = (error?: string): void => {
		if (!error) {
			return;
		}
		toast.error(error);
	};

	/**********************************************************************************************
	 ** The useVaultWithdraw hook is used to withdraw the token from the vault. It supports both V3
	 ** and legacy.
	 **
	 ** @returns maxWithdrawForUser: bigint - The maximum amount that can be withdrawn by the user.
	 **          This is exprimed in underlying token, so this means this is a shortcut for
	 **          `vault.convertToAsset(vault.balanceOf(owner))`.
	 ** @returns isWithdrawing: boolean - If the approval is in progress.
	 ** @returns onWithdraw: () => void - Function to withdraw the token.
	 *********************************************************************************************/
	const {isWithdrawing, onWithdraw} = useVaultWithdraw({
		chainID: vault?.chainID || 0,
		tokenToWithdraw: toAddress(inputAsset.token?.address),
		vault: toAddress(vault?.address),
		owner: toAddress(address),
		amountToWithdraw: toBigInt(inputAsset.normalizedBigAmount?.raw || 0n),
		disabled: false,
		redeemTolerance: 1n,
		...(isV3Vault ? {version: 'ERC-4626', minOutSlippage: 1n} : {version: 'LEGACY'})
	});

	return {
		quote: null,
		allowance: amountApproved,
		isFetchingAllowance: isLoading,
		isApproved,
		isFetchingQuote: false,
		isApproving,
		isDepositing,
		isWithdrawing,
		onExecuteDeposit: onDeposit,
		onExecuteWithdraw: onWithdraw,
		onDepositFailureForSolver,
		onDepositSuccessForSolver,
		onApprove
	};
};
