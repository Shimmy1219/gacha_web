import { Navigate, Outlet, useRoutes } from 'react-router-dom';

import { GachaLayout, type GachaLayoutProps } from '../../layouts/GachaLayout';
import { MarketingLayout } from '../../layouts/MarketingLayout';
import { HomePage } from '../../pages/home/HomePage';
import { ReceivePage } from '../../pages/receive/ReceivePage';
import { ReceiveHistoryPage } from '../../pages/receive/ReceiveHistoryPage';
import { ReceiveListPage } from '../../pages/receive/ReceiveListPage';
import { GachaPage } from '../../pages/gacha/GachaPage';
import { GachaTestPage } from '../../pages/gachaTest/GachaTestPage';

interface AppRoutesProps {
  gachaLayoutProps: Omit<GachaLayoutProps, 'children'>;
}

function GachaLayoutContainer({ layoutProps }: { layoutProps: Omit<GachaLayoutProps, 'children'> }): JSX.Element {
  return (
    <GachaLayout {...layoutProps}>
      <Outlet />
    </GachaLayout>
  );
}

function MarketingLayoutContainer(): JSX.Element {
  return (
    <MarketingLayout>
      <Outlet />
    </MarketingLayout>
  );
}

export function AppRoutes({ gachaLayoutProps }: AppRoutesProps): JSX.Element | null {
  return useRoutes([
    {
      path: '/',
      element: <MarketingLayoutContainer />,
      children: [
        { index: true, element: <Navigate to="home" replace /> },
        { path: 'home', element: <HomePage /> }
      ]
    },
    {
      path: '/',
      element: <GachaLayoutContainer layoutProps={gachaLayoutProps} />,
      children: [
        {
          path: 'gacha',
          element: (
            <GachaPage
              onDrawGacha={gachaLayoutProps.onDrawGacha}
              onRegisterGacha={gachaLayoutProps.onRegisterGacha}
              onOpenPageSettings={gachaLayoutProps.onOpenPageSettings}
            />
          )
        },
        { path: 'gacha/test', element: <GachaTestPage /> },
        { path: 'receive', element: <ReceivePage /> },
        { path: 'receive/history', element: <ReceiveHistoryPage /> },
        { path: 'receive/list', element: <ReceiveListPage /> }
      ]
    },
    { path: '*', element: <Navigate to="/home" replace /> }
  ]);
}
