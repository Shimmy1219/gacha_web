import { useCallback, useEffect, useState } from 'react';

import {
  GACHA_STORAGE_UPDATED_EVENT,
  type GachaLocalStorageSnapshot
} from '../../../../../packages/domain/app-persistence';
import { useAppPersistence } from './AppPersistenceProvider';

interface HookState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: GachaLocalStorageSnapshot | null;
  error?: string;
}

export function useGachaLocalStorage(): HookState & { reload: () => void } {
  const persistence = useAppPersistence();
  const [state, setState] = useState<HookState>(() => ({
    status: typeof window === 'undefined' ? 'idle' : 'loading',
    data: null
  }));

  const reload = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      setState({ status: 'idle', data: null, error: 'ブラウザ環境ではありません' });
      return;
    }

    try {
      const snapshot = persistence.loadSnapshot();
      setState({ status: 'ready', data: snapshot });
    } catch (error) {
      setState({
        status: 'error',
        data: null,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }, [persistence]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }
    reload();
  }, [reload]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleStorage = (_event: StorageEvent): void => {
      reload();
    };

    const handleCustom = (_event: Event): void => {
      reload();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(GACHA_STORAGE_UPDATED_EVENT, handleCustom);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(GACHA_STORAGE_UPDATED_EVENT, handleCustom);
    };
  }, [reload]);

  return { ...state, reload };
}
