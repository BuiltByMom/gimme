import React from 'react';

import type {ReactElement} from 'react';

function Logo(props: React.SVGProps<SVGSVGElement>): ReactElement {
	return (
		<svg
			{...props}
			viewBox={'0 0 512 512'}
			fill={'none'}
			xmlns={'http://www.w3.org/2000/svg'}>
			<path
				d={
					'M307.3 207c82.9-9.1 148.4-75.6 156-159H456c-76.7 0-142 49.1-166.1 117.5c-8.8-16.8-19.4-32.6-31.6-47.1C296.1 48 370.5 0 456 0h24c17.7 0 32 14.3 32 32c0 113.6-84.6 207.4-194.2 222c-2.1-16.2-5.6-31.9-10.5-47.1zM48 112v16c0 97.2 78.8 176 176 176h8V288c0 0 0 0 0 0c0-97.2-78.8-176-176-176H48zM280 288v16 48l0 136c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-136h-8C100.3 352 0 251.7 0 128V96C0 78.3 14.3 64 32 64H56c123.7 0 224 100.3 224 224z'
				}
				fill={'currentcolor'}
			/>
		</svg>
	);
}

export default Logo;
