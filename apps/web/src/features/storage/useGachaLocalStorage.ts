import { useCallback, useEffect, useState } from 'react';

import type {
  GachaAppStateV3,
  GachaCatalogStateV3,
  GachaLocalStorageSnapshot,
  GachaRarityStateV3,
  HitCountsStateV3,
  PtSettingsStateV3,
  ReceiveHistoryStateV3,
  ReceivePrefsStateV3,
  RiaguStateV3,
  SaveOptionsSnapshotV3,
  UiPreferencesStateV3,
  UserInventoriesStateV3,
  UserProfilesStateV3
} from './types';

export const GACHA_STORAGE_UPDATED_EVENT = 'gacha-storage:updated';

const STORAGE_KEYS = {
  appState: 'gacha:app-state:v3',
  catalogState: 'gacha:catalog-state:v3',
  rarityState: 'gacha:rarity-state:v3',
  userInventories: 'gacha:user-inventories:v3',
  userProfiles: 'gacha:user-profiles:v3',
  hitCounts: 'gacha:hit-counts:v3',
  riaguState: 'gacha:riagu-state:v3',
  ptSettings: 'gacha:pt-settings:v3',
  uiPreferences: 'gacha:ui-preferences:v3',
  receiveHistory: 'gacha:receive:history:v3',
  receivePrefs: 'gacha:receive:prefs:v3'
} as const;

interface HookState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: GachaLocalStorageSnapshot | null;
  error?: string;
}

function parseJsonValue<T>(key: string): T | undefined {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return undefined;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`Failed to parse localStorage value for ${key}`, error);
    return undefined;
  }
}

function collectSaveOptions(): Record<string, SaveOptionsSnapshotV3> {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return {};
  }

  const result: Record<string, SaveOptionsSnapshotV3> = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith('gacha:save-options:last-upload:v3:')) {
      continue;
    }

    const userId = key.split(':').at(-1);
    if (!userId) {
      continue;
    }

    const value = parseJsonValue<SaveOptionsSnapshotV3>(key);
    if (value) {
      result[userId] = value;
    }
  }

  return result;
}

function loadSnapshot(): GachaLocalStorageSnapshot {
  const appState = parseJsonValue<GachaAppStateV3>(STORAGE_KEYS.appState);
  const catalogState = parseJsonValue<GachaCatalogStateV3>(STORAGE_KEYS.catalogState);
  const rarityState = parseJsonValue<GachaRarityStateV3>(STORAGE_KEYS.rarityState);
  const userInventories = parseJsonValue<UserInventoriesStateV3>(STORAGE_KEYS.userInventories);
  const userProfiles = parseJsonValue<UserProfilesStateV3>(STORAGE_KEYS.userProfiles);
  const hitCounts = parseJsonValue<HitCountsStateV3>(STORAGE_KEYS.hitCounts);
  const riaguState = parseJsonValue<RiaguStateV3>(STORAGE_KEYS.riaguState);
  const ptSettings = parseJsonValue<PtSettingsStateV3>(STORAGE_KEYS.ptSettings);
  const uiPreferences = parseJsonValue<UiPreferencesStateV3>(STORAGE_KEYS.uiPreferences);
  const receiveHistory = parseJsonValue<ReceiveHistoryStateV3>(STORAGE_KEYS.receiveHistory);
  const receivePrefs = parseJsonValue<ReceivePrefsStateV3>(STORAGE_KEYS.receivePrefs);
  const saveOptions = collectSaveOptions();

  return {
    appState,
    catalogState,
    rarityState,
    userInventories,
    userProfiles,
    hitCounts,
    riaguState,
    ptSettings,
    uiPreferences,
    saveOptions,
    receiveHistory,
    receivePrefs
  };
}

export function useGachaLocalStorage(): HookState & { reload: () => void } {
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
      const snapshot = loadSnapshot();
      setState({ status: 'ready', data: snapshot });
    } catch (error) {
      setState({
        status: 'error',
        data: null,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }, []);

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
