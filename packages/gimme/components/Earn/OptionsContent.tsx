import {type ReactElement, useState} from 'react';
import InputNumber from 'rc-input-number';
import {cl} from '@builtbymom/web3/utils';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import {Switch as CustomSwitch} from '@lib/common/Switch';

const SWITCH_OPTIONS = [
	{title: 'Auto', value: 0},
	{title: 'Custom', value: 1}
];

export function OptionsContent(): ReactElement {
	const [value, set_value] = useState(0);
	return (
		<div className={'z-10 flex w-full flex-col gap-6 px-4 py-6'}>
			<div className={'flex flex-col gap-2'}>
				<p className={'text-xs font-bold'}>{'Slippage'}</p>
				<div className={'flex gap-2'}>
					<div className={'basis-1/2'}>
						<CustomSwitch
							options={SWITCH_OPTIONS}
							onSelectValue={set_value}
							value={value}
						/>
					</div>
					<div className={'basis-1/2'}>
						<InputNumber
							className={cl(
								'bg-gray-100 text-xs transition-all tabular-nums',
								'text-grey-800 placeholder:text-grey-700 focus:placeholder:text-grey-400/30',
								'placeholder:transition-colors'
							)}
							prefixCls={'options'}
							placeholder={'0.00'}
							value={'0'}
							decimalSeparator={'.'}
							min={'0'}
							step={0.1}
						/>
					</div>
				</div>
				<p className={'text-red text-xs'}>
					{'Enter slippage percentage between 0% and 50% long error text example'}
				</p>
			</div>
			<div className={'flex flex-col gap-2'}>
				<p className={'text-xs font-bold'}>{'Transaction deadline'}</p>
				<InputNumber
					className={cl(
						'bg-gray-100 text-xs transition-all tabular-nums',
						'text-grey-800 placeholder:text-grey-700 focus:placeholder:text-grey-400/30',
						'placeholder:transition-colors'
					)}
					prefixCls={'!text-left options'}
					placeholder={'0.00'}
					value={'0'}
					decimalSeparator={'.'}
					min={'0'}
					step={0.1}
				/>
			</div>
			<div className={'flex flex-col gap-2'}>
				<p className={'text-xs font-bold'}>{'Use permission'}</p>
				<div className={'flex gap-4'}>
					<p className={'text-grey-700 text-xs'}>
						{'Description text example text example text example text example text example text example'}
					</p>
					<SwitchPrimitive.Root className={'SwitchRoot'}>
						<SwitchPrimitive.Thumb className={'SwitchThumb'} />
					</SwitchPrimitive.Root>
				</div>
			</div>
		</div>
	);
}
