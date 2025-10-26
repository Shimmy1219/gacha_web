import { Navigate, type RouteObject } from 'react-router-dom';

import { HomePage } from '../../pages/home/HomePage';
import { PrivacyPolicyPage } from '../../pages/privacy-policy/PrivacyPolicyPage';
import { ReceivePage } from '../../pages/receive/ReceivePage';

export function createMarketingRoutes(): RouteObject[] {
  return [
    {
      path: '/home',
      element: <HomePage />
    },
    {
      path: '/privacyPolicy',
      element: <PrivacyPolicyPage />
    },
    {
      path: '/receive',
      element: <ReceivePage />
    },
    {
      path: '/',
      element: <Navigate to="/home" replace />
    }
  ];
}
