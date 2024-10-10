import React from 'react';
import {Toaster} from 'react-hot-toast';
import {useRouter} from 'next/router';
import PlausibleProvider from 'next-plausible';
import {WalletContextApp} from '@builtbymom/web3/contexts/useWallet';
import {WithMom} from '@builtbymom/web3/contexts/WithMom';
import SafeProvider from '@gnosis.pm/safe-apps-react-sdk';
import {Background} from '@lib/common/Background';
import {BackgroundLanding} from '@lib/common/BackgroundLanding';
import Layout from '@lib/common/Layout';
import {Meta} from '@lib/common/Meta';
import {WithFonts} from '@lib/common/WithFonts';
import {IndexedDB} from '@lib/contexts/useIndexedDB';
import {WithNotifications} from '@lib/contexts/useNotifications';
import {WithPopularTokens} from '@lib/contexts/usePopularTokens';
import {WithPrices} from '@lib/contexts/usePrices';
import {VaultsContextApp} from '@lib/contexts/useVaults';
import {IconCheck} from '@lib/icons/IconCheck';
import {IconCircleCross} from '@lib/icons/IconCircleCross';
import {supportedNetworks, supportedNetworksWithMainnet} from '@lib/utils/tools.chains';

import type {AppProps} from 'next/app';
import type {ReactElement} from 'react';

import '../style.css';

function MyApp(props: AppProps): ReactElement {
	const {pathname} = useRouter();
	const isLandingPage = pathname === '/' || pathname === '/info';
	return (
		<WithFonts>
			<Meta
				title={'Gimme'}
				description={'DeFi yields, designed for everyone.'}
				titleColor={'#000000'}
				themeColor={'#FFD915'}
				og={'https://gimme.yearn.farm/og.png'}
				uri={'https://gimme.yearn.farm'}
			/>
			<IndexedDB>
				<WithMom
					supportedChains={supportedNetworksWithMainnet}
					tokenLists={[
						'https://raw.githubusercontent.com/SmolDapp/tokenLists/main/lists/137.json',
						'https://raw.githubusercontent.com/SmolDapp/tokenLists/main/lists/137/yearn-min.json',
						'https://raw.githubusercontent.com/SmolDapp/tokenLists/main/lists/8453.json',
						'https://raw.githubusercontent.com/SmolDapp/tokenLists/main/lists/8453/yearn-min.json'
					]}
					defaultNetwork={supportedNetworks[0]}>
					<WalletContextApp>
						<WithPopularTokens>
							<WithPrices supportedNetworks={supportedNetworks}>
								<SafeProvider>
									<VaultsContextApp>
										<WithNotifications>
											<PlausibleProvider
												domain={process.env.PLAUSIBLE_DOMAIN || 'gimme.mom'}
												enabled={true}>
												<div className={'relative'}>
													{isLandingPage ? <BackgroundLanding /> : <Background />}
													<main
														className={
															'bg-grey-500 relative mb-0 flex size-full min-h-screen flex-col'
														}>
														<Layout {...props} />
													</main>
												</div>
											</PlausibleProvider>
										</WithNotifications>
									</VaultsContextApp>
								</SafeProvider>
							</WithPrices>
						</WithPopularTokens>
					</WalletContextApp>
				</WithMom>
			</IndexedDB>
			<Toaster
				toastOptions={{
					duration: 5_000,
					className: 'toast',
					success: {
						icon: <IconCheck className={'-mr-1 size-5 min-h-5 min-w-5 pt-1.5'} />,
						iconTheme: {
							primary: 'black',
							secondary: '#F1EBD9'
						}
					},
					error: {
						icon: <IconCircleCross className={'-mr-1 size-5 min-h-5 min-w-5 pt-1.5'} />,
						iconTheme: {
							primary: 'black',
							secondary: '#F1EBD9'
						}
					}
				}}
				position={'top-right'}
			/>
		</WithFonts>
	);
}

export default MyApp;
