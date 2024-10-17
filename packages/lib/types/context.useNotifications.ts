import type {Hex} from 'viem';
import type {TAddress} from '@builtbymom/web3/types';

export type TNotificationStatus = 'pending' | 'success' | 'error';

export type TNotification = {
	id?: number;
	from: TAddress;
	fromAddress: TAddress;
	fromChainId: number;
	fromTokenName: string;
	fromAmount: string;
	toAddress: TAddress;
	toChainId: number;
	toTokenName: string;
	type: 'vanila' | 'lifi' | 'portals' | 'portals gnosis';
	txHash: Hex | undefined;
	timeFinished?: number;
	safeTxHash: Hex | undefined;
	blockNumber: bigint;
	status: TNotificationStatus;
};

export type TCurtainStatus = {isOpen: boolean};

export type TNotificationsContext = {
	shouldOpenCurtain: boolean;
	cachedEntries: TNotification[];
	notificationStatus: TNotificationStatus | null;
	set_notificationStatus: (value: TNotificationStatus | null) => void;
	deleteByID: (id: number) => Promise<void>;
	updateEntry: (value: Partial<TNotification>, id: number) => Promise<void>;
	addNotification: (value: TNotification) => Promise<void>;
	set_shouldOpenCurtain: (value: boolean) => void;
};
