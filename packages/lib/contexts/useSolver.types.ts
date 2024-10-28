import type {Dispatch} from 'react';
import type {TransactionReceipt} from 'viem';
import type {TToken} from '@builtbymom/web3/types';
import type {TTokenAmountInputElement} from '@lib/types/utils';
import type {TYDaemonVault} from '@yearn-finance/web-lib/utils/schemas/yDaemonVaultsSchemas';

/**************************************************************************************************
 * This type is a return type of every solver. It should stay the same for every new solver added
 *************************************************************************************************/
export type TSolverContextBase<TQuote> = {
	allowance: bigint;
	quote: TQuote;
	isApproved: boolean;
	isFetchingAllowance: boolean;
	isFetchingQuote: boolean;
	isApproving: boolean;
	isDepositing: boolean;
	isWithdrawing?: boolean;
	onApprove: (onSuccess?: () => void, onFailure?: () => void) => Promise<boolean>;
	onExecuteDeposit: (
		onSuccess: (receipt?: TransactionReceipt) => void,
		onFailure?: (errorMessage?: string) => void
	) => Promise<boolean>;
	onExecuteWithdraw: (
		onSuccess: (receipt?: TransactionReceipt) => void,
		onFailure?: (errorMessage?: string) => void
	) => Promise<boolean>;
	onDepositSuccessForSolver?: (receipt: TransactionReceipt) => void;
	onDepositFailureForSolver?: (errorMessage?: string) => void;
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
