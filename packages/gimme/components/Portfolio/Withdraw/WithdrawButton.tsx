import {type ReactElement, useCallback, useMemo, useState} from 'react';
import {usePlausible} from 'next-plausible';
import useWallet from '@builtbymom/web3/contexts/useWallet';
import {useWeb3} from '@builtbymom/web3/contexts/useWeb3';
import {ETH_TOKEN_ADDRESS, isAddress, toAddress, toBigInt} from '@builtbymom/web3/utils';
import {getNetwork} from '@builtbymom/web3/utils/wagmi';
import {SuccessModal} from '@lib/common/SuccessModal';
import {useWithdrawSolver} from '@lib/contexts/useWithdrawSolver';
import {useIsZapNeeded} from '@lib/hooks/helpers/useIsZapNeeded';
import {useCurrentChain} from '@lib/hooks/useCurrentChain';
import {Button} from '@lib/primitives/Button';
import {PLAUSIBLE_EVENTS} from '@lib/utils/plausible';

export function WithdrawButton(props: {onClose: () => void}): ReactElement {
	const {configuration, onResetWithdraw} = useWithdrawSolver();
	const {isZapNeeded} = useIsZapNeeded(configuration.asset.token?.address, configuration.tokenToReceive?.address);
	const {onRefresh, getToken} = useWallet();
	const {isWalletSafe} = useWeb3();
	const {
		onExecuteWithdraw,
		onExecuteDeposit: onExecutePortalsWithdraw,
		onExecuteForGnosis: onExecuteWithdrawForGnosis,
		isApproved,
		isFetchingAllowance,
		onApprove,
		approvalStatus,
		depositStatus: portalsWithdrawStatus,
		quote,
		withdrawStatus
	} = useWithdrawSolver();
	const chain = useCurrentChain();

	const plausible = usePlausible();

	const [transactionResult, set_transactionResult] = useState<{isExecuted: boolean; message: ReactElement | null}>({
		isExecuted: false,
		message: null
	});

	/**********************************************************************************************
	 ** Once the transaction is done, we can close the modal and reset the state of the wizard.
	 *********************************************************************************************/
	const onCloseModal = useCallback(() => {
		set_transactionResult({isExecuted: false, message: null});
		onResetWithdraw();
		props.onClose();
	}, [onResetWithdraw, props]);

	/**********************************************************************************************
	 ** This message is to be displayed in success modal after successful tx
	 *********************************************************************************************/
	const getModalMessage = useCallback(() => {
		return (
			<span className={'text-pretty'}>
				{'Successfully withdrawn '}
				<span className={'text-grey-800'}>
					{configuration.asset.normalizedBigAmount.display} {configuration.asset.token?.symbol}
				</span>
				{' from '}
				{configuration.vault?.name} {'Vault'}
			</span>
		);
	}, [configuration.asset.normalizedBigAmount.display, configuration.asset.token?.symbol, configuration.vault?.name]);

	/**********************************************************************************************
	 ** After a successful transaction, this function can be called to refresh balances of the
	 ** tokens involved in the transaction (vault, asset, chain coin).
	 *********************************************************************************************/
	const onRefreshTokens = useCallback(
		(kind: 'APPROVE' | 'WITHDRAW') => {
			if (kind !== 'APPROVE') {
				set_transactionResult({
					isExecuted: true,
					message: getModalMessage()
				});
			}
			const tokensToRefresh = [];
			if (configuration.asset.token) {
				tokensToRefresh.push({
					decimals: configuration.asset.token.decimals,
					name: configuration.asset.token.name,
					symbol: configuration.asset.token.symbol,
					address: toAddress(configuration.asset.token.address),
					chainID: Number(configuration.asset.token.chainID)
				});
			}

			const vaultToken = getToken({
				address: toAddress(configuration.vault?.address),
				chainID: configuration.vault?.chainID || 137
			});
			if (isAddress(vaultToken.address)) {
				tokensToRefresh.push(vaultToken);
			}

			if (configuration.tokenToReceive) {
				tokensToRefresh.push({
					decimals: configuration.tokenToReceive.decimals,
					name: configuration.tokenToReceive.name,
					symbol: configuration.tokenToReceive.symbol,
					address: toAddress(configuration.tokenToReceive.address),
					chainID: Number(configuration.tokenToReceive.chainID)
				});
			}

			const currentChainID =
				configuration.tokenToReceive?.chainID || configuration.asset.token?.chainID || chain.id;
			const {nativeCurrency} = getNetwork(Number(currentChainID));
			if (nativeCurrency) {
				tokensToRefresh.push({
					decimals: 18,
					name: nativeCurrency.name,
					symbol: nativeCurrency.symbol,
					address: ETH_TOKEN_ADDRESS,
					chainID: Number(currentChainID)
				});
			}
			onRefresh(tokensToRefresh, false, true);
		},
		[
			configuration.asset.token,
			configuration.vault?.address,
			configuration.vault?.chainID,
			configuration.tokenToReceive,
			getToken,
			chain.id,
			onRefresh,
			getModalMessage
		]
	);

	const triggerPlausibleEvent = useCallback(() => {
		const {token} = configuration.asset;
		const {vault} = configuration;
		plausible(PLAUSIBLE_EVENTS.WITHDRAW),
			{
				props: {
					vaultAddress: toAddress(vault?.address),
					vaultName: vault?.name,
					vaultChainID: vault?.chainID,
					tokenAddress: toAddress(token?.address),
					tokenName: token?.name,
					isSwap: isZapNeeded,
					tokenAmount: configuration.asset.amount,
					action: `Withdraw ${configuration.asset.amount} ${vault?.symbol} -> ${token?.symbol} on chain ${vault?.chainID}`
				}
			};
	}, [configuration, isZapNeeded, plausible]);

	/******************************************************************************************
	 ** There are 3 cases we should handle:
	 ** 1. Gnosis Safe wallet is connected - if zap needed we should batch approve and withdraw tx
	 ** 2. Zap is not needed - execute simple withdraw
	 ** 3. Zap is needed - approve token first and use portals deposit
	 *****************************************************************************************/
	const onAction = useCallback(async () => {
		if (isWalletSafe && isZapNeeded) {
			return onExecuteWithdrawForGnosis(() => {
				triggerPlausibleEvent();
				onRefreshTokens('WITHDRAW');
			});
		}
		if (!isZapNeeded) {
			return onExecuteWithdraw(() => {
				triggerPlausibleEvent();
				onRefreshTokens('WITHDRAW');
			});
		}
		if (!isApproved) {
			return onApprove(() => onRefreshTokens('APPROVE'));
		}
		return onExecutePortalsWithdraw(() => {
			triggerPlausibleEvent();
			onRefreshTokens('WITHDRAW');
		});
	}, [
		isWalletSafe,
		isZapNeeded,
		isApproved,
		onExecutePortalsWithdraw,
		onExecuteWithdrawForGnosis,
		triggerPlausibleEvent,
		onRefreshTokens,
		onExecuteWithdraw,
		onApprove
	]);

	/******************************************************************************************
	 ** Display loader if anything is being fetched or in the process
	 *****************************************************************************************/
	const isBusy = useMemo(() => {
		return withdrawStatus.pending || isFetchingAllowance || portalsWithdrawStatus.pending || approvalStatus.pending;
	}, [approvalStatus.pending, isFetchingAllowance, portalsWithdrawStatus.pending, withdrawStatus.pending]);

	/******************************************************************************************
	 ** Disable button if:
	 ** 1. Input amount is greater than it is available to withdraw
	 ** 2. Zap is needed but quote is not fetched yet
	 ** 3. Form is not populated fully
	 *****************************************************************************************/
	const isValid = useMemo((): boolean => {
		const availableBalance = toBigInt(configuration.asset.token?.balance.raw);
		const tryingToWithdraw = toBigInt(configuration.asset.normalizedBigAmount.raw);
		if (tryingToWithdraw > availableBalance) {
			return false;
		}
		if (isZapNeeded && !quote) {
			return false;
		}
		if (!configuration.asset.amount || !configuration.asset.token) {
			return false;
		}

		return true;
	}, [
		configuration.asset.amount,
		configuration.asset.normalizedBigAmount.raw,
		configuration.asset.token,
		isZapNeeded,
		quote
	]);

	const getButtonTitle = useCallback(() => {
		if (!configuration.asset.token) {
			return 'Select Token to Withdraw';
		}

		if (!configuration.tokenToReceive) {
			return 'Select Token to Receive';
		}

		/******************************************************************************************
		 ** If Safe wallet connected approve and withdraw tx are batched
		 *****************************************************************************************/
		if (isWalletSafe && isZapNeeded) {
			return 'Approve and Withdraw';
		}

		/******************************************************************************************
		 ** Zap is not needed, simple withdraw contract call will be executed
		 *****************************************************************************************/
		if (!isZapNeeded) {
			return 'Withdraw';
		}

		if (isApproved) {
			return 'Withdraw';
		}

		return 'Approve';
	}, [configuration.asset.token, configuration.tokenToReceive, isApproved, isWalletSafe, isZapNeeded]);

	return (
		<>
			<Button
				isBusy={isBusy}
				isDisabled={!isValid || isBusy}
				onClick={onAction}
				className={
					'disabled:!bg-grey-100 disabled:!text-grey-800 w-full !rounded-2xl !font-bold disabled:!opacity-100'
				}>
				{isBusy ? null : getButtonTitle()}
			</Button>
			<SuccessModal
				title={'Success!'}
				content={transactionResult.message}
				ctaLabel={'Ok'}
				isOpen={transactionResult.isExecuted}
				className={'!bg-white'}
				onClose={onCloseModal}
			/>
		</>
	);
}
