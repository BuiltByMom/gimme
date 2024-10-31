import {createContext, useContext, useMemo, useReducer} from 'react';
import useWallet from '@builtbymom/web3/contexts/useWallet';
import {fromNormalized, toAddress, toBigInt, toNormalizedBN} from '@builtbymom/web3/utils';
import {useIsZapNeeded} from '@lib/hooks/helpers/useIsZapNeeded';
import {usePortalsSolver} from '@lib/hooks/solvers/usePortalsSolver';
import {useVanilaSolver} from '@lib/hooks/solvers/useVanilaSolver';
import {getNewInput} from '@lib/utils/helpers';

import type {ReactElement} from 'react';
import type {TTokenAmountInputElement} from '@lib/types/utils';
import type {TPortalsEstimate} from '@lib/utils/api.portals';
import type {TWithdrawActions, TWithdrawConfiguration, TWithdrawSolverContext} from './useSolver.types';

type TQuote = TPortalsEstimate | null;

type TWithrawSolver = TWithdrawSolverContext<TQuote>;

const defaultProps: TWithrawSolver = {
	isApproved: false,
	isFetchingAllowance: false,
	isApproving: false,
	isDepositing: false,
	isWithdrawing: false,
	isFetchingQuote: false,
	allowance: 0n,
	quote: null,
	configuration: {
		asset: getNewInput(),
		vault: undefined,
		tokenToReceive: undefined
	},
	onApprove: async (): Promise<boolean> => false,
	onExecuteDeposit: async (): Promise<boolean> => false,
	onExecuteWithdraw: async (): Promise<boolean> => false,
	onResetWithdraw: (): void => undefined,
	dispatchConfiguration: (): void => undefined
};

const WithdrawSolverContext = createContext<TWithrawSolver>(defaultProps);

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

	/**********************************************************************************************
	 ** The vaultToken represents the token of the vault that the user wants to withdraw from. We
	 ** use getToken to retrieve the token information including balance, decimals, etc. This is
	 ** used to calculate the maximum amount that can be withdrawn and to validate the withdrawal
	 ** amount.
	 ** e.g if selected asset is DAI, vaultToken is yvDAI etc
	 *********************************************************************************************/
	const vaultToken = getToken({
		address: toAddress(configuration.vault?.address),
		chainID: configuration.vault?.chainID || 137
	});

	const pps = toNormalizedBN(
		toBigInt(configuration.vault?.pricePerShare || 0),
		configuration.vault?.token.decimals || 18
	);

	/**********************************************************************************************
	 ** This way we calculate the amount of yvToken based on the selected token by dividing amount
	 ** by price per share
	 *********************************************************************************************/
	const vaultTokenAmount = useMemo(
		() => (pps.raw ? +configuration.asset.normalizedBigAmount.display / +pps.display : 0),
		[configuration.asset.normalizedBigAmount.display, pps.display, pps.raw]
	);

	/**********************************************************************************************
	 ** Transform vaultTokenAmount to normalized
	 *********************************************************************************************/
	const normalizedVaultTokenAmount = useMemo(
		() =>
			toNormalizedBN(
				fromNormalized(vaultTokenAmount, configuration.vault?.token.decimals || 18),
				configuration.vault?.token.decimals || 18
			),
		[configuration.vault?.token.decimals, vaultTokenAmount]
	);

	/**********************************************************************************************
	 ** There are cases when normalizedVaultTokenAmount is slightly bigger than user's balance
	 ** despite correct calculations (or they are not correct). To handle this, take into futher
	 ** consideration the minimum of user balance and the calculated value.
	 *********************************************************************************************/
	const minNormalizedAmount = useMemo(() => {
		if (vaultToken.balance.raw < normalizedVaultTokenAmount.raw) {
			return vaultToken.balance;
		}
		return normalizedVaultTokenAmount;
	}, [normalizedVaultTokenAmount, vaultToken.balance]);

	const vaultInputElementLike: TTokenAmountInputElement = useMemo(
		() => ({
			amount: minNormalizedAmount.display,
			normalizedBigAmount: minNormalizedAmount,
			isValid: 'undetermined',
			token: vaultToken,
			status: 'none',
			UUID: crypto.randomUUID()
		}),
		[minNormalizedAmount, vaultToken]
	);
	const portals = usePortalsSolver(vaultInputElementLike, configuration.tokenToReceive?.address, isZapNeeded, false);
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
export const useWithdrawSolver = (): TWithrawSolver => useContext(WithdrawSolverContext);
