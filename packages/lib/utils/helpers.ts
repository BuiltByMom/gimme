/* eslint-disable prefer-destructuring */

import {formatAmount, zeroNormalizedBN} from '@builtbymom/web3/utils';

import type {TNormalizedBN} from '@builtbymom/web3/types';
import type {TTokenAmountInputElement} from '@lib/types/utils';

/******************************************************************************
 ** Used to slugify a string.
 ** Src: https://gist.github.com/mathewbyrne/1280286
 *****************************************************************************/
export function slugify(text: string): string {
	return text
		.toString()
		.toLowerCase()
		.replace(/\s+/g, '-') // Replace spaces with -
		.replace(/[^\w-]+/g, '') // Remove all non-word chars
		.replace(/--+/g, '-') // Replace multiple - with single -
		.replace(/^-+/, '') // Trim - from start of text
		.replace(/-+$/, ''); // Trim - from end of text
}

export function handleLowAmount(normalizedBN: TNormalizedBN, min = 0, max = 6): string {
	const expected = formatAmount(normalizedBN.normalized, min, max);
	if (Number(expected) === 0) {
		return `< ${formatAmount(normalizedBN.normalized, max - 1, max - 1)}1`;
	}
	return expected;
}

/******************************************************************************
 ** Create a new empty TTokenAmountInputElement.
 *****************************************************************************/
export function getNewInput(): TTokenAmountInputElement {
	return {
		amount: '',
		normalizedBigAmount: zeroNormalizedBN,
		isValid: 'undetermined',
		token: undefined,
		status: 'none',
		UUID: crypto.randomUUID()
	};
}

export const secondToTime = (seconds: number): string => {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor((seconds % 3600) % 60);
	if (h === 0 && m === 0) {
		return `${s}s`;
	}
	if (h === 0) {
		return `${m}m ${s}s`;
	}
	return `${h}h ${m}m ${s}s`;
};
