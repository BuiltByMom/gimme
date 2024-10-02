export type TNotificationStatus = 'pending' | 'success' | 'error';

export type TNotification = {
	id: number;
	fromAddress: string;
	fromChainId: number;
	fromTokenName: string;
	fromAmount: string;
	toAddress: string;
	toChainId: number;
	toTokenName: string;
	toAmount: string;
	status: TNotificationStatus;
};

export type TCurtainStatus = {isOpen: boolean};

export type TNotificationsContext = {
	shouldOpenCurtain: boolean;
	cachedEntries: TNotification[];
	deleteByID: (id: number) => Promise<void>;
	updateStatus: (value: TNotificationStatus, id: number) => Promise<void>;
	addNotification: (value: TNotification) => Promise<void>;
	set_shouldOpenCurtain: (value: boolean) => void;
};
