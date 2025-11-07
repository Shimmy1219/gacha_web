import { useMemo } from 'react';

import type { GachaAppStateV3 } from '@domain/app-persistence';
import { useStoreValue } from '@domain/stores';

import { useDomainStores } from '../../../features/storage/AppPersistenceProvider';

function hasRegisteredGacha(appState: GachaAppStateV3 | undefined): boolean {
  if (!appState) {
    return false;
  }

  const order = Array.isArray(appState.order) ? appState.order.filter(Boolean) : [];
  if (order.length > 0) {
    return true;
  }

  const metaEntries = appState.meta ? Object.values(appState.meta) : [];
  return metaEntries.some((entry) => entry && typeof entry === 'object' && entry.isArchived !== true);
}

export function useGachaRegistrationState(): {
  appState: GachaAppStateV3 | undefined;
  hasRegisteredGacha: boolean;
  shouldShowSplash: boolean;
  isHydrated: boolean;
} {
  const { appState: appStateStore } = useDomainStores();
  const appState = useStoreValue(appStateStore);

  const hasRegisteredGacha = useMemo(() => hasRegisteredGacha(appState), [appState]);
  const isHydrated = appStateStore.isHydrated();
  const shouldShowSplash = isHydrated && !hasRegisteredGacha;

  return {
    appState,
    hasRegisteredGacha,
    shouldShowSplash,
    isHydrated
  };
}

