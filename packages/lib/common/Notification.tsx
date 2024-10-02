import React from 'react';
import Image from 'next/image';
import {cl} from '@builtbymom/web3/utils';
import {IconArrow} from '@lib/icons/IconArrow';
import {IconCheck} from '@lib/icons/IconCheck';
import {IconCross} from '@lib/icons/IconCross';
import {IconLoader} from '@lib/icons/IconLoader';

import {ImageWithFallback} from './ImageWithFallback';

import type {ReactElement} from 'react';
import type {TNotificationStatus} from '@lib/types/context.useNotifications';

const STATUS: {[key: string]: [string, string, ReactElement]} = {
	success: ['Success', 'text-green bg-[#C6F4D6]', <IconCheck className={'size-4'} />],
	pending: ['Pending', 'text-yellow-500', <IconLoader />],
	error: ['Error', 'text-red-500', <IconCross />]
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

export function Notification(): ReactElement {
	return (
		<div className={'border-grey-200 rounded-xl border p-4'}>
			<div className={'mb-4 flex items-center justify-between'}>
				<p className={'text-grey-900 font-medium'}>{'Multichain Zap'}</p>
				<NotificationStatus status={'success'} />
			</div>

			<div className={'flex gap-8'}>
				<div className={'flex flex-col items-center gap-2'}>
					<div className={'relative'}>
						<ImageWithFallback
							alt={'WETH'}
							unoptimized
							src={`${process.env.SMOL_ASSETS_URL}/token/${8453}/${'0x4200000000000000000000000000000000000006'}/logo-128.png`}
							altSrc={`${process.env.SMOL_ASSETS_URL}/token/${8453}/${'0x4200000000000000000000000000000000000006'}/logo-128.png`}
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
								src={`${process.env.SMOL_ASSETS_URL}/chain/${8453}/logo.svg`}
							/>
						</div>
					</div>

					<IconArrow className={'rotate-90'} />

					<div className={'relative'}>
						<ImageWithFallback
							alt={'WETH'}
							unoptimized
							src={`${process.env.SMOL_ASSETS_URL}/token/${137}/${'0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'}/logo-128.png`}
							altSrc={`${process.env.SMOL_ASSETS_URL}/token/${137}/${'0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'}/logo-128.png`}
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
								src={`${process.env.SMOL_ASSETS_URL}/chain/${137}/logo.svg`}
							/>
						</div>
					</div>
				</div>
				<div>
					<div className={'grid grid-cols-2 grid-rows-6 gap-x-8'}>
						<p className={'text-grey-800 font text-xs'}>{'From:'}</p>
						<p className={'text-grey-800 text-xs font-bold'}>{'150 WETH'}</p>
						<p className={'text-grey-800 text-xs'}>{'To:'}</p>
						<p className={'text-grey-800 text-xs font-bold'}>{'WETH Vault'}</p>
						<p className={'text-grey-800 text-xs'}>{'From chain:'}</p>
						<p className={'text-grey-800 text-xs font-bold'}>{'Arbitrum'}</p>
						<p className={'text-grey-800 text-xs'}>{'To Chain:'}</p>
						<p className={'text-grey-800 text-xs font-bold'}>{'Polygon'}</p>
						<p className={'text-grey-800 text-xs'}>{'Min amount:'}</p>
						<p className={'text-grey-800 text-xs font-bold'}>{'148.5 yvWETH'}</p>
					</div>
				</div>
			</div>
		</div>
	);
}
