import {type ReactElement, type ReactNode} from 'react';
import {useRouter} from 'next/router';
import {AnimatePresence, motion} from 'framer-motion';
import {LicenseInfo} from '@lib/common/LicenseInfo';
import {TopBar} from '@lib/common/TopBar';

import type {AppProps} from 'next/app';

type TAppProp = {
	children: ReactNode;
};

function App(props: TAppProp): ReactElement {
	return <section className={'my-auto flex w-full justify-center px-2 pb-[130px]'}>{props.children}</section>;
}

export default function Layout(props: AppProps): ReactElement {
	const {Component, router} = props;
	const {pathname} = useRouter();

	const isLandingPage = pathname === '/' || pathname === '/info';

	return (
		<>
			<div className={'z-[60] mx-4 mt-4 md:mx-auto md:mt-10 md:w-full md:max-w-[847px]'}>
				<TopBar router={router} />
			</div>
			<App>
				<AnimatePresence>
					<motion.div
						className={'z-50 flex w-full justify-center'}
						initial={{scale: 0.9, opacity: 0}}
						animate={{scale: 1, opacity: 1}}
						transition={{
							delay: router.isReady ? 0.2 : 0.4,
							duration: 0.6,
							ease: 'easeInOut'
						}}>
						<Component {...props} />
					</motion.div>
				</AnimatePresence>
			</App>
			<div className={'absolute inset-x-0 bottom-40 z-[60] md:bottom-0'}>
				{isLandingPage ? <LicenseInfo /> : null}
			</div>
		</>
	);
}
