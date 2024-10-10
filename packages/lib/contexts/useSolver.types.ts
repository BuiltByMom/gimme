import type {Dispatch} from 'react';
import type {TNormalizedBN, TToken} from '@builtbymom/web3/types';
import type {TTxStatus} from '@builtbymom/web3/utils/wagmi';
import type {TTokenAmountInputElement} from '@lib/types/utils';
import type {TYDaemonVault} from '@yearn-finance/web-lib/utils/schemas/yDaemonVaultsSchemas';

/**************************************************************************************************
 * This type is a return type of every solver. It should stay the same for every new solver added
 *************************************************************************************************/
export type TSolverContextBase<TQuote> = {
	allowance: TNormalizedBN;
	quote: TQuote;
	isDisabled: boolean;
	isApproved: boolean;
	isFetchingAllowance: boolean;
	isFetchingQuote: boolean;
	approvalStatus: TTxStatus;
	depositStatus: TTxStatus;
	withdrawStatus: TTxStatus;
	set_depositStatus: (value: TTxStatus) => void;
	set_withdrawStatus: (value: TTxStatus) => void;
	onApprove: (onSuccess?: () => void) => Promise<void>;
	onExecuteDeposit: (onSuccess: () => void) => Promise<void>;
	onExecuteWithdraw: (onSuccess: () => void) => Promise<void>;
	onExecuteForGnosis: (onSuccess: () => void) => Promise<void>;
};

/**************************************************************************************************
 * Group of types for the DEPOSIT variant of the Base solver
 *************************************************************************************************/
export type TDepositActions =
	| {type: 'SET_ASSET'; payload: Partial<TTokenAmountInputElement>}
	| {type: 'SET_OPPORTUNITY'; payload: TYDaemonVault | undefined}
	| {type: 'RESET'; payload: undefined};

export type TDepositConfiguration = {
	asset: TTokenAmountInputElement;
	opportunity: (TYDaemonVault & {pricePerShare?: string}) | undefined;
};

export type TDepositSolverContext<TQuote> = TSolverContextBase<TQuote> & {
	configuration: TDepositConfiguration;
	dispatchConfiguration: Dispatch<TDepositActions>;
	onResetDeposit: () => void;
	isDeposited: boolean;
};

/**************************************************************************************************
 * Group of types for the WITHDRAW variant of the Base solver
 *************************************************************************************************/

export type TWithdrawActions =
	| {type: 'SET_ASSET'; payload: Partial<TTokenAmountInputElement>}
	| {type: 'SET_VAULT'; payload: TYDaemonVault | undefined}
	| {type: 'SET_TOKEN_TO_RECEIVE'; payload: TToken}
	| {type: 'SET_CONFIGURATION'; payload: TWithdrawConfiguration}
	| {type: 'RESET'; payload: undefined};

export type TWithdrawConfiguration = {
	asset: TTokenAmountInputElement;
	vault: TYDaemonVault | undefined;
	tokenToReceive: TToken | undefined;
};
export type TWithdrawSolverContext<TQuote> = TSolverContextBase<TQuote> & {
	configuration: TWithdrawConfiguration;
	dispatchConfiguration: Dispatch<TWithdrawActions>;
	onResetWithdraw: () => void;
};
