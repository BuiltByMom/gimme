import {cl} from '@builtbymom/web3/utils';
import * as Popover from '@radix-ui/react-popover';

import type {ReactElement} from 'react';

export function SimplePopover({message, title}: {message: string; title: string}): ReactElement {
	return (
		<Popover.Content
			side={'right'}
			align={'start'}
			sideOffset={16}
			className={cl(
				'z-[120]',
				'absolute right-0 top-[186px] xl:top-0 xl:left-2',
				'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
				'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
				'data-[side=bottom]:slide-in-from-top-2'
			)}>
			<div
				style={{width: 'calc(100vw - 32px)'}}
				className={cl(
					'flex !w-[300px] xl:!w-[400px] flex-col items-start',
					'border border-neutral-200 relative',
					'rounded-3xl !bg-white p-6 transition-all'
				)}>
				<p className={'text-grey-900 mb-6 font-bold'}>{title}</p>
				<p className={'text-grey-700 text-left'}>{message}</p>
			</div>
		</Popover.Content>
	);
}
