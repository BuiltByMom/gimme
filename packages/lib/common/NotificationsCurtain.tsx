import {type ReactElement, useMemo} from 'react';
import {Drawer} from 'vaul';
import {useNotifications} from '@lib/contexts/useNotifications';
import {IconChevron} from '@lib/icons/IconChevron';

import {Notification} from './Notification';

export function NotificationsCurtain(props: {
	set_shouldOpenCurtain: (value: boolean) => void;
	isOpen: boolean;
}): ReactElement {
	const {cachedEntries} = useNotifications();
	const isEmpty = cachedEntries.length === 0;

	const sortedEntries = useMemo(
		() => cachedEntries.slice().sort((a, b) => Number(b.blockNumber - a.blockNumber)),
		[cachedEntries]
	);
	return (
		<Drawer.Root
			direction={'right'}
			open={props.isOpen}
			onOpenChange={props.set_shouldOpenCurtain}>
			<Drawer.Portal>
				<Drawer.Content className={'fixed inset-y-0 right-0 z-[999999] flex w-full outline-none md:w-[420px]'}>
					<div
						className={
							'border-grey-200 flex w-full grow flex-col border bg-white p-5 md:my-2 md:mr-2 md:rounded-3xl'
						}>
						<div className={'h-full'}>
							<div className={'mb-4 flex items-center justify-between'}>
								<Drawer.Close className={'hover:bg-grey-200 rounded-full p-1'}>
									<IconChevron className={'size-6'} />
								</Drawer.Close>
								<Drawer.Title className={'font-medium'}>{'Notifications'}</Drawer.Title>
							</div>
							<div className={'h-[94.5%] overflow-y-auto overflow-x-hidden'}>
								{isEmpty ? (
									<p className={'text-grey-800 mx-auto mt-40 text-center'}>{'Nothing here yet!'}</p>
								) : (
									<div className={'flex h-full flex-col gap-4'}>
										{sortedEntries.map(entry => (
											<Notification
												key={entry.id}
												{...entry}
											/>
										))}
									</div>
								)}
							</div>
						</div>
					</div>
				</Drawer.Content>
			</Drawer.Portal>
		</Drawer.Root>
	);
}
