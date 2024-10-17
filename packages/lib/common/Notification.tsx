import React, {useMemo} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {useAsyncTrigger} from '@builtbymom/web3/hooks/useAsyncTrigger';
import {cl, truncateHex} from '@builtbymom/web3/utils';
import {useSafeAppsSDK} from '@gnosis.pm/safe-apps-react-sdk';
import {TransactionStatus} from '@gnosis.pm/safe-apps-sdk';
import {useNotifications} from '@lib/contexts/useNotifications';
import {IconArrow} from '@lib/icons/IconArrow';
import {IconCheck} from '@lib/icons/IconCheck';
import {IconCross} from '@lib/icons/IconCross';
import {IconLoader} from '@lib/icons/IconLoader';
import {getLifiStatus} from '@lib/utils/api.lifi';
import {CHAINS, supportedNetworks} from '@lib/utils/tools.chains';

import {ImageWithFallback} from './ImageWithFallback';

import type {ReactElement} from 'react';
import type {Hex} from 'viem';
import type {TNotification, TNotificationStatus} from '@lib/types/context.useNotifications';
import type {TLifiStatusResponse} from '@lib/utils/api.lifi';

const STATUS: {[key: string]: [string, string, ReactElement]} = {
	success: ['Success', 'text-green bg-[#C6F4D6]', <IconCheck className={'size-4'} />],
	pending: ['Pending', 'text-grey-800 bg-grey-100', <IconLoader className={'size-4 animate-spin'} />],
	error: ['Error', 'text-red bg-[#FBDADA]', <IconCross className={'size-4'} />]
};

function NotificationStatus(props: {status: TNotificationStatus}): ReactElement {
	return (
		<div
			className={cl(
				'flex gap-1 justify-center self-start py-2 px-4 items-center rounded-lg text-xs',
				STATUS[props.status][1]
			)}>
			{STATUS[props.status][2]}
			{STATUS[props.status][0]}
		</div>
	);
}

export function Notification({
	id,
	fromAddress,
	toAddress,
	from,
	fromAmount,
	fromChainId,
	toChainId,
	fromTokenName,
	toTokenName,
	type,
	status,
	txHash,
	timeFinished,
	safeTxHash
}: TNotification): ReactElement {
	const {updateEntry} = useNotifications();
	const fromChainName = supportedNetworks.find(network => network.id === fromChainId)?.name;
	const toChainName = supportedNetworks.find(network => network.id === toChainId)?.name;
	const {sdk} = useSafeAppsSDK();

	const date = new Date((timeFinished || 0) * 1000);
	const formattedDate = date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: 'numeric'
	});

	const explorerLink = useMemo(() => {
		if (!txHash) {
			return null;
		}
		if (type === 'lifi') {
			return `https://scan.li.fi/tx/${txHash}`;
		}

		const chain = CHAINS[fromChainId];
		const explorerBaseURI = chain?.blockExplorers?.default?.url || 'https://etherscan.io';
		return `${explorerBaseURI}/tx/${txHash}`;
	}, [fromChainId, txHash, type]);

	const notificationTitle = useMemo(() => {
		if (type === 'lifi') {
			return 'Multichain Zap';
		}
		if (type === 'portals') {
			return 'Zap';
		}

		return 'Deposit';
	}, [type]);
	/************************************************************************************************
	 * useAsyncTrigger in this component:
	 * 1. For 'lifi' transactions:
	 *    - It polls the getLifiStatus function every 30 seconds if the transaction is pending.
	 *    - Once the transaction is done or failed, it updates the entry's status accordingly.
	 * 2. For 'portals gnosis' transactions:
	 *    - It polls the Safe SDK's getBySafeTxHash method every 30 seconds for pending transactions.
	 *    - It updates the entry's status based on the transaction's final state.
	 ************************************************************************************************/
	useAsyncTrigger(async () => {
		if (type === 'lifi' && status === 'pending' && txHash) {
			let result: TLifiStatusResponse;
			do {
				result = await getLifiStatus({
					fromChainID: Number(fromChainId),
					toChainID: Number(toChainId),
					txHash
				});
				await new Promise(resolve => setTimeout(resolve, 30_000));
			} while (result.status !== 'DONE' && result.status !== 'FAILED');

			if (result.status === 'DONE') {
				await updateEntry({status: 'success', timeFinished: Date.now() / 1000}, Number(id));
				return;
			}

			updateEntry({status: 'error', timeFinished: Date.now() / 1000}, Number(id));
		}
	}, [fromChainId, id, status, toChainId, txHash, type, updateEntry]);

	useAsyncTrigger(async () => {
		if (type === 'portals gnosis' && status === 'pending' && safeTxHash) {
			let result;
			do {
				if (result?.txStatus === TransactionStatus.CANCELLED || result?.txStatus === TransactionStatus.FAILED) {
					throw new Error('An error occured while creating your transaction!');
				}
				result = await sdk.txs.getBySafeTxHash(safeTxHash);
				await new Promise(resolve => setTimeout(resolve, 30_000));
			} while (
				result.txStatus !== TransactionStatus.SUCCESS &&
				result.txStatus !== TransactionStatus.FAILED &&
				result.txStatus !== TransactionStatus.CANCELLED
			);

			if (result.txStatus === TransactionStatus.SUCCESS) {
				await updateEntry(
					{status: 'success', txHash: result.txHash as Hex, timeFinished: Date.now() / 1000},
					Number(id)
				);
				return;
			}

			updateEntry({status: 'error', txHash: result.txHash as Hex, timeFinished: Date.now() / 1000}, Number(id));
		}
	}, [id, safeTxHash, sdk.txs, status, type, updateEntry]);

	return (
		<div className={'border-grey-200 rounded-xl border p-4'}>
			<div className={'mb-4 flex items-center justify-between'}>
				<p className={'text-grey-900 font-medium'}>{notificationTitle}</p>
				<NotificationStatus status={status} />
			</div>

			<div className={'flex gap-8'}>
				<div className={'flex flex-col items-center gap-2'}>
					<div className={'relative'}>
						<ImageWithFallback
							alt={fromTokenName}
							unoptimized
							src={`${process.env.SMOL_ASSETS_URL}/token/${fromChainId}/${fromAddress}/logo-128.png`}
							altSrc={`${process.env.SMOL_ASSETS_URL}/token/${fromChainId}/${fromAddress}/logo-128.png`}
							quality={90}
							width={32}
							height={32}
						/>
						<div
							className={
								'absolute bottom-5 left-5 flex size-4 items-center justify-center rounded-full bg-white'
							}>
							<Image
								width={14}
								height={14}
								alt={'chain'}
								src={`${process.env.SMOL_ASSETS_URL}/chain/${fromChainId}/logo.svg`}
							/>
						</div>
					</div>

					<IconArrow className={'rotate-90'} />

					<div className={'relative'}>
						<ImageWithFallback
							alt={toTokenName}
							unoptimized
							src={`${process.env.SMOL_ASSETS_URL}/token/${toChainId}/${toAddress}/logo-128.png`}
							altSrc={`${process.env.SMOL_ASSETS_URL}/token/${toChainId}/${toAddress}/logo-128.png`}
							quality={90}
							width={32}
							height={32}
						/>
						<div
							className={
								'absolute bottom-5 left-5 flex size-4 items-center justify-center rounded-full bg-white'
							}>
							<Image
								width={14}
								height={14}
								alt={'chain'}
								src={`${process.env.SMOL_ASSETS_URL}/chain/${toChainId}/logo.svg`}
							/>
						</div>
					</div>
				</div>
				<div>
					<div className={'text-grey-800 grid grid-cols-2 grid-rows-7 gap-x-8 text-xs'}>
						<p>{'From:'}</p>
						<p className={'font-bold'}>{truncateHex(from, 5)}</p>
						<p>{'Amount:'}</p>
						<p className={'font-bold'}>{`${fromAmount} ${fromTokenName}`}</p>
						<p>{'To:'}</p>
						<p className={'font-bold'}>
							{toTokenName}
							{' Vault'}
						</p>
						<p>{'From chain:'}</p>
						<p className={'font-bold'}>{fromChainName}</p>
						<p>{'To Chain:'}</p>
						<p className={'font-bold'}>{toChainName}</p>
						<p>{status === 'success' ? 'Finalized:' : 'Finalizes:'}</p>
						<p className={'whitespace-nowrap font-bold'}>{formattedDate}</p>
						{explorerLink ? (
							<>
								<p>{'Transaction:'}</p>
								<Link
									href={explorerLink}
									target={'_blank'}>
									<button className={'font-bold hover:underline'}>
										{txHash?.slice(0, 6)}
										{'...'}
										{txHash?.slice(-5)}
									</button>
								</Link>
							</>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}
