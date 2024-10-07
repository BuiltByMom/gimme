import React, {createContext, useCallback, useContext, useMemo, useState} from 'react';
import {useIndexedDBStore} from 'use-indexeddb';
import {useAsyncTrigger} from '@builtbymom/web3/hooks/useAsyncTrigger';
import {NotificationsCurtain} from '@lib/common/NotificationsCurtain';

import type {TNotification, TNotificationsContext, TNotificationStatus} from '@lib/types/context.useNotifications';

const defaultProps: TNotificationsContext = {
	shouldOpenCurtain: false,
	cachedEntries: [],
	notificationStatus: null,
	set_notificationStatus: (): void => undefined,
	deleteByID: async (): Promise<void> => undefined,
	updateEntry: async (): Promise<void> => undefined,
	addNotification: async (): Promise<void> => undefined,
	set_shouldOpenCurtain: (): void => undefined
};

const NotificationsContext = createContext<TNotificationsContext>(defaultProps);
export const WithNotifications = ({children}: {children: React.ReactElement}): React.ReactElement => {
	const [cachedEntries, set_cachedEntries] = useState<TNotification[]>([]);
	const [entryNonce, set_entryNonce] = useState<number>(0);

	/**************************************************************************
	 * State that is used to store latest added/updated notification status
	 *************************************************************************/
	const [notificationStatus, set_notificationStatus] = useState<TNotificationStatus | null>(null);

	const [shouldOpenCurtain, set_shouldOpenCurtain] = useState(false);
	const {add, getAll, update, deleteByID, getByID} = useIndexedDBStore<TNotification>('notifications');

	useAsyncTrigger(async (): Promise<void> => {
		entryNonce;
		const entriesFromDB = await getAll();
		set_cachedEntries(entriesFromDB);
	}, [getAll, entryNonce]);

	const updateEntry = useCallback(
		async (entry: Partial<TNotification>, id: number) => {
			const notification = await getByID(id);

			if (notification) {
				await update({...notification, ...entry});
				set_entryNonce(nonce => nonce + 1);
				set_notificationStatus(entry?.status || null);
			}
		},
		[getByID, update]
	);

	const addNotification = useCallback(
		async (notification: TNotification) => {
			await add(notification);
			set_entryNonce(nonce => nonce + 1);
			set_notificationStatus(notification.status);
		},
		[add]
	);

	/**************************************************************************
	 * Context value that is passed to all children of this component.
	 *************************************************************************/
	const contextValue = useMemo(
		(): TNotificationsContext => ({
			shouldOpenCurtain,
			cachedEntries,
			deleteByID,
			updateEntry,
			addNotification,
			notificationStatus,
			set_notificationStatus,
			set_shouldOpenCurtain
		}),
		[shouldOpenCurtain, cachedEntries, deleteByID, updateEntry, addNotification, notificationStatus]
	);

	return (
		<NotificationsContext.Provider value={contextValue}>
			{children}
			<NotificationsCurtain
				set_shouldOpenCurtain={set_shouldOpenCurtain}
				isOpen={shouldOpenCurtain}
			/>
		</NotificationsContext.Provider>
	);
};

export const useNotifications = (): TNotificationsContext => {
	const ctx = useContext(NotificationsContext);
	if (!ctx) {
		throw new Error('NotificationsContext not found');
	}
	return ctx;
};
