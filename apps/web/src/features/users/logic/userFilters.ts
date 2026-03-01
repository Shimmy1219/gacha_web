import { useCallback, useMemo, useState, useEffect } from 'react';

import type {
  GachaAppStateV3,
  GachaLocalStorageSnapshot,
  GachaRarityStateV3
} from '@domain/app-persistence';
import {
  applyLegacyAssetsToInstances,
  alignOriginalPrizeInstances,
  buildOriginalPrizeInstanceMap
} from '@domain/originalPrize';
import {
  DEFAULT_USER_FILTER_PREFERENCES,
  type UserFilterSortOrder,
  type UserFilterPreferences,
  UiPreferencesStore
} from '@domain/stores/uiPreferencesStore';
import { useDomainStores } from '../../storage/AppPersistenceProvider';
import type {
  UserCardProps,
  UserInventoryEntryItem
} from '../../../pages/gacha/components/cards/UserCard';

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
  setSelectedRarityIds(value: '*' | string[]): void;
  setUserSortOrder(next: UserFilterSortOrder): void;
  setHideMiss(next: boolean): void;
  setShowCounts(next: boolean): void;
  setShowSkipOnly(next: boolean): void;
  setShowUnobtainedItems(next: boolean): void;
  setKeyword(keyword: string): void;
  reset(): void;
}

const USER_SORT_OPTIONS: UserFilterOption[] = [
  { value: 'name_asc', label: '名前順（昇順）' },
  { value: 'name_desc', label: '名前順（降順）' },
  { value: 'oldest', label: '古い順' },
  { value: 'newest', label: '新しい順' }
];

/**
 * ユーザーフィルタで利用するガチャ選択肢を組み立てる。
 * アーカイブ済みガチャを除外し、表示名（同値時はID）で安定ソートする。
 *
 * @param state ガチャのアプリ状態
 * @returns フィルタ用ガチャ選択肢
 */
export function buildUserFilterGachaOptions(state?: GachaAppStateV3): UserFilterOption[] {
  if (!state || !Array.isArray(state.order) || state.order.length === 0) {
    return [];
  }

  const ids = state.order.filter((id) => state.meta?.[id]?.isArchived !== true);
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

  const baseGachaOrder = appState?.order ?? Object.keys(rarityState.byGacha ?? {});
  const gachaOrder = baseGachaOrder.filter((gachaId) => appState?.meta?.[gachaId]?.isArchived !== true);
  const rarityMap = new Map<string, { id: string; label: string }>();

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
          label: entity.label ?? rarityId
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
    label: entry.label
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

export function useUserFilterOptions(): { rarityOptions: UserFilterOption[]; sortOptions: UserFilterOption[] } {
  const { appState, rarities } = useDomainStores();
  const appStateValue = useStoreState(appState);
  const rarityStateValue = useStoreState(rarities);

  const rarityOptions = useMemo(
    () => buildRarityOptions(appStateValue, rarityStateValue),
    [appStateValue, rarityStateValue]
  );
  const sortOptions = useMemo(
    () => USER_SORT_OPTIONS.map((option) => ({ ...option })),
    []
  );

  return { rarityOptions, sortOptions };
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

  const setSelectedRarityIds = useCallback(
    (value: '*' | string[]) => {
      updatePreferences((previous) => ({
        ...previous,
        selectedRarityIds: value === '*' ? '*' : [...new Set(value)]
      }));
    },
    [updatePreferences]
  );

  const setUserSortOrder = useCallback(
    (next: UserFilterSortOrder) => {
      updatePreferences((previous) => ({
        ...previous,
        userSortOrder: next
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

  const setShowUnobtainedItems = useCallback(
    (next: boolean) => {
      updatePreferences((previous) => ({
        ...previous,
        showUnobtainedItems: Boolean(next)
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
    setSelectedRarityIds,
    setUserSortOrder,
    setHideMiss,
    setShowCounts,
    setShowSkipOnly,
    setShowUnobtainedItems,
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

function parseDateToTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
}

function resolveProfileChronologicalTimestamp(
  profile: GachaLocalStorageSnapshot['userProfiles']['users'][string] | undefined
): number | null {
  if (!profile) {
    return null;
  }
  const joinedAtTimestamp = parseDateToTimestamp(profile.joinedAt);
  if (joinedAtTimestamp !== null) {
    return joinedAtTimestamp;
  }
  return parseDateToTimestamp(profile.updatedAt);
}

function compareUsersByName(a: DerivedUser, b: DerivedUser): number {
  const compared = a.userName.localeCompare(b.userName, 'ja');
  if (compared !== 0) {
    return compared;
  }
  return a.userId.localeCompare(b.userId, 'ja');
}

function compareUsersByChronologicalOrder(
  a: DerivedUser,
  b: DerivedUser,
  profileByUserId: GachaLocalStorageSnapshot['userProfiles']['users'],
  newerFirst: boolean
): number {
  const timestampA = resolveProfileChronologicalTimestamp(profileByUserId[a.userId]);
  const timestampB = resolveProfileChronologicalTimestamp(profileByUserId[b.userId]);

  if (timestampA !== null && timestampB !== null && timestampA !== timestampB) {
    return newerFirst ? timestampB - timestampA : timestampA - timestampB;
  }
  if (timestampA !== null && timestampB === null) {
    return -1;
  }
  if (timestampA === null && timestampB !== null) {
    return 1;
  }
  return compareUsersByName(a, b);
}

function sortFilteredUsers(
  users: DerivedUser[],
  profileByUserId: GachaLocalStorageSnapshot['userProfiles']['users'],
  sortOrder: UserFilterSortOrder
): DerivedUser[] {
  const sortedUsers = [...users];

  sortedUsers.sort((a, b) => {
    switch (sortOrder) {
      case 'name_asc':
        return compareUsersByName(a, b);
      case 'name_desc':
        return compareUsersByName(b, a);
      case 'newest':
        return compareUsersByChronologicalOrder(a, b, profileByUserId, true);
      case 'oldest':
      default:
        return compareUsersByChronologicalOrder(a, b, profileByUserId, false);
    }
  });

  return sortedUsers;
}

function matchesSelection(selection: '*' | string[], value: string): boolean {
  if (selection === '*') {
    return true;
  }
  return selection.includes(value);
}

function isMissRarity(rarityId: string, rarityLabel: string | undefined): boolean {
  if (rarityId === 'rar-miss') {
    return true;
  }
  if (!rarityLabel) {
    return false;
  }
  return rarityLabel.trim() === 'はずれ';
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
  const pullHistory = snapshot.pullHistory;
  const gachaOrder = (snapshot.appState?.order ?? []).filter(
    (gachaId) => snapshot.appState?.meta?.[gachaId]?.isArchived !== true
  );
  const gachaOrderIndex = new Map<string, number>();
  gachaOrder.forEach((gachaId, index) => {
    gachaOrderIndex.set(gachaId, index);
  });

  const keyword = normalizeKeyword(filters.keyword);
  const hasKeyword = keyword.length > 0;
  const raritySelection = filters.selectedRarityIds === '*' ? '*' : [...new Set(filters.selectedRarityIds)];
  const showUnobtainedItems = filters.showUnobtainedItems;

  const users: DerivedUser[] = [];

  Object.values(profiles).forEach((profile) => {
    const userId = profile.id;
    const inventoriesForUser = inventoriesByUser[userId];
    if (!inventoriesForUser) {
      return;
    }

    if (hasKeyword) {
      const haystack = [profile.displayName, userId]
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
      const meta = appMeta[inventory.gachaId];
      if (meta?.isArchived) {
        return;
      }

      const gachaCatalog = catalogByGacha[inventory.gachaId];
      const catalogItems = gachaCatalog?.items ?? {};
      const catalogOrder = Array.isArray(gachaCatalog?.order) ? gachaCatalog.order : Object.keys(catalogItems);
      const catalogItemsByRarity = new Map<string, string[]>();
      const catalogOrderSet = new Set<string>();

      catalogOrder.forEach((itemId) => {
        catalogOrderSet.add(itemId);
        const item = catalogItems[itemId];
        if (!item) {
          return;
        }
        const list = catalogItemsByRarity.get(item.rarityId) ?? [];
        list.push(item.itemId);
        catalogItemsByRarity.set(item.rarityId, list);
      });

      Object.values(catalogItems).forEach((item) => {
        if (catalogOrderSet.has(item.itemId)) {
          return;
        }
        const list = catalogItemsByRarity.get(item.rarityId) ?? [];
        list.push(item.itemId);
        catalogItemsByRarity.set(item.rarityId, list);
      });

      const itemsByRarity = inventory.items ?? {};
      const countsByRarity = inventory.counts ?? {};
      const originalPrizeAssetsByItem = inventory.originalPrizeAssets ?? {};

      const originalPrizeItemIds = new Set<string>();
      Object.values(countsByRarity).forEach((record) => {
        Object.keys(record ?? {}).forEach((itemId) => {
          const catalogItem = catalogItems[itemId];
          if (catalogItem?.originalPrize) {
            originalPrizeItemIds.add(itemId);
          }
        });
      });

      Object.values(itemsByRarity).forEach((itemIds) => {
        if (!Array.isArray(itemIds)) {
          return;
        }
        itemIds.forEach((itemId) => {
          const catalogItem = catalogItems[itemId];
          if (catalogItem?.originalPrize) {
            originalPrizeItemIds.add(itemId);
          }
        });
      });

      const originalPrizeInstanceMap = buildOriginalPrizeInstanceMap({
        pullHistory,
        userId,
        gachaId: inventory.gachaId,
        targetItemIds: originalPrizeItemIds
      });

      const pulls: UserInventoryEntryItem[] = [];
      const rarityIdSet = new Set<string>(Object.keys(itemsByRarity));
      if (showUnobtainedItems) {
        catalogItemsByRarity.forEach((_items, rarityId) => {
          rarityIdSet.add(rarityId);
        });
      }

      rarityIdSet.forEach((rarityId) => {
        const itemIds = itemsByRarity[rarityId];
        if (!matchesSelection(raritySelection, rarityId)) {
          return;
        }

        const rarityEntity = rarityEntities[rarityId];
        if (filters.hideMiss && isMissRarity(rarityId, rarityEntity?.label)) {
          return;
        }

        const fallbackCounts = new Map<string, number>();
        if (Array.isArray(itemIds)) {
          itemIds.forEach((itemId) => {
            fallbackCounts.set(itemId, (fallbackCounts.get(itemId) ?? 0) + 1);
          });
        }

        const explicitCounts = countsByRarity[rarityId] ?? {};
        const catalogItemIds = catalogItemsByRarity.get(rarityId) ?? [];
        const itemIdSet = new Set<string>();
        if (showUnobtainedItems) {
          catalogItemIds.forEach((itemId) => {
            itemIdSet.add(itemId);
          });
        }
        Object.keys(explicitCounts).forEach((itemId) => {
          itemIdSet.add(itemId);
        });
        fallbackCounts.forEach((_count, itemId) => {
          itemIdSet.add(itemId);
        });

        if (itemIdSet.size === 0) {
          return;
        }

        const orderIndex = new Map<string, number>();
        catalogItemIds.forEach((itemId, index) => {
          orderIndex.set(itemId, index);
        });
        const orderedItemIds = Array.from(itemIdSet).sort((a, b) => {
          const orderA = orderIndex.get(a) ?? Number.POSITIVE_INFINITY;
          const orderB = orderIndex.get(b) ?? Number.POSITIVE_INFINITY;
          if (orderA !== orderB) {
            return orderA - orderB;
          }
          return a.localeCompare(b, 'ja');
        });

        orderedItemIds.forEach((itemId) => {
          const catalogItem = catalogItems[itemId];
          if (filters.showSkipOnly && !catalogItem?.riagu) {
            return;
          }

          const explicitCount = explicitCounts[itemId];
          const totalCount = typeof explicitCount === 'number' && explicitCount > 0
            ? explicitCount
            : fallbackCounts.get(itemId) ?? 0;
          const isMissing = totalCount <= 0;

          if (isMissing && !showUnobtainedItems) {
            return;
          }

          const isOriginalPrize = Boolean(catalogItem?.originalPrize);
          const instances = isOriginalPrize
            ? applyLegacyAssetsToInstances(
                alignOriginalPrizeInstances(originalPrizeInstanceMap[itemId] ?? [], totalCount, itemId),
                originalPrizeAssetsByItem[itemId]
              )
            : undefined;

          pulls.push({
            itemId,
            itemName: catalogItem?.name ?? itemId,
            rarity: {
              rarityId,
              label: rarityEntity?.label ?? rarityId,
              color: rarityEntity?.color ?? FALLBACK_RARITY_COLOR,
              rarityNum: rarityEntity?.sortOrder
            },
            count: totalCount,
            isMissing,
            isOriginalPrize,
            originalPrizeInstances: instances
          });
        });
      });

      if (pulls.length === 0) {
        return;
      }

      inventories.push({
        inventoryId: inventory.inventoryId,
        gachaId: inventory.gachaId,
        gachaName: meta?.displayName ?? inventory.gachaId,
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

    const discordDisplayName = profile.discordDisplayName?.trim();
    const discordUserName = profile.discordUserName?.trim();
    const discordAvatarAssetId =
      Object.prototype.hasOwnProperty.call(profile, 'discordAvatarAssetId')
        ? profile.discordAvatarAssetId ?? null
        : undefined;
    const discordAvatarUrl =
      Object.prototype.hasOwnProperty.call(profile, 'discordAvatarUrl')
        ? profile.discordAvatarUrl ?? null
        : undefined;

    users.push({
      userId,
      userName: profile.displayName || userId,
      totalSummary: `${totalPulls}連`,
      inventories,
      expandedByDefault: users.length === 0,
      discordDisplayName: discordDisplayName || undefined,
      discordUserName: discordUserName || undefined,
      discordAvatarAssetId,
      discordAvatarUrl
    });
  });

  return {
    users: sortFilteredUsers(users, profiles, filters.userSortOrder),
    showCounts: filters.showCounts
  };
}

export function useFilteredUsers(
  snapshot: GachaLocalStorageSnapshot | null
): { users: DerivedUser[]; showCounts: boolean } {
  const filters = useUserFilterState();

  return useMemo(() => buildFilteredUsers({ snapshot, filters }), [snapshot, filters]);
}
