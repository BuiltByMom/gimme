import {cl} from '@builtbymom/web3/utils';

import type {ReactElement} from 'react';

export function Switch(props: {
	options: {title: string; value: number}[];
	value: number;
	onSelectValue: (value: number) => void;
}): ReactElement {
	return (
		<div className={'bg-grey-100 flex w-full gap-1 rounded-2xl p-1'}>
			{props.options.map(option => (
				<button
					className={cl(
						'bg-primary w-full basis-1/2 rounded-[14px] py-2.5 text-sm font-bold transition-colors',
						props.value !== option.value ? 'bg-transparent text-grey-700 font-normal' : ''
					)}
					key={option.value}
					onClick={() => props.onSelectValue(option.value)}>
					{option.title}
				</button>
			))}
		</div>
	);
}
