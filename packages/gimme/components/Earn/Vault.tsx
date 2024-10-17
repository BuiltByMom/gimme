import {useCallback} from 'react';
import Image from 'next/image';
import {cl, formatTAmount, formatUSD, percentOf, toAddress} from '@builtbymom/web3/utils';
import * as Popover from '@radix-ui/react-popover';
import {ImageWithFallback} from '@lib/common/ImageWithFallback';
import {useDepositSolver} from '@lib/contexts/useDepositSolver';
import {IconArrow} from '@lib/icons/IconArrow';
import {IconQuestionMark} from '@lib/icons/IconQuestionMark';

import type {Dispatch, ReactElement, SetStateAction} from 'react';
import type {TNormalizedBN} from '@builtbymom/web3/types';
import type {TYDaemonVault} from '@yearn-finance/web-lib/utils/schemas/yDaemonVaultsSchemas';
import type {TVaultInfoModal} from './SelectVault';

export function Vault({
	vault,
	assetPrice,
	onSelect,
	onClose,
	onChangeVaultInfo
}: {
	vault: TYDaemonVault;
	assetPrice: TNormalizedBN;
	onSelect: (value: TYDaemonVault) => void;
	onClose: () => void;
	onChangeVaultInfo: Dispatch<SetStateAction<TVaultInfoModal>>;
}): ReactElement {
	const {configuration} = useDepositSolver();
	const {token, name, apr} = vault;

	const assetAmountUSD = assetPrice.normalized * configuration.asset.normalizedBigAmount.normalized;

	const earnings = percentOf(assetAmountUSD, vault.apr.netAPR * 100);

	const onSelectVault = useCallback(async () => {
		onSelect(vault);
		onClose();
	}, [onClose, onSelect, vault]);

	return (
		<div
			onMouseEnter={() =>
				onChangeVaultInfo(prev => ({
					...vault,
					isOpen: prev && toAddress(prev?.address) === toAddress(vault.address)
				}))
			}
			className={cl(
				'flex justify-between rounded-lg px-4 py-3 gap-x-6 transition-colors hover:bg-grey-100',
				'cursor-pointer'
			)}
			onClick={onSelectVault}>
			<div className={'flex items-center gap-4'}>
				<div className={'relative'}>
					<ImageWithFallback
						alt={token.symbol}
						unoptimized
						src={`${process.env.SMOL_ASSETS_URL}/token/${vault.chainID}/${token.address}/logo-128.png`}
						altSrc={`${process.env.SMOL_ASSETS_URL}/token/${vault.chainID}/${token.address}/logo-128.png`}
						quality={90}
						width={32}
						height={32}
					/>
					<div
						className={
							'absolute -bottom-1 left-5 flex size-4 items-center justify-center rounded-full bg-white'
						}>
						<Image
							width={14}
							height={14}
							alt={vault.chainID.toString()}
							src={`${process.env.SMOL_ASSETS_URL}/chain/${vault.chainID}/logo.svg`}
						/>
					</div>
				</div>
				<div className={'flex flex-col items-start gap-0.5 text-left'}>
					<p className={'text-grey-900'}>
						{name}
						{' Vault'}
					</p>
					<div className={'flex flex-wrap items-start gap-1'}>
						<p className={'text-grey-600 text-xs'}>
							{`+ ${formatUSD(earnings).replace('$ ', '$')} over 1y`}
						</p>
						{configuration.asset.token &&
							vault.token.address &&
							configuration.asset.token?.address !== vault.token.address && (
								<div
									className={
										'text-xxs bg-grey-100 text-grey-800 flex items-center gap-1 rounded-sm px-1'
									}>
									{configuration.asset.token?.symbol} <IconArrow className={'size-2'} />{' '}
									{vault.token.symbol}
								</div>
							)}
					</div>
				</div>
			</div>
			<div className={'flex items-center'}>
				<p className={'mr-2 text-lg font-medium'}>
					{formatTAmount({value: apr.netAPR, decimals: token.decimals, symbol: 'percent'})}
				</p>
				<div className={'ml-4'}>
					<button
						className={'block md:hidden'}
						onClick={e => {
							e.preventDefault();
							e.stopPropagation();
							onChangeVaultInfo({...vault, isDialogOpen: true});
						}}>
						<IconQuestionMark className={'text-grey-700 size-6'} />
					</button>
					<div className={'hidden md:block'}>
						<Popover.Trigger asChild>
							<div onMouseEnter={() => onChangeVaultInfo({...vault, isPopoverOpen: true})}>
								<IconQuestionMark className={'text-grey-700 size-6'} />
							</div>
						</Popover.Trigger>
					</div>
				</div>
			</div>
		</div>
	);
}
