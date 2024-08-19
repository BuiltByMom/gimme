import {type ReactElement, useCallback} from 'react';
import InputNumber from 'rc-input-number';
import {useLocalStorage} from 'usehooks-ts';
import {cl} from '@builtbymom/web3/utils';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import {Switch as CustomSwitch} from '@lib/common/Switch';

const SLIPPAGE_TYPE_VALUES = {
	AUTO: 0,
	CUSTOM: 1
};

const SLIPPAGE_OPTIONS = [
	{title: 'Auto', value: SLIPPAGE_TYPE_VALUES.AUTO},
	{title: 'Custom', value: SLIPPAGE_TYPE_VALUES.CUSTOM}
];

export function SettingsContent(): ReactElement {
	const [slippageType, set_slippageType] = useLocalStorage('type', SLIPPAGE_TYPE_VALUES.AUTO);

	const [slippage, set_slippage] = useLocalStorage('slippage', '1');
	const [deadline, set_deadline] = useLocalStorage('deadline', '60');
	const [withPermit, set_withPermit] = useLocalStorage('withPermit', true);

	const isSlippageInputDisabled = slippageType === SLIPPAGE_TYPE_VALUES.AUTO;

	const onChangeSlippage = useCallback(
		(slippage: string | null) => {
			set_slippage(slippage || '');
		},
		[set_slippage]
	);

	const onSwitch = useCallback(
		(value: number) => {
			onChangeSlippage('1');
			set_slippageType(value);
		},
		[onChangeSlippage, set_slippageType]
	);

	const onChangeDeadline = useCallback(
		(deadline: string | null) => {
			set_deadline(deadline || '');
		},
		[set_deadline]
	);

	const togglePermit = useCallback(
		(value: boolean) => {
			set_withPermit(value);
		},
		[set_withPermit]
	);

	return (
		<div className={'z-10 flex w-full flex-col gap-6 px-4 py-6'}>
			<div className={'flex flex-col gap-2'}>
				<p className={'text-xs font-bold'}>{'Slippage'}</p>
				<div className={'flex gap-2'}>
					<div className={'basis-1/2'}>
						<CustomSwitch
							options={SLIPPAGE_OPTIONS}
							onSelectValue={onSwitch}
							value={slippageType}
						/>
					</div>
					<div className={cl('relative basis-1/2', isSlippageInputDisabled ? 'cursor-not-allowed' : '')}>
						<InputNumber
							className={cl(
								'bg-gray-100 text-xs transition-all tabular-nums',
								'text-grey-800',
								'placeholder:transition-colors'
							)}
							prefixCls={'options'}
							placeholder={'0.00'}
							value={slippage}
							onChange={onChangeSlippage}
							disabled={slippageType === SLIPPAGE_TYPE_VALUES.AUTO}
							decimalSeparator={'.'}
							min={'0.1'}
							max={'10'}
							step={0.1}
						/>
						<p
							className={cl(
								'pointer-events-none absolute right-3.5 top-3',
								slippage !== '' ? 'text-grey-800' : 'text-grey-700'
							)}>
							{'%'}
						</p>
					</div>
				</div>
			</div>
			<div className={'flex flex-col gap-2'}>
				<p className={'text-xs font-bold'}>{'Transaction deadline (min)'}</p>
				<InputNumber
					className={cl(
						'bg-gray-100 text-xs transition-all tabular-nums',
						'text-grey-800 placeholder:text-grey-700 focus:placeholder:text-grey-400/30',
						'placeholder:transition-colors'
					)}
					prefixCls={'!text-left options'}
					placeholder={'0.00'}
					value={deadline}
					onChange={onChangeDeadline}
					decimalSeparator={'.'}
					min={'1'}
					max={'60'}
					step={0.1}
				/>
			</div>
			<div className={'flex flex-col gap-2'}>
				<p className={'text-xs font-bold'}>{'Use permission'}</p>
				<div className={'flex gap-4'}>
					<p className={'text-grey-700 text-xs'}>
						{'Leave this switch untouched to use gasless approvals when possible'}
					</p>
					<SwitchPrimitive.Root
						className={'SwitchRoot'}
						onCheckedChange={togglePermit}
						checked={withPermit}>
						<SwitchPrimitive.Thumb className={'SwitchThumb'} />
					</SwitchPrimitive.Root>
				</div>
			</div>
		</div>
	);
}
