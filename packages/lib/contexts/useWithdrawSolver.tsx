import {createContext, useContext, useMemo, useReducer} from 'react';
import useWallet from '@builtbymom/web3/contexts/useWallet';
import {toAddress, zeroNormalizedBN} from '@builtbymom/web3/utils';
import {defaultTxStatus} from '@builtbymom/web3/utils/wagmi';
import {useIsZapNeeded} from '@lib/hooks/helpers/useIsZapNeeded';
import {usePortalsSolver} from '@lib/hooks/solvers/usePortalsSolver';
import {useVanilaSolver} from '@lib/hooks/solvers/useVanilaSolver';
import {getNewInput} from '@lib/utils/helpers';

import type {ReactElement} from 'react';
import type {TTokenAmountInputElement} from '@lib/types/utils';
import type {TWithdrawActions, TWithdrawConfiguration, TWithdrawSolverContext} from './useSolver.types';

const defaultProps: TWithdrawSolverContext = {
	isDisabled: false,
	isApproved: false,
	isFetchingAllowance: false,
	isFetchingQuote: false,
	allowance: zeroNormalizedBN,
	approvalStatus: defaultTxStatus,
	withdrawStatus: defaultTxStatus,
	depositStatus: defaultTxStatus,
	quote: null,
	configuration: {
		asset: getNewInput(),
		vault: undefined,
		tokenToReceive: undefined
	},
	set_withdrawStatus: (): void => undefined,
	set_depositStatus: (): void => undefined,
	onApprove: async (): Promise<void> => undefined,
	onExecuteDeposit: async (): Promise<void> => undefined,
	onExecuteWithdraw: async (): Promise<void> => undefined,
	onExecuteForGnosis: async (): Promise<void> => undefined,
	onResetWithdraw: (): void => undefined,
	dispatchConfiguration: (): void => undefined
};

const WithdrawSolverContext = createContext<TWithdrawSolverContext>(defaultProps);

const configurationReducer = (state: TWithdrawConfiguration, action: TWithdrawActions): TWithdrawConfiguration => {
	switch (action.type) {
		case 'SET_ASSET': {
			return {
				...state,
				asset: {...state.asset, ...action.payload}
			};
		}
		case 'SET_TOKEN_TO_RECEIVE': {
			return {
				...state,
				tokenToReceive: action.payload
			};
		}
		case 'SET_VAULT': {
			return {...state, vault: action.payload};
		}
		case 'SET_CONFIGURATION': {
			return action.payload;
		}
		case 'RESET': {
			return {
				asset: getNewInput(),
				vault: undefined,
				tokenToReceive: undefined
			};
		}
	}
};

export function WithdrawSolverContextApp({children}: {children: ReactElement}): ReactElement {
	const [configuration, dispatch] = useReducer(configurationReducer, defaultProps.configuration);
	const {getToken} = useWallet();
	const {isZapNeeded} = useIsZapNeeded(configuration.asset.token?.address, configuration.tokenToReceive?.address);
	const vaultToken = getToken({
		address: toAddress(configuration.vault?.address),
		chainID: configuration.vault?.chainID || 137
	});

	const vaultInputElementLike: TTokenAmountInputElement = useMemo(
		() => ({
			amount: vaultToken.balance.display,
			normalizedBigAmount: vaultToken.balance,
			isValid: 'undetermined',
			token: vaultToken,
			status: 'none',
			UUID: crypto.randomUUID()
		}),
		[vaultToken]
	);
	const portals = usePortalsSolver(vaultInputElementLike, configuration.tokenToReceive?.address, isZapNeeded);
	const vanila = useVanilaSolver(configuration.asset, configuration.vault, isZapNeeded, 'WITHDRAW');

	const onResetWithdraw = (): void => {
		setTimeout((): void => {
			dispatch({type: 'RESET', payload: undefined});
		}, 500);
	};

	const currentSolver = useMemo(() => {
		if (isZapNeeded) {
			return portals;
		}
		return vanila;
	}, [isZapNeeded, portals, vanila]);

	return (
		<WithdrawSolverContext.Provider
			value={{
				...currentSolver,
				configuration,
				dispatchConfiguration: dispatch,
				onResetWithdraw
			}}>
			{children}
		</WithdrawSolverContext.Provider>
	);
}
export const useWithdrawSolver = (): TWithdrawSolverContext => useContext(WithdrawSolverContext);
