import { Navigate, useRoutes } from 'react-router-dom';

import { createGachaRoutes } from './gacha-routes';
import { createMarketingRoutes } from './marketing-routes';

interface AppRoutesProps {
  onDrawGacha?: () => void;
}

export function AppRoutes({ onDrawGacha }: AppRoutesProps = {}): JSX.Element | null {
  return useRoutes([
    ...createMarketingRoutes(),
    ...createGachaRoutes({ onDrawGacha }),
    { path: '*', element: <Navigate to="/home" replace /> }
  ]);
}
