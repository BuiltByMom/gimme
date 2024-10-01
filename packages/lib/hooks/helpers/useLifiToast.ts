import toast, {useToaster, useToasterStore} from 'react-hot-toast';
import {getLifiStatus} from '@lib/utils/api.lifi';

import type {Hex} from 'viem';
import type {TLifiStatusResponse} from '@lib/utils/api.lifi';

export function useLifiToast(): {
	addToast: (fromChainID: number, outputTokenChainId: number | undefined, txHash: Hex) => Promise<void>;
} {
	const {toasts, pausedAt} = useToasterStore();
	const {toasts: toasts2, pause} = useToaster();
	console.log(toasts);
	console.log(toasts2);
	const addToast = async (
		fromChainID: number,
		outputTokenChainId: number | undefined,
		txHash: Hex
	): Promise<void> => {
		const promise = new Promise(async (resolve, reject) => {
			let result: TLifiStatusResponse;
			do {
				result = await getLifiStatus({
					fromChainID: fromChainID,
					toChainID: Number(outputTokenChainId),
					txHash
				});
				console.log(result);
				await new Promise(res => setTimeout(res, 5000));
			} while (result.status !== 'DONE' && result.status !== 'FAILED');

			if (result.status === 'FAILED') {
				console.log('reject');
				reject();
			} else {
				console.log('resolve');
				resolve('DONE');
			}
		});
		console.log(promise);
		toast.promise(
			promise,
			{
				loading: 'Waiting for confirmation on chain X for you swap Y',
				success: 'Transaction confirmed',
				error: 'Transaction failed'
			},
			{
				style: {
					minWidth: '250px'
				},

				success: {
					duration: 5000
				},
				error: {duration: 5000}
			}
		);
	};

	return {addToast};
}
