import {IconCross} from '@lib/icons/IconCross';
import {IconOptions} from '@lib/icons/IconOptions';

import type {ReactElement} from 'react';

export function SettingsTrigger(props: {
	isCurtainOpen: boolean;
	onOpenCurtainChange: (isOpen: boolean) => void;
	isModalOpen: boolean;
	onOpenModalChange: (isOpen: boolean) => void;
}): ReactElement {
	return (
		<>
			<button
				className={
					'bg-grey-400 border-grey-300 invisible absolute -right-14 top-0 rounded-full border p-3 md:visible'
				}
				onClick={() => props.onOpenCurtainChange(!props.isCurtainOpen)}>
				{props.isCurtainOpen ? (
					<IconCross className={'text-grey-200 size-6'} />
				) : (
					<IconOptions className={'text-grey-200 size-6'} />
				)}
			</button>

			<button
				className={'bg-grey-400 border-grey-300 absolute -top-14 right-0 rounded-full border p-3 md:invisible'}
				onClick={() => props.onOpenModalChange(!props.isModalOpen)}>
				{props.isModalOpen ? (
					<IconCross className={'text-grey-200 size-6'} />
				) : (
					<IconOptions className={'text-grey-200 size-6'} />
				)}
			</button>
		</>
	);
}
