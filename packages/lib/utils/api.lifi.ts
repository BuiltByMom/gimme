import axios from 'axios';

type TLifiToken = {
	address: string;
	chainId: number;
	symbol: string;
	decimals: number;
	name: string;
	coinKey: string;
	logoURI: string;
	priceUSD: string;
};

export type TLifiStatusResponse = {
	transactionId: string;
	sending: {
		txHash: string;
		txLink: string;
		amount: string;
		token: TLifiToken;
		chainId: number;
		amountUSD: string;
		value: string;
		timestamp: number;
	};
	receiving: {
		txHash: string;
		txLink: string;
		amount: string;
		token: TLifiToken;
		chainId: number;
		amountUSD: string;
		value: string;
		timestamp: number;
	};
	fromAddress: string;
	toAddress: string;
	tool: string;
	substatus: string;
	status: 'NOT_FOUND' | 'INVALID' | 'PENDING' | 'DONE' | 'FAILED';
	lifiExplorerLink: string;
	substatusMessage: string;
};
export async function getLifiStatus(params: {
	fromChainID: number;
	toChainID: number;
	txHash: string;
}): Promise<TLifiStatusResponse> {
	const result = await axios.get('https://li.quest/v1/status', {
		params: {
			fromChain: params.fromChainID,
			toChain: params.toChainID,
			txHash: params.txHash
		}
	});
	return result.data;
}
