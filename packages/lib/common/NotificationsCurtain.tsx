import {Drawer} from 'vaul';
import {IconChevron} from '@lib/icons/IconChevron';

import {Notification} from './Notification';

import type {ReactElement} from 'react';

export function NotificationsCurtain(props: {
	set_shouldOpenCurtain: (value: boolean) => void;
	isOpen: boolean;
}): ReactElement {
	return (
		<Drawer.Root
			direction={'right'}
			open={props.isOpen}
			onOpenChange={props.set_shouldOpenCurtain}>
			<Drawer.Portal>
				{/* <Drawer.Overlay className={'fixed inset-0'} /> */}
				<Drawer.Content className={'fixed inset-y-0 right-0 z-[999999] flex w-full outline-none md:w-[420px]'}>
					<div
						className={
							'border-grey-200 flex w-full grow flex-col border bg-white p-5 md:my-2 md:mr-2 md:rounded-3xl'
						}>
						<div>
							<div className={'mb-4 flex items-center justify-between'}>
								<Drawer.Close className={'hover:bg-grey-200 rounded-full p-1'}>
									<IconChevron className={'size-6'} />
								</Drawer.Close>
								<Drawer.Title className={'mb-2 font-medium text-zinc-900'}>
									{'Notifications'}
								</Drawer.Title>
							</div>
							<Drawer.Content>
								<Notification />
							</Drawer.Content>
						</div>
					</div>
				</Drawer.Content>
			</Drawer.Portal>
		</Drawer.Root>
	);
}
