import type { RouteObject } from 'react-router-dom';

import { GachaPage } from '../../pages/gacha/GachaPage';

interface GachaRouteOptions {
  onDrawGacha?: () => void;
}

export function createGachaRoutes({ onDrawGacha }: GachaRouteOptions = {}): RouteObject[] {
  return [
    {
      path: '/gacha',
      element: <GachaPage onDrawGacha={onDrawGacha} />
    }
  ];
}
