import {type ReactElement, type ReactNode, useCallback, useEffect, useMemo, useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {usePlausible} from 'next-plausible';
import {erc20Abi} from 'viem';
import {useBlockNumber} from 'wagmi';
import {useWeb3} from '@builtbymom/web3/contexts/useWeb3';
import {useAsyncTrigger} from '@builtbymom/web3/hooks/useAsyncTrigger';
import {toAddress, toBigInt, toNormalizedBN, zeroNormalizedBN} from '@builtbymom/web3/utils';
import {retrieveConfig} from '@builtbymom/web3/utils/wagmi';
import {readContracts} from '@wagmi/core';
import {Counter} from '@lib/common/Counter';
import {NetworkSelector} from '@lib/common/NetworkSelector';
import {usePrices} from '@lib/contexts/usePrices';
import {useVaults} from '@lib/contexts/useVaults';
import {useSortedVaults} from '@lib/hooks/useSortedVaults';
import {IconLoader} from '@lib/icons/IconLoader';
import {Button} from '@lib/primitives/Button';
import {VAULT_V3_ABI} from '@lib/utils/abi/vaultV3.abi';
import {PLAUSIBLE_EVENTS} from '@lib/utils/plausible';

import {VaultRow} from './VaultRow';
import {VaultsListHead} from './VaultsListHead';
import {WithdrawModal} from './Withdraw/WithdrawModal';

import type {TDict, TNormalizedBN, TSortDirection, TToken} from '@builtbymom/web3/types';
import type {TPossibleSortBy} from '@lib/hooks/useSortedVaults';

function EmptyView({isLoading = false}: {isLoading?: boolean}): ReactElement {
	const {address, openLoginModal} = useWeb3();
	const plausible = usePlausible();

	const router = useRouter();
	const currentPage = router.pathname;

	const onConnect = useCallback(() => {
		plausible(PLAUSIBLE_EVENTS.CONNECT_WALLET, {props: {currentPage}});
		openLoginModal();
	}, [currentPage, openLoginModal, plausible]);

	return (
		<div
			className={
				'text-grey-700 border-grey-600 flex h-[248px] w-full flex-col items-center justify-center rounded-lg border border-dashed'
			}>
			{isLoading ? (
				<IconLoader className={'size-4 animate-spin text-neutral-900 transition-opacity'} />
			) : address ? (
				<div className={'flex w-full flex-col items-center px-1'}>
					<p>{'Your Portfolio is empty.'}</p>
					<p className={'max-w-[380px] text-center'}>{'Select Token at Earn section and add opportunity.'}</p>
					<Link
						className={'w-full max-w-[320px]'}
						href={'/earn'}>
						<Button className={'mt-6 !w-full !rounded-2xl'}>{'Add opportunity'}</Button>
					</Link>
				</div>
			) : (
				<div className={'flex w-full max-w-[320px] flex-col items-center px-1'}>
					<p className={'text-center'}>{'Get started by connecting your wallet'}</p>
					<button
						onClick={onConnect}
						className={
							'bg-primary hover:bg-primaryHover text-grey-900 mt-6 h-14 !w-full rounded-2xl px-[13px] font-bold transition-colors'
						}>
						{'Connect wallet'}
					</button>
				</div>
			)}
		</div>
	);
}

export function Portfolio(): ReactNode {
	const {userVaults, userVaultsArray, isLoadingUserVaults} = useVaults();
	const {address} = useWeb3();
	const [balances, set_balances] = useState<TDict<TNormalizedBN>>({});
	const {data: blockNumber} = useBlockNumber({watch: true});
	const [isWithdrawOpen, set_isWithdrawOpen] = useState(false);
	const [selectedChainID, set_selectedChainID] = useState(-1);

	const {getPrices, pricingHash} = usePrices();
	const allPrices = useMemo(() => {
		pricingHash;
		const allTokens: TToken[] = [];
		for (const vault of userVaultsArray) {
			allTokens.push({address: vault.token.address, chainID: vault.chainID} as TToken);
			allTokens.push({address: vault.address, chainID: vault.chainID} as TToken);
		}
		return getPrices(allTokens);
	}, [pricingHash, getPrices, userVaultsArray]);

	const {sortedVaults, sortBy, sortDirection, onChangeSort} = useSortedVaults(userVaultsArray, balances, allPrices);

	const filteredByChain = sortedVaults.filter(vault => {
		if (selectedChainID === -1) {
			return sortedVaults;
		}
		return vault.chainID === selectedChainID;
	});
	const isEmpty = filteredByChain.length === 0;

	/**********************************************************************************************
	 * Function that should be triggered on every block update. This lets us display the up-to-date
	 * balances without the need to refresh the page.
	 *********************************************************************************************/
	const refetch = useAsyncTrigger(async (): Promise<void> => {
		blockNumber;
		const calls = [];

		if (userVaultsArray.length === 0) {
			return;
		}

		for (const vault of userVaultsArray) {
			calls.push({
				abi: vault.staking.available ? erc20Abi : VAULT_V3_ABI,
				address: toAddress(vault.staking.available ? vault.staking.address : vault.address),
				chainId: vault.chainID,
				functionName: 'balanceOf',
				args: [toAddress(address)]
			});
			calls.push({
				abi: VAULT_V3_ABI,
				address: toAddress(vault.address),
				chainId: vault.chainID,
				functionName: 'pricePerShare'
			});
		}

		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		const data = await readContracts(retrieveConfig(), {
			contracts: calls
		});

		const result: TDict<TNormalizedBN> = {};

		for (let i = 0; i < userVaultsArray.length; i++) {
			const iterator = i * 2;
			const {address} = userVaultsArray[i];

			const balanceOf = (data[iterator].result || 0n) as bigint;
			const pricePerShare = (data[iterator + 1].result || 0n) as bigint;

			result[address] = toNormalizedBN(
				(balanceOf * pricePerShare) / toBigInt(10 ** userVaultsArray[i].decimals),
				userVaultsArray[i].decimals
			);
		}
		set_balances(result);
	}, [address, userVaultsArray, blockNumber]);

	/**********************************************************************************************
	 * Total savings in USD
	 *********************************************************************************************/
	const totalDeposited = useMemo(() => {
		blockNumber;
		if (!userVaults || Object.values(balances).length === 0 || userVaultsArray.length === 0) {
			return zeroNormalizedBN.normalized;
		}

		const balancesUsd = [];
		for (const balance in balances) {
			if (!userVaults[balance]) {
				continue;
			}

			const vaultTokenAddress = userVaults[balance].token.address;
			const vaultChainId = userVaults[balance].chainID;
			const price = allPrices?.[vaultChainId]?.[vaultTokenAddress] || zeroNormalizedBN;
			const usdValue = balances[balance].normalized * price.normalized;

			balancesUsd.push(usdValue);
		}

		return balancesUsd.reduce((acc, current) => current + acc, 0);
	}, [blockNumber, userVaults, balances, userVaultsArray.length, allPrices]);

	const getLayout = (): ReactNode => {
		if (!address) {
			return <EmptyView />;
		}
		if (isLoadingUserVaults) {
			return <EmptyView isLoading />;
		}
		if (isEmpty) {
			return <EmptyView />;
		}

		return (
			<div className={'flex max-h-[366px] flex-col gap-2 overflow-y-auto'}>
				{filteredByChain.map(vault => (
					<VaultRow
						key={vault.address}
						vault={vault}
						price={allPrices?.[vault.chainID]?.[vault.token.address] || zeroNormalizedBN}
						balance={balances[vault.address] || zeroNormalizedBN}
						onWithdrawModalChange={set_isWithdrawOpen}
					/>
				))}
			</div>
		);
	};

	useEffect(() => {
		refetch();
	}, [blockNumber, refetch]);

	return (
		<div
			className={
				'md:mt:0 border-grey-200 z-20 mb-12 mt-6 w-full max-w-[864px] rounded-2xl border bg-white p-8 md:mb-0'
			}>
			<div className={'mb-12 flex items-start justify-between '}>
				<div className={'font-medium'}>
					<p className={'text-grey-900 mb-2 text-xs'}>{'Your Savings'}</p>
					<p className={'text-grey-800 text-4xl'}>
						{'$'}
						<Counter
							value={totalDeposited}
							decimals={4}
							decimalsToDisplay={[4]}
							decimalsClassName={'!text-grey-200'}
							shouldBeStylized
						/>
					</p>
				</div>
				<NetworkSelector
					selectedChainId={selectedChainID}
					onNetworkChange={set_selectedChainID}
				/>
			</div>

			<div className={'flex w-full flex-col'}>
				<VaultsListHead
					title={'Your Opportunities'}
					sortBy={sortBy}
					sortDirection={sortDirection}
					onSort={(newSortBy: string, newSortDirection: string | null): void => {
						onChangeSort(newSortDirection as TSortDirection, newSortBy as TPossibleSortBy);
					}}
					items={[
						{value: 'apy', label: 'APY', isSortable: true},
						{value: 'savings', label: 'Savings', isSortable: true},
						{value: 'yield', label: 'Est. Yield', isSortable: true},
						{value: 'actions', label: 'Widtraw/Deposit', isSortable: false}
					]}
				/>
				{getLayout()}
			</div>
			<WithdrawModal
				isOpen={isWithdrawOpen}
				onOpenChange={set_isWithdrawOpen}
				balances={balances}
			/>
		</div>
	);
}
