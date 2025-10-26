import { Navigate, useRoutes } from 'react-router-dom';

import { GachaPage } from '../../pages/gacha/GachaPage';

interface AppRoutesProps {
  onDrawGacha?: () => void;
}

export function AppRoutes({ onDrawGacha }: AppRoutesProps = {}): JSX.Element | null {
  return useRoutes([
    { path: '/', element: <GachaPage onDrawGacha={onDrawGacha} /> },
    { path: '*', element: <Navigate to="/" replace /> }
  ]);
}
