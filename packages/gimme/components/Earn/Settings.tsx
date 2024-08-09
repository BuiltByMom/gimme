import {Fragment, type ReactElement} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {cl} from '@builtbymom/web3/utils';
import {Dialog, DialogPanel, Transition, TransitionChild} from '@headlessui/react';
import {IconCross} from '@lib/icons/IconCross';
import {IconOptions} from '@lib/icons/IconOptions';

import {SettingsContent} from './SettingsContent';

export function Settings(props: {
	isCurtainOpen: boolean;
	onOpenCurtainChange: (isOpen: boolean) => void;
	isModalOpen: boolean;
	onOpenModalChange: (isOpen: boolean) => void;
}): ReactElement {
	return (
		<>
			<AnimatePresence>
				{props.isCurtainOpen && (
					<>
						<motion.div
							className={'invisible absolute right-0 top-0 z-[60] h-full rounded-3xl bg-white md:visible'}
							initial={{opacity: 0}}
							animate={{opacity: 1}}
							exit={{opacity: 0}}>
							<div className={'max-w-[320px]'}>
								<SettingsContent />
							</div>
						</motion.div>
						<motion.div
							className={'bg-grey-500/60 invisible absolute z-50 size-full rounded-3xl md:visible'}
							onClick={() => props.onOpenCurtainChange(false)}
							initial={{opacity: 0}}
							animate={{opacity: 1}}
							exit={{opacity: 0}}
						/>
					</>
				)}
			</AnimatePresence>

			<button
				className={
					'bg-grey-400 border-grey-300 invisible absolute -right-14 top-0 rounded-full border p-3 md:visible'
				}
				onClick={() => props.onOpenCurtainChange(!props.isCurtainOpen)}>
				{props.isCurtainOpen ? (
					<IconCross className={'text-grey-200 size-6'} />
				) : (
					<IconOptions className={'text-grey-200 size-6'} />
				)}
			</button>

			<button
				className={'bg-grey-400 border-grey-300 absolute -top-14 right-0 rounded-full border p-3 md:invisible'}
				onClick={() => props.onOpenModalChange(!props.isModalOpen)}>
				{props.isModalOpen ? (
					<IconCross className={'text-grey-200 size-6'} />
				) : (
					<IconOptions className={'text-grey-200 size-6'} />
				)}
			</button>

			<Transition
				show={props.isModalOpen}
				as={Fragment}>
				<Dialog
					as={'div'}
					className={'relative z-[1000] md:hidden'}
					onClose={() => {
						props.onOpenModalChange(false);
					}}>
					<TransitionChild
						as={Fragment}
						enter={'ease-out duration-300'}
						enterFrom={'opacity-0'}
						enterTo={'opacity-100'}
						leave={'ease-in duration-200'}
						leaveFrom={'opacity-100'}
						leaveTo={'opacity-0'}>
						<div className={'bg-grey-500/80 fixed inset-0 backdrop-blur-md transition-opacity'} />
					</TransitionChild>

					<div className={'fixed inset-0 z-[1001] w-screen overflow-y-auto'}>
						<div className={'flex min-h-full items-center justify-center p-4 sm:items-center sm:p-0'}>
							<TransitionChild
								as={Fragment}
								enter={'ease-out duration-300'}
								enterFrom={'opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95'}
								enterTo={'opacity-100 translate-y-0 sm:scale-100'}
								leave={'ease-in duration-200'}
								leaveFrom={'opacity-100 translate-y-0 sm:scale-100'}
								leaveTo={'opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95'}>
								<DialogPanel
									className={cl(
										'relative overflow-hidden flex flex-col px-2 items-center justify-center rounded-3xl  !bg-neutral-200 transition-all',
										'w-full max-w-[520px]'
									)}>
									<div className={'flex w-full justify-between px-4 pt-6'}>
										<p className={'text-grey-900 font-bold'}>{'Withdraw'}</p>
										<button
											className={'group'}
											onClick={() => props.onOpenModalChange(false)}>
											<IconCross
												className={
													'group-hover:text-grey-800 size-4 text-neutral-900 transition-colors'
												}
											/>
										</button>
									</div>
									<div>
										<SettingsContent />
									</div>
								</DialogPanel>
							</TransitionChild>
						</div>
					</div>
				</Dialog>
			</Transition>
		</>
	);
}
