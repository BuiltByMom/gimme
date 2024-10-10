import {type ReactElement, useMemo, useState} from 'react';
import Image from 'next/image';
import {CommandList} from 'cmdk';
import {cl} from '@builtbymom/web3/utils';
import * as Popover from '@radix-ui/react-popover';
import {IconChevron} from '@lib/icons/IconChevron';
import {IconQuestionMark} from '@lib/icons/IconQuestionMark';
import {Command, CommandItem} from '@lib/primitives/Commands';
import {supportedNetworks} from '@lib/utils/tools.chains';

import type {Chain} from 'viem';

export function NetworkSelector(props: {
	networks?: Chain[];
	selectedChainId: number;
	isDisabled?: boolean;
	onPopoverOpenChange?: (value: boolean) => void;
	onNetworkChange: (chainID: number) => void;
}): ReactElement {
	const isDisabled = props.isDisabled || false;
	const networks = props.networks || supportedNetworks;

	const currentNetwork = useMemo(() => {
		const currentNetwork = networks.find((network): boolean => network.id === props.selectedChainId);
		if (!currentNetwork) {
			return undefined;
		}
		return currentNetwork;
	}, [networks, props.selectedChainId]);

	const [isOpen, set_isOpen] = useState(false);
	return (
		<div
			onMouseEnter={isDisabled ? () => props.onPopoverOpenChange?.(true) : undefined}
			onMouseLeave={isDisabled ? () => props.onPopoverOpenChange?.(false) : undefined}>
			<Popover.Root
				open={isOpen}
				onOpenChange={set_isOpen}>
				<Popover.Trigger
					asChild
					disabled={isDisabled}
					className={'disabled:cursor-not-allowed'}>
					<button
						role={'combobox'}
						aria-expanded={isOpen}
						className={cl(
							'z-[100] relative transition-all',
							'flex justify-center items-center cursor-pointer',
							'flex border border-grey-200 py-2 px-4 rounded-2xl',
							isDisabled ? '' : 'hover:opacity-70'
						)}>
						{currentNetwork ? (
							<div className={'flex gap-2'}>
								<Image
									width={16}
									height={16}
									alt={currentNetwork.name}
									src={`${process.env.SMOL_ASSETS_URL}/chain/${currentNetwork.id}/logo.svg`}
								/>
								<p className={'font-bold'}>{currentNetwork.name}</p>
								{isDisabled && <IconQuestionMark className={'text-grey-700 size-6'} />}
							</div>
						) : (
							<div className={'text-grey-800 flex gap-1'}>
								<p className={'font-bold'}>{'All networks'}</p>
								<IconChevron className={'text-grey-800 size-6 min-w-4 rotate-90'} />
							</div>
						)}
					</button>
				</Popover.Trigger>

				<Popover.Content
					className={cl(
						'z-[120] overflow-hidden rounded-2xl bg-neutral-0 p-2',
						'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
						'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
						'data-[side=bottom]:slide-in-from-top-2',
						'DropdownMenuContent'
					)}
					style={{
						boxShadow: 'rgba(9, 18, 26, 0.08) 0px 8px 20px 0px ',
						width: '240px'
					}}>
					<Command className={'w-full'}>
						<CommandList className={'max-h-48 w-full max-w-[240px] overflow-y-auto'}>
							<CommandItem
								value={'All networks'}
								className={cl(
									'relative flex justify-between cursor-pointer items-center !rounded-lg !p-2 mt-1 w-full',
									'outline-none select-none transition-colors',
									'text-sm text-grey-900 group',
									'focus:bg-grey-100',
									'hover:bg-grey-100',
									props.selectedChainId === -1 ? 'bg-grey-100 !cursor-default' : ''
								)}
								onSelect={() => {
									props.onNetworkChange(-1);
									set_isOpen(false);
								}}>
								<p>{'All networks'}</p>
							</CommandItem>
							{networks.map(network => (
								<CommandItem
									key={network.id}
									value={network.name}
									className={cl(
										'relative flex justify-between cursor-pointer items-center !rounded-lg !p-2 mt-1',
										'outline-none select-none transition-colors',
										'text-sm text-grey-900 group',
										'focus:bg-grey-100',
										'hover:bg-grey-100',
										currentNetwork?.id === network.id ? 'bg-grey-100 !cursor-default' : ''
									)}
									onSelect={selectedNetwork => {
										if (selectedNetwork === currentNetwork?.name) {
											return;
										}
										const chain = networks.find(
											network =>
												network.name.toLowerCase() === selectedNetwork.toLocaleLowerCase()
										);
										props.onNetworkChange(chain?.id || 1);
										set_isOpen(false);
									}}>
									<p>{network.name}</p>
									<Image
										width={24}
										height={24}
										alt={network.name}
										src={`${process.env.SMOL_ASSETS_URL}/chain/${network.id}/logo.svg`}
									/>
								</CommandItem>
							))}
						</CommandList>
					</Command>
				</Popover.Content>
			</Popover.Root>
		</div>
	);
}
