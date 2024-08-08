import {createContext, useContext, useMemo, useReducer, useState} from 'react';
import {zeroNormalizedBN} from '@builtbymom/web3/utils';
import {defaultTxStatus} from '@builtbymom/web3/utils/wagmi';
import {useIsZapNeeded} from '@lib/hooks/helpers/useIsZapNeeded';
import {usePortalsSolver} from '@lib/hooks/solvers/usePortalsSolver';
import {useVanilaSolver} from '@lib/hooks/solvers/useVanilaSolver';
import {getNewInput} from '@lib/utils/helpers';

import type {ReactElement} from 'react';
import type {TDepositActions, TDepositConfiguration, TDepositSolverContext} from './useSolver.types';

const defaultProps: TDepositSolverContext = {
	isDisabled: false,
	isApproved: false,
	isFetchingAllowance: false,
	isFetchingQuote: false,
	isDeposited: false,
	allowance: zeroNormalizedBN,
	approvalStatus: defaultTxStatus,
	withdrawStatus: defaultTxStatus,
	depositStatus: defaultTxStatus,
	quote: null,
	configuration: {
		asset: getNewInput(),
		opportunity: undefined
	},
	set_withdrawStatus: (): void => undefined,
	set_depositStatus: (): void => undefined,
	onApprove: async (): Promise<void> => undefined,
	onExecuteDeposit: async (): Promise<void> => undefined,
	onExecuteWithdraw: async (): Promise<void> => undefined,
	onExecuteForGnosis: async (): Promise<void> => undefined,
	onResetDeposit: (): void => undefined,
	dispatchConfiguration: (): void => undefined
};

const DepositSolverContext = createContext<TDepositSolverContext>(defaultProps);

const configurationReducer = (state: TDepositConfiguration, action: TDepositActions): TDepositConfiguration => {
	switch (action.type) {
		case 'SET_ASSET': {
			return {
				...state,

				asset: {...state.asset, ...action.payload}
			};
		}
		case 'SET_OPPORTUNITY': {
			return {
				...state,

				opportunity: action.payload
			};
		}

		case 'RESET':
			return {
				asset: getNewInput(),
				opportunity: undefined
			};
	}
};

export function DepositSolverContextApp({children}: {children: ReactElement}): ReactElement {
	const [configuration, dispatch] = useReducer(configurationReducer, defaultProps.configuration);
	const {isZapNeeded} = useIsZapNeeded(configuration.asset.token?.address, configuration.opportunity?.token.address);
	const vanila = useVanilaSolver(configuration.asset, configuration.opportunity, isZapNeeded, 'DEPOSIT');
	const portals = usePortalsSolver(configuration.asset, configuration.opportunity?.address, isZapNeeded);
	const [isDeposited, set_isDeposited] = useState<boolean>(false);

	const onResetDeposit = (): void => {
		set_isDeposited(true);
		setTimeout((): void => {
			dispatch({type: 'RESET', payload: undefined});
			set_isDeposited(false);
		}, 500);
	};

	const currentSolver = useMemo(() => {
		if (isZapNeeded) {
			return portals;
		}
		return vanila;
	}, [isZapNeeded, portals, vanila]);

	return (
		<DepositSolverContext.Provider
			value={{
				...currentSolver,
				isDeposited,
				configuration,
				dispatchConfiguration: dispatch,
				onResetDeposit
			}}>
			{children}
		</DepositSolverContext.Provider>
	);
}
export const useDepositSolver = (): TDepositSolverContext => useContext(DepositSolverContext);
