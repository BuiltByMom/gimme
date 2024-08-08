import {type ReactElement} from 'react';
import {BalancesModalContextApp} from '@lib/contexts/useBalancesModal';
import {DepositSolverContextApp} from '@lib/contexts/useDepositSolver';

import {Earn} from '../components/Earn';

function EarnPage(): ReactElement {
	return (
		<DepositSolverContextApp>
			<BalancesModalContextApp>
				<Earn />
			</BalancesModalContextApp>
		</DepositSolverContextApp>
	);
}

export default EarnPage;
