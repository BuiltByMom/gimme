/* eslint-disable object-curly-newline */
'use client';

import {base, mainnet, polygon} from 'viem/chains';
import {toAddress} from '@builtbymom/web3/utils';
import {localhost} from '@builtbymom/web3/utils/wagmi';

import type {Chain} from 'viem/chains';
import type {TAddress, TNDict} from '@builtbymom/web3/types';

type TSmolChains = TNDict<
	Chain & {
		safeAPIURI: string;
		safeUIURI: string;
		coingeckoGasCoinID: string;
		llamaChainName?: string;
		yearnRouterAddress: TAddress | undefined;
		isEnabled: boolean;
	}
>;

const isDev = process.env.NODE_ENV === 'development' && Boolean(process.env.SHOULD_USE_FORKNET);
const CHAINS: TSmolChains = {
	[mainnet.id]: {
		...mainnet,
		safeAPIURI: 'https://safe-transaction-mainnet.safe.global',
		safeUIURI: 'https://app.safe.global/home?safe=eth:',
		coingeckoGasCoinID: 'ethereum',
		llamaChainName: 'ethereum',
		yearnRouterAddress: toAddress('0x1112dbcf805682e828606f74ab717abf4b4fd8de'),
		isEnabled: false
	},
	[polygon.id]: {
		...polygon,
		safeAPIURI: 'https://safe-transaction-polygon.safe.global',
		safeUIURI: 'https://app.safe.global/home?safe=matic:',
		coingeckoGasCoinID: 'matic-network',
		llamaChainName: 'polygon',
		yearnRouterAddress: toAddress('0x1112dbcf805682e828606f74ab717abf4b4fd8de'),
		isEnabled: true
	},
	// [arbitrum.id]: {
	// 	...arbitrum,
	// 	safeAPIURI: 'https://safe-transaction-arbitrum.safe.global',
	// 	safeUIURI: 'https://app.safe.global/home?safe=matic:',
	// 	coingeckoGasCoinID: 'arbitrum',
	// 	llamaChainName: 'arbitrum',
	// 	yearnRouterAddress: toAddress('0x1112dbcf805682e828606f74ab717abf4b4fd8de'),
	// 	isEnabled: true
	// },
	[base.id]: {
		...base,
		safeAPIURI: 'https://safe-transaction-base.safe.global',
		safeUIURI: 'https://app.safe.global/home?safe=base:',
		coingeckoGasCoinID: 'ethereum',
		llamaChainName: 'base',
		yearnRouterAddress: toAddress('0x1112dbcf805682e828606f74ab717abf4b4fd8de'),
		isEnabled: true
	},
	[localhost.id]: {
		...localhost,
		safeUIURI: 'https://app.safe.global/home?safe=eth:',
		safeAPIURI: 'https://safe-transaction-base.safe.global',
		coingeckoGasCoinID: 'ethereum',
		yearnRouterAddress: undefined,
		isEnabled: isDev
	}
};

const supportedNetworks: Chain[] = Object.values(CHAINS).filter(e => !e.testnet && e.isEnabled);
const supportedTestNetworks: Chain[] = Object.values(CHAINS).filter(e => e.testnet && e.isEnabled);
const networks: Chain[] = [...supportedNetworks, ...supportedTestNetworks];
const supportedNetworksWithMainnet = [CHAINS[mainnet.id], ...supportedNetworks];

export {CHAINS, isDev, networks, supportedNetworks, supportedNetworksWithMainnet, supportedTestNetworks};
