import {useCallback, useMemo, useState} from 'react';
import {usePlausible} from 'next-plausible';
import {isAddressEqual} from 'viem';
import useWallet from '@builtbymom/web3/contexts/useWallet';
import {useWeb3} from '@builtbymom/web3/contexts/useWeb3';
import {cl, ETH_TOKEN_ADDRESS, toAddress} from '@builtbymom/web3/utils';
import {getNetwork} from '@builtbymom/web3/utils/wagmi';
import {SuccessModal} from '@lib/common/SuccessModal';
import {useDepositSolver} from '@lib/contexts/useDepositSolver';
import {useVaults} from '@lib/contexts/useVaults';
import {useIsZapNeeded} from '@lib/hooks/helpers/useIsZapNeeded';
import {useCurrentChain} from '@lib/hooks/useCurrentChain';
import {Button} from '@lib/primitives/Button';
import {PLAUSIBLE_EVENTS} from '@lib/utils/plausible';

import type {ReactElement} from 'react';

export function EarnWizard(): ReactElement {
	const {onRefresh, getBalance} = useWallet();
	const {address, openLoginModal, isWalletSafe} = useWeb3();
	const {configuration, onResetDeposit} = useDepositSolver();
	const {vaults, vaultsArray} = useVaults();
	const chain = useCurrentChain();
	const plausible = usePlausible();

	const [transactionResult, set_transactionResult] = useState<{isExecuted: boolean; message: ReactElement | null}>({
		isExecuted: false,
		message: null
	});

	/**********************************************************************************************
	 ** Based on the user action, we can display a different message in the success modal.
	 *********************************************************************************************/
	const getModalMessage = useCallback((): ReactElement => {
		const vaultName = vaultsArray.find(vault =>
			isAddressEqual(vault.address, toAddress(configuration.asset.token?.address))
		)?.name;

		return (
			<span>
				{'Successfully deposited '}
				<span className={'text-grey-800'}>
					{configuration.asset.normalizedBigAmount.display} {configuration.asset.token?.symbol}
				</span>
				{' to '}
				{configuration.opportunity?.name ?? vaultName}
			</span>
		);
	}, [
		configuration.asset.normalizedBigAmount.display,
		configuration.asset.token?.address,
		configuration.asset.token?.symbol,
		configuration.opportunity?.name,
		vaultsArray
	]);

	/**********************************************************************************************
	 ** After a successful transaction, this function can be called to refresh balances of the
	 ** tokens involved in the transaction (vault, asset, chain coin).
	 *********************************************************************************************/
	const onRefreshTokens = useCallback(
		(kind: 'APPROVE' | 'DEPOSIT') => {
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

				const vaultToken = vaults[configuration.asset.token?.address]
					? (vaults[configuration.asset.token?.address].token ?? null)
					: null;

				vaultToken &&
					vaults[configuration.asset.token?.address] &&
					tokensToRefresh.push({...vaultToken, chainID: vaults[configuration.asset.token?.address].chainID});
			}
			if (configuration.opportunity) {
				tokensToRefresh.push({
					decimals: configuration.opportunity.decimals,
					name: configuration.opportunity.name,
					symbol: configuration.opportunity.symbol,
					address: toAddress(configuration.opportunity.address),
					chainID: Number(configuration.opportunity.chainID)
				});
			}

			const currentChainID = configuration.opportunity?.chainID || configuration.asset.token?.chainID || chain.id;
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
		[configuration.asset.token, configuration.opportunity, getModalMessage, onRefresh, chain.id, vaults]
	);

	const {
		onApprove,
		isApproved,
		isFetchingAllowance,
		approvalStatus,
		onExecuteDeposit,
		depositStatus,
		onExecuteForGnosis,
		isFetchingQuote,
		quote
	} = useDepositSolver();

	const {isZapNeeded} = useIsZapNeeded(configuration.asset.token?.address, configuration.opportunity?.token.address);
	const isAboveBalance =
		configuration.asset.normalizedBigAmount.raw >
		getBalance({
			address: toAddress(configuration.asset.token?.address),
			chainID: Number(configuration.asset.token?.chainID)
		}).raw;

	/**********************************************************************************************
	 ** Once the transaction is done, we can close the modal and reset the state of the wizard.
	 *********************************************************************************************/
	const onCloseModal = useCallback(() => {
		set_transactionResult({isExecuted: false, message: null});
		onResetDeposit();
	}, [onResetDeposit]);

	const onDepositSuccess = useCallback(() => {
		plausible(PLAUSIBLE_EVENTS.DEPOSIT, {
			props: {
				vaultAddress: toAddress(configuration.opportunity?.address),
				vaultName: configuration.opportunity?.name,
				vaultChainID: configuration.opportunity?.chainID,
				tokenAddress: toAddress(configuration.asset.token?.address),
				tokenName: configuration.asset.token?.name,
				isSwap: isZapNeeded,
				tokenAmount: configuration.asset.amount
			}
		});
		onRefreshTokens('DEPOSIT');
	}, [
		configuration.asset.amount,
		configuration.asset.token?.address,
		configuration.asset.token?.name,
		configuration.opportunity?.address,
		configuration.opportunity?.chainID,
		configuration.opportunity?.name,
		isZapNeeded,
		onRefreshTokens,
		plausible
	]);

	const onAction = useCallback(async () => {
		if (isWalletSafe) {
			return onExecuteForGnosis(onDepositSuccess);
		}
		if (isApproved) {
			return onExecuteDeposit(onDepositSuccess);
		}
		return onApprove(() => onRefreshTokens('APPROVE'));
	}, [isApproved, isWalletSafe, onApprove, onDepositSuccess, onExecuteDeposit, onExecuteForGnosis, onRefreshTokens]);

	const isValid = useMemo((): boolean => {
		if (isAboveBalance) {
			return false;
		}
		if (isZapNeeded && !quote) {
			return false;
		}
		if (!configuration.opportunity) {
			return false;
		}

		if (!configuration.asset.amount || !configuration.asset.token) {
			return false;
		}

		if (configuration.asset.token.address === configuration.opportunity?.address) {
			return false;
		}

		return true;
	}, [
		configuration.asset.amount,
		configuration.asset.token,
		configuration.opportunity,
		isAboveBalance,
		isZapNeeded,
		quote
	]);

	const getButtonTitle = (): string => {
		if (!configuration.asset.token || !configuration.opportunity) {
			return 'Select Token or Opportunity';
		}

		if (isWalletSafe) {
			return 'Approve and Deposit';
		}

		if (isApproved) {
			return 'Deposit';
		}

		return 'Approve';
	};

	const isBusy = depositStatus.pending || approvalStatus.pending || isFetchingAllowance || isFetchingQuote;

	return (
		<div className={'col-span-12'}>
			{address ? (
				<Button
					isBusy={isBusy}
					isDisabled={!isValid || isBusy}
					onClick={onAction}
					className={cl(
						'disabled:!bg-grey-100 w-full !rounded-2xl !font-bold disabled:!opacity-100 disabled:!text-grey-800'
					)}>
					{isBusy ? null : getButtonTitle()}
				</Button>
			) : (
				<Button
					className={'w-full !rounded-2xl !font-bold'}
					onClick={openLoginModal}>
					{'Connect Wallet'}
				</Button>
			)}

			<SuccessModal
				title={'Success!'}
				content={transactionResult.message}
				ctaLabel={'Ok'}
				isOpen={transactionResult.isExecuted}
				className={'!bg-white'}
				onClose={onCloseModal}
			/>
		</div>
	);
}
