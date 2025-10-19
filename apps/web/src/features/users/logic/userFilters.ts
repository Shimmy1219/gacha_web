import { useCallback, useMemo, useState, useEffect } from 'react';

import type { GachaAppStateV3, GachaRarityStateV3 } from '@domain/app-persistence';
import {
  DEFAULT_USER_FILTER_PREFERENCES,
  type UserFilterPreferences,
  UiPreferencesStore
} from '@domain/stores/uiPreferencesStore';
import { useDomainStores } from '../../storage/AppPersistenceProvider';

interface StoreLike<T> {
  getState(): T | undefined;
  subscribe(listener: (state: T | undefined) => void): () => void;
}

function useStoreState<T>(store: StoreLike<T>): T | undefined {
  const [state, setState] = useState<T | undefined>(() => store.getState());

  useEffect(() => {
    const unsubscribe = store.subscribe(setState);
    return unsubscribe;
  }, [store]);

  return state;
}

export interface UserFilterOption {
  value: string;
  label: string;
  description?: string;
}

export type UserFilterState = UserFilterPreferences;

export interface UserFilterController {
  state: UserFilterState;
  setSelectedGachaIds(value: '*' | string[]): void;
  setSelectedRarityIds(value: '*' | string[]): void;
  setHideMiss(next: boolean): void;
  setShowCounts(next: boolean): void;
  setShowSkipOnly(next: boolean): void;
  setKeyword(keyword: string): void;
  reset(): void;
}

function buildGachaOptions(state?: GachaAppStateV3): UserFilterOption[] {
  if (!state || !Array.isArray(state.order) || state.order.length === 0) {
    return [];
  }

  const ids = [...state.order];
  ids.sort((a, b) => {
    const nameA = state.meta?.[a]?.displayName ?? a;
    const nameB = state.meta?.[b]?.displayName ?? b;
    const compared = String(nameA).localeCompare(String(nameB), 'ja');
    if (compared !== 0) {
      return compared;
    }
    return a.localeCompare(b, 'ja');
  });

  return ids.map((id) => ({
    value: id,
    label: state.meta?.[id]?.displayName ?? id,
    description: id
  }));
}

const BASE_RARITY_ORDER = ['UR', 'SSR', 'SR', 'R', 'N', 'はずれ'];

function buildRarityOptions(appState?: GachaAppStateV3, rarityState?: GachaRarityStateV3): UserFilterOption[] {
  if (!rarityState) {
    return [];
  }

  const gachaOrder = appState?.order ?? Object.keys(rarityState.byGacha ?? {});
  const rarityLabels = new Map<string, { label: string; description?: string }>();

  gachaOrder.forEach((gachaId) => {
    const rarityIds = rarityState.byGacha?.[gachaId] ?? [];
    rarityIds.forEach((rarityId) => {
      const entity = rarityState.entities?.[rarityId];
      if (!entity) {
        return;
      }
      const label = entity.label ?? rarityId;
      if (!rarityLabels.has(label)) {
        rarityLabels.set(label, {
          label,
          description: entity.shortName && entity.shortName !== entity.label ? entity.shortName : undefined
        });
      }
    });
  });

  if (rarityLabels.size === 0) {
    return [];
  }

  const baseLabels = BASE_RARITY_ORDER.filter((label) => rarityLabels.has(label));
  const extraLabels = Array.from(rarityLabels.keys())
    .filter((label) => !BASE_RARITY_ORDER.includes(label))
    .sort((a, b) => a.localeCompare(b, 'ja'));
  const orderedLabels = [...baseLabels, ...extraLabels];

  return orderedLabels.map((label) => {
    const info = rarityLabels.get(label);
    return {
      value: label,
      label: label,
      description: info?.description
    } satisfies UserFilterOption;
  });
}

function getUiPreferences(store: UiPreferencesStore | undefined): UserFilterPreferences {
  if (!store) {
    return { ...DEFAULT_USER_FILTER_PREFERENCES };
  }
  return store.getUserFilterPreferences();
}

export function useUserFilterOptions(): { gachaOptions: UserFilterOption[]; rarityOptions: UserFilterOption[] } {
  const { appState, rarities } = useDomainStores();
  const appStateValue = useStoreState(appState);
  const rarityStateValue = useStoreState(rarities);

  const gachaOptions = useMemo(() => buildGachaOptions(appStateValue), [appStateValue]);
  const rarityOptions = useMemo(
    () => buildRarityOptions(appStateValue, rarityStateValue),
    [appStateValue, rarityStateValue]
  );

  return { gachaOptions, rarityOptions };
}

export function useUserFilterController(): UserFilterController {
  const { uiPreferences } = useDomainStores();
  const preferencesState = useStoreState(uiPreferences);

  const state = useMemo(() => getUiPreferences(uiPreferences), [preferencesState, uiPreferences]);

  const updatePreferences = useCallback(
    (updater: (previous: UserFilterPreferences) => UserFilterPreferences) => {
      uiPreferences.updateUserFilterPreferences(updater, { persist: 'debounced' });
    },
    [uiPreferences]
  );

  const setSelectedGachaIds = useCallback(
    (value: '*' | string[]) => {
      updatePreferences((previous) => ({
        ...previous,
        selectedGachaIds: value === '*' ? '*' : [...new Set(value)]
      }));
    },
    [updatePreferences]
  );

  const setSelectedRarityIds = useCallback(
    (value: '*' | string[]) => {
      updatePreferences((previous) => ({
        ...previous,
        selectedRarityIds: value === '*' ? '*' : [...new Set(value)]
      }));
    },
    [updatePreferences]
  );

  const setHideMiss = useCallback(
    (next: boolean) => {
      updatePreferences((previous) => ({
        ...previous,
        hideMiss: Boolean(next)
      }));
    },
    [updatePreferences]
  );

  const setShowCounts = useCallback(
    (next: boolean) => {
      updatePreferences((previous) => ({
        ...previous,
        showCounts: Boolean(next)
      }));
    },
    [updatePreferences]
  );

  const setShowSkipOnly = useCallback(
    (next: boolean) => {
      updatePreferences((previous) => ({
        ...previous,
        showSkipOnly: Boolean(next)
      }));
    },
    [updatePreferences]
  );

  const setKeyword = useCallback(
    (keyword: string) => {
      updatePreferences((previous) => ({
        ...previous,
        keyword
      }));
    },
    [updatePreferences]
  );

  const reset = useCallback(() => {
    uiPreferences.setUserFilterPreferences({ ...DEFAULT_USER_FILTER_PREFERENCES }, { persist: 'debounced' });
  }, [uiPreferences]);

  return {
    state,
    setSelectedGachaIds,
    setSelectedRarityIds,
    setHideMiss,
    setShowCounts,
    setShowSkipOnly,
    setKeyword,
    reset
  };
}
