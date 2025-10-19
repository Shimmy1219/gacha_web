import { useCallback, useMemo, useState, useEffect } from 'react';

import type {
  GachaAppStateV3,
  GachaLocalStorageSnapshot,
  GachaRarityStateV3
} from '@domain/app-persistence';
import {
  DEFAULT_USER_FILTER_PREFERENCES,
  type UserFilterPreferences,
  UiPreferencesStore
} from '@domain/stores/uiPreferencesStore';
import { useDomainStores } from '../../storage/AppPersistenceProvider';
import type {
  UserCardProps,
  UserInventoryEntryItem
} from '../../../components/cards/UserCard';

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
  const rarityMap = new Map<string, { id: string; label: string; description?: string }>();

  gachaOrder.forEach((gachaId) => {
    const rarityIds = rarityState.byGacha?.[gachaId] ?? [];
    rarityIds.forEach((rarityId) => {
      const entity = rarityState.entities?.[rarityId];
      if (!entity) {
        return;
      }
      if (!rarityMap.has(rarityId)) {
        rarityMap.set(rarityId, {
          id: rarityId,
          label: entity.label ?? rarityId,
          description: entity.shortName && entity.shortName !== entity.label ? entity.shortName : undefined
        });
      }
    });
  });

  if (rarityMap.size === 0) {
    return [];
  }

  const ordered = Array.from(rarityMap.values()).sort((a, b) => {
    const baseIndexA = BASE_RARITY_ORDER.indexOf(a.label);
    const baseIndexB = BASE_RARITY_ORDER.indexOf(b.label);
    const aIndex = baseIndexA === -1 ? Number.POSITIVE_INFINITY : baseIndexA;
    const bIndex = baseIndexB === -1 ? Number.POSITIVE_INFINITY : baseIndexB;
    if (aIndex !== bIndex) {
      return aIndex - bIndex;
    }
    return a.label.localeCompare(b.label, 'ja');
  });

  return ordered.map((entry) => ({
    value: entry.id,
    label: entry.label,
    description: entry.description
  }));
}

function getUiPreferences(store: UiPreferencesStore | undefined): UserFilterPreferences {
  if (!store) {
    return { ...DEFAULT_USER_FILTER_PREFERENCES };
  }
  return store.getUserFilterPreferences();
}

function useUserFilterStateFromStore(store: UiPreferencesStore | undefined): UserFilterState {
  const preferencesState = useStoreState(store);
  return useMemo(() => getUiPreferences(store), [preferencesState, store]);
}

export function useUserFilterState(): UserFilterState {
  const { uiPreferences } = useDomainStores();
  return useUserFilterStateFromStore(uiPreferences);
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

  const state = useUserFilterStateFromStore(uiPreferences);

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

type DerivedUser = Omit<UserCardProps, 'onExport'>;

interface BuildUsersParams {
  snapshot: GachaLocalStorageSnapshot | null;
  filters: UserFilterState;
}

const FALLBACK_RARITY_COLOR = '#a1a1aa';

function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase();
}

function matchesSelection(selection: '*' | string[], value: string): boolean {
  if (selection === '*') {
    return true;
  }
  return selection.includes(value);
}

function buildFilteredUsers({ snapshot, filters }: BuildUsersParams): { users: DerivedUser[]; showCounts: boolean } {
  if (!snapshot || !snapshot.userProfiles?.users || !snapshot.userInventories?.inventories) {
    return { users: [], showCounts: filters.showCounts };
  }

  const profiles = snapshot.userProfiles.users;
  const inventoriesByUser = snapshot.userInventories.inventories;
  const catalogByGacha = snapshot.catalogState?.byGacha ?? {};
  const appMeta = snapshot.appState?.meta ?? {};
  const rarityEntities = snapshot.rarityState?.entities ?? {};
  const gachaOrder = snapshot.appState?.order ?? [];
  const gachaOrderIndex = new Map<string, number>();
  gachaOrder.forEach((gachaId, index) => {
    gachaOrderIndex.set(gachaId, index);
  });

  const keyword = normalizeKeyword(filters.keyword);
  const hasKeyword = keyword.length > 0;
  const gachaSelection = filters.selectedGachaIds === '*' ? '*' : [...new Set(filters.selectedGachaIds)];
  const raritySelection = filters.selectedRarityIds === '*' ? '*' : [...new Set(filters.selectedRarityIds)];

  const users: DerivedUser[] = [];

  Object.values(profiles).forEach((profile) => {
    const userId = profile.id;
    const inventoriesForUser = inventoriesByUser[userId];
    if (!inventoriesForUser) {
      return;
    }

    if (hasKeyword) {
      const haystack = [profile.displayName, profile.handle, profile.team, profile.role, userId]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(keyword)) {
        return;
      }
    }

    const inventories: UserCardProps['inventories'] = [];

    const inventoriesList = Object.values(inventoriesForUser);
    inventoriesList.sort((a, b) => {
      const orderA = gachaOrderIndex.get(a.gachaId) ?? Number.POSITIVE_INFINITY;
      const orderB = gachaOrderIndex.get(b.gachaId) ?? Number.POSITIVE_INFINITY;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      const nameA = appMeta[a.gachaId]?.displayName ?? a.gachaId;
      const nameB = appMeta[b.gachaId]?.displayName ?? b.gachaId;
      return nameA.localeCompare(nameB, 'ja');
    });

    inventoriesList.forEach((inventory) => {
      if (!matchesSelection(gachaSelection, inventory.gachaId)) {
        return;
      }

      const itemsByRarity = inventory.items ?? {};
      const countsByRarity = inventory.counts ?? {};

      const pulls: UserInventoryEntryItem[] = [];

      Object.entries(itemsByRarity).forEach(([rarityId, itemIds]) => {
        if (!Array.isArray(itemIds) || itemIds.length === 0) {
          return;
        }
        if (!matchesSelection(raritySelection, rarityId)) {
          return;
        }

        const fallbackCounts = new Map<string, number>();
        itemIds.forEach((itemId) => {
          fallbackCounts.set(itemId, (fallbackCounts.get(itemId) ?? 0) + 1);
        });

        const sortedItemIds = Array.from(fallbackCounts.keys()).sort((a, b) => a.localeCompare(b, 'ja'));

        sortedItemIds.forEach((itemId) => {
          const catalogItem = catalogByGacha[inventory.gachaId]?.items?.[itemId];
          if (filters.showSkipOnly && !catalogItem?.riagu) {
            return;
          }

          const explicitCount = countsByRarity[rarityId]?.[itemId];
          const totalCount = typeof explicitCount === 'number' && explicitCount > 0
            ? explicitCount
            : fallbackCounts.get(itemId) ?? 0;

          if (totalCount <= 0) {
            return;
          }

          const rarityEntity = rarityEntities[rarityId];
          pulls.push({
            itemId,
            itemName: catalogItem?.name ?? itemId,
            rarity: {
              rarityId,
              label: rarityEntity?.label ?? rarityId,
              color: rarityEntity?.color ?? FALLBACK_RARITY_COLOR,
              rarityNum: rarityEntity?.sortOrder
            },
            count: totalCount
          });
        });
      });

      if (pulls.length === 0) {
        return;
      }

      inventories.push({
        inventoryId: inventory.inventoryId,
        gachaId: inventory.gachaId,
        gachaName: appMeta[inventory.gachaId]?.displayName ?? inventory.gachaId,
        pulls
      });
    });

    if (inventories.length === 0) {
      return;
    }

    const totalPulls = inventories.reduce(
      (total, inventory) => total + inventory.pulls.reduce((sum, item) => sum + item.count, 0),
      0
    );

    users.push({
      userId,
      userName: profile.displayName || userId,
      totalSummary: `${totalPulls}連`,
      memo: [profile.team, profile.role].filter(Boolean).join(' / ') || undefined,
      inventories,
      expandedByDefault: users.length === 0
    });
  });

  return { users, showCounts: filters.showCounts };
}

export function useFilteredUsers(
  snapshot: GachaLocalStorageSnapshot | null
): { users: DerivedUser[]; showCounts: boolean } {
  const filters = useUserFilterState();

  return useMemo(() => buildFilteredUsers({ snapshot, filters }), [snapshot, filters]);
}
