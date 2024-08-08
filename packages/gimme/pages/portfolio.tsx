import {type ReactElement} from 'react';
import {BalancesModalContextApp} from '@lib/contexts/useBalancesModal';
import {WithdrawSolverContextApp} from '@lib/contexts/useWithdrawSolver';

import {Portfolio} from '../components/Portfolio';

function PortfolioPage(): ReactElement {
	return (
		<WithdrawSolverContextApp>
			<BalancesModalContextApp>
				<Portfolio />
			</BalancesModalContextApp>
		</WithdrawSolverContextApp>
	);
}

export default PortfolioPage;
