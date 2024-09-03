import {type ReactElement, useCallback, useEffect, useRef, useState} from 'react';
import {useRouter} from 'next/router';
import {serialize} from 'wagmi';
import useWallet from '@builtbymom/web3/contexts/useWallet';
import {
	cl,
	formatAmount,
	formatTAmount,
	isAddress,
	isZeroAddress,
	toBigInt,
	toNormalizedBN
} from '@builtbymom/web3/utils';
import {TokenAmountInput} from '@lib/common/TokenAmountInput';
import {useDepositSolver} from '@lib/contexts/useDepositSolver';
import {useVaults} from '@lib/contexts/useVaults';
import {useIsBridgeNeeded} from '@lib/hooks/helpers/useIsBridgeNeeded';
import {useIsZapNeeded} from '@lib/hooks/helpers/useIsZapNeeded';
import {useCurrentChain} from '@lib/hooks/useCurrentChain';
import {IconArrow} from '@lib/icons/IconArrow';
import {supportedNetworks} from '@lib/utils/tools.chains';
import {createUniqueID} from '@lib/utils/tools.identifiers';

import {EarnWizard} from './EarnWizard';
import {SelectOpportunityButton} from './SelectVaultButton';
import {Settings} from './Settings';
import {SettingsTrigger} from './SettingsTrigger';

import type {TAddress} from '@builtbymom/web3/types';
import type {TTokenAmountInputElement} from '@lib/types/utils';
import type {LiFiStep} from '@lifi/sdk';
import type {TYDaemonVault} from '@yearn-finance/web-lib/utils/schemas/yDaemonVaultsSchemas';

function EarnBadgeWrapper({children}: {children: ReactElement}): ReactElement {
	return (
		<div
			className={
				'bg-grey-0 border-grey-200 text-grey-700 w-full items-center rounded-2xl border p-4 pr-6 text-xs font-medium md:min-h-[66px]'
			}>
			{children}
		</div>
	);
}

function ZapsBadge(): ReactElement {
	const {quote, isFetchingQuote, configuration} = useDepositSolver();

	if (isFetchingQuote) {
		return <p className={'w-full'}>{'Checking possible routes...'}</p>;
	}

	if (!quote) {
		return <p className={'w-full'}>{'Sorry! No possible routes found for this configuration!'}</p>;
	}

	/**********************************************************************************************
	 ** If we are working with a Lifi quote, display the regular message
	 *********************************************************************************************/
	if ((quote as {estimate?: never})?.estimate) {
		return (
			<div className={'flex w-full justify-between gap-4'}>
				<p className={'max-w-[357px]'}>
					{'Hey! We gonna swap your tokens so you can use this opportunity. Don’t worry, no extra clicks.'}
				</p>
				<div className={'flex items-center gap-2'}>
					<p className={'text-base'}>{configuration.asset.token?.symbol}</p>
					<IconArrow />
					<p className={'text-base'}>{configuration.opportunity?.token.symbol}</p>
				</div>
			</div>
		);
	}

	const minOut = toNormalizedBN(
		toBigInt((quote as any)?.minOutputAmount || 0),
		(quote as any)?.outputTokenDecimals || 18
	).normalized;
	const pps = toNormalizedBN(
		toBigInt(configuration.opportunity?.pricePerShare || 0),
		configuration.opportunity?.token.decimals || 18
	).normalized;
	return (
		<div className={'flex w-full justify-between gap-4'}>
			<p className={'max-w-[357px]'}>
				{'Hey! We gonna swap your tokens so you can use this opportunity. Don’t worry, no extra clicks.'}
				<span className={'block'}>
					{`You will receive at least ${formatAmount(minOut * pps, 4, 2)} ${configuration.opportunity?.token.symbol}`}
				</span>
			</p>
			<div className={'flex items-center gap-2'}>
				<p className={'text-base'}>{configuration.asset.token?.symbol}</p>
				<IconArrow />
				<p className={'text-base'}>{configuration.opportunity?.token.symbol}</p>
			</div>
		</div>
	);
}

function BridgeBadge(): ReactElement {
	const {quote, configuration} = useDepositSolver();
	const fromChainName = supportedNetworks.find(network => network.id === configuration.asset.token?.chainID)?.name;
	const toChainName = supportedNetworks.find(network => network.id === configuration.opportunity?.chainID)?.name;
	const lifiQuote = quote as LiFiStep;

	return (
		<div className={'flex w-full justify-between gap-4'}>
			<p className={'max-w-[357px]'}>
				{'You will spend at most '}
				{formatTAmount({
					value: configuration.asset.normalizedBigAmount.raw,
					decimals: Number(configuration.asset.token?.decimals),
					symbol: configuration.asset.token?.symbol
				})}{' '}
				{'on '} {fromChainName} {'to deposit '}
				{formatTAmount({
					value: toBigInt(lifiQuote.estimate.toAmountMin),
					decimals: lifiQuote.action.toToken.decimals,
					symbol: lifiQuote.action.toToken.symbol
				})}
				{' to the '}
				{configuration.opportunity?.name || lifiQuote.action.toToken.symbol}
				{' vault on'} {toChainName}
			</p>
			<div className={'flex items-center gap-2'}>
				<p className={'text-base'}>{fromChainName}</p>
				<IconArrow />
				<p className={'text-base'}>{toChainName}</p>
			</div>
		</div>
	);
}

export function Earn(): ReactElement {
	const router = useRouter();
	const {getToken} = useWallet();
	const {userVaults, vaults} = useVaults();
	const {configuration, dispatchConfiguration, isFetchingQuote, quote} = useDepositSolver();

	const uniqueIdentifier = useRef<string | undefined>(undefined);
	const {isZapNeeded} = useIsZapNeeded(configuration.asset.token?.address, configuration.opportunity?.token.address);
	const {isBridgeNeeded} = useIsBridgeNeeded(configuration.asset.token?.chainID, configuration.opportunity?.chainID);
	const chain = useCurrentChain();

	const [isSettingsModalOpen, set_isSettingsModalOpen] = useState(false);
	const [isSettingsCurtainOpen, set_isSettingsCurtainOpen] = useState(false);

	const isWithdrawing =
		configuration.asset.token && !!vaults[configuration.asset.token?.address] && !configuration.opportunity;

	const onSetAsset = useCallback(
		(value: Partial<TTokenAmountInputElement>): void => {
			dispatchConfiguration({type: 'SET_ASSET', payload: value});
		},
		[dispatchConfiguration]
	);

	const onSetOpportunity = useCallback(
		(value: TYDaemonVault | undefined): void => {
			dispatchConfiguration({type: 'SET_OPPORTUNITY', payload: value});
		},
		[dispatchConfiguration]
	);

	/**********************************************************************************************
	 ** The user can come to this page with a bunch of query arguments. If this is the case, we
	 ** should populate the form with the values from the query arguments.
	 ** The valid query arguments are:
	 ** - tokenAddress: The address of the token to be deposited.
	 ** - vaultAddress: The address of the vault to be deposited in.
	 ** The uniqueIdentifier is used to prevent the useEffect from overwriting the form values
	 ** once we have set them from the query arguments.
	 *********************************************************************************************/
	useEffect(() => {
		const {tokenAddress, vaultAddress} = router.query;

		if (uniqueIdentifier.current || !tokenAddress) {
			return;
		}

		if (!isZeroAddress(tokenAddress as string) && isAddress(tokenAddress as string)) {
			const token = getToken({address: tokenAddress as TAddress, chainID: chain.id});
			if (isZeroAddress(token.address)) {
				return;
			}
			dispatchConfiguration({
				type: 'SET_ASSET',
				payload: {
					token,
					amount: token.balance.display,
					normalizedBigAmount: token.balance,
					isValid: true,
					error: undefined
				}
			});

			if (vaultAddress && !isZeroAddress(vaultAddress as string) && isAddress(vaultAddress as string)) {
				const vault = userVaults[vaultAddress as TAddress];
				vault && onSetOpportunity(vault);
			}

			uniqueIdentifier.current = createUniqueID(serialize(router.query));
		}
	}, [chain.id, dispatchConfiguration, getToken, onSetAsset, onSetOpportunity, router, router.query, userVaults]);

	useEffect(() => {
		return () => {
			uniqueIdentifier.current = undefined;
		};
	}, []);

	return (
		<div className={'relative w-full max-w-[560px]'}>
			<div className={cl('relative w-full overflow-hidden z-20 flex flex-col items-center gap-10 rounded-3xl')}>
				<div className={'border-grey-200 w-full rounded-3xl border bg-white p-4 md:p-6'}>
					<div className={cl('flex w-full flex-col gap-2')}>
						<TokenAmountInput
							onSetValue={onSetAsset}
							value={configuration.asset}
						/>

						{!isWithdrawing && <SelectOpportunityButton onSetOpportunity={onSetOpportunity} />}
						{isZapNeeded && (
							<EarnBadgeWrapper>
								<ZapsBadge />
							</EarnBadgeWrapper>
						)}
						{isBridgeNeeded && !isFetchingQuote && quote && (
							<EarnBadgeWrapper>
								<BridgeBadge />
							</EarnBadgeWrapper>
						)}
						<EarnWizard />
					</div>
				</div>

				<Settings
					isModalOpen={isSettingsModalOpen}
					isCurtainOpen={isSettingsCurtainOpen}
					onOpenModalChange={set_isSettingsModalOpen}
					onOpenCurtainChange={set_isSettingsCurtainOpen}
				/>
			</div>
			<SettingsTrigger
				isModalOpen={isSettingsModalOpen}
				isCurtainOpen={isSettingsCurtainOpen}
				onOpenModalChange={set_isSettingsModalOpen}
				onOpenCurtainChange={set_isSettingsCurtainOpen}
			/>
		</div>
	);
}
