import {
  AppPersistence,
  type UserInventoriesStateV3,
  type UserInventorySnapshotV3
} from '../app-persistence';
import { PersistedStore, type UpdateOptions } from './persistedStore';

function calculateInventoryTotal(
  items: Record<string, string[]> | undefined,
  counts: Record<string, Record<string, number>> | undefined
): number {
  let total = 0;

  const rarityIds = new Set([
    ...Object.keys(items ?? {}),
    ...Object.keys(counts ?? {})
  ]);

  rarityIds.forEach((rarityId) => {
    const fallbackCounts = new Map<string, number>();
    const itemIds = items?.[rarityId];
    if (Array.isArray(itemIds)) {
      itemIds.forEach((itemId) => {
        fallbackCounts.set(itemId, (fallbackCounts.get(itemId) ?? 0) + 1);
      });
    }

    const explicitCounts = counts?.[rarityId] ?? {};
    const itemKeys = new Set([
      ...fallbackCounts.keys(),
      ...Object.keys(explicitCounts)
    ]);

    itemKeys.forEach((itemId) => {
      const fallback = fallbackCounts.get(itemId) ?? 0;
      const explicit = explicitCounts[itemId];
      const value = typeof explicit === 'number' && explicit > 0 ? explicit : fallback;
      if (value > 0) {
        total += value;
      }
    });
  });

  return total;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeItemsMap(raw: unknown): Record<string, string[]> {
  if (!isRecord(raw)) {
    return {};
  }
  const result: Record<string, string[]> = {};
  for (const [rarityId, entries] of Object.entries(raw)) {
    if (!Array.isArray(entries)) {
      continue;
    }
    const normalized = entries.filter((item): item is string => typeof item === 'string' && item.length > 0);
    if (normalized.length > 0) {
      result[rarityId] = normalized;
    }
  }
  return result;
}

function normalizeCountsMap(raw: unknown): Record<string, Record<string, number>> {
  if (!isRecord(raw)) {
    return {};
  }
  const result: Record<string, Record<string, number>> = {};
  for (const [rarityId, counts] of Object.entries(raw)) {
    if (!isRecord(counts)) {
      continue;
    }
    const normalized: Record<string, number> = {};
    for (const [itemId, value] of Object.entries(counts)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        normalized[itemId] = Math.floor(value);
      }
    }
    if (Object.keys(normalized).length > 0) {
      result[rarityId] = normalized;
    }
  }
  return result;
}

function normalizeInventorySnapshot(
  raw: unknown,
  fallbackInventoryId: string
): UserInventorySnapshotV3 | null {
  if (!isRecord(raw)) {
    return null;
  }

  const gachaId = typeof raw.gachaId === 'string' && raw.gachaId.length > 0 ? raw.gachaId : undefined;
  if (!gachaId) {
    return null;
  }

  const preferredId =
    typeof raw.inventoryId === 'string' && raw.inventoryId.length > 0 ? raw.inventoryId : undefined;
  const inventoryId = preferredId ?? (fallbackInventoryId.length > 0 ? fallbackInventoryId : undefined);
  if (!inventoryId) {
    return null;
  }

  const items = normalizeItemsMap(raw.items);
  const counts = normalizeCountsMap(raw.counts);
  const normalizedCounts = Object.keys(counts).length > 0 ? counts : undefined;
  const totalCount = calculateInventoryTotal(items, normalizedCounts);

  const snapshot: UserInventorySnapshotV3 = {
    inventoryId,
    gachaId,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    items,
    counts: normalizedCounts ?? {},
    notes: typeof raw.notes === 'string' ? raw.notes : undefined
  };

  if (totalCount > 0) {
    snapshot.totalCount = totalCount;
  }

  return snapshot;
}

function rebuildByItemId(
  inventories: UserInventoriesStateV3['inventories']
): UserInventoriesStateV3['byItemId'] {
  const result: UserInventoriesStateV3['byItemId'] = {};

  if (!inventories) {
    return result;
  }

  for (const [userId, snapshots] of Object.entries(inventories)) {
    for (const snapshot of Object.values(snapshots ?? {})) {
      if (!snapshot) {
        continue;
      }

      const itemsByRarity = snapshot.items ?? {};
      const countsByRarity = snapshot.counts ?? {};

      const rarityIds = new Set([
        ...Object.keys(itemsByRarity),
        ...Object.keys(countsByRarity)
      ]);

      rarityIds.forEach((rarityId) => {
        const fallbackCounts = new Map<string, number>();
        const itemIds = itemsByRarity[rarityId];
        if (Array.isArray(itemIds)) {
          itemIds.forEach((itemId) => {
            fallbackCounts.set(itemId, (fallbackCounts.get(itemId) ?? 0) + 1);
          });
        }

        const explicitCounts = countsByRarity[rarityId] ?? {};
        const itemKeys = new Set([
          ...fallbackCounts.keys(),
          ...Object.keys(explicitCounts)
        ]);

        itemKeys.forEach((itemId) => {
          const fallback = fallbackCounts.get(itemId) ?? 0;
          const explicit = explicitCounts[itemId];
          const total = typeof explicit === 'number' && explicit > 0 ? explicit : fallback;

          if (total <= 0) {
            return;
          }

          if (!result[itemId]) {
            result[itemId] = [];
          }

          result[itemId].push({
            userId,
            gachaId: snapshot.gachaId,
            rarityId,
            count: total
          });
        });
      });
    }
  }

  return result;
}

function normalizeUserInventoriesState(
  state: UserInventoriesStateV3 | undefined
): UserInventoriesStateV3 | undefined {
  if (!state) {
    return undefined;
  }

  const normalizedInventories: UserInventoriesStateV3['inventories'] = {};

  for (const [userId, rawInventories] of Object.entries(state.inventories ?? {})) {
    if (!isRecord(rawInventories)) {
      continue;
    }

    const normalizedSnapshots: Record<string, UserInventorySnapshotV3> = {};

    for (const [key, rawSnapshot] of Object.entries(rawInventories)) {
      const fallbackKey = typeof key === 'string' ? key : '';
      const snapshot = normalizeInventorySnapshot(rawSnapshot, fallbackKey);
      if (!snapshot) {
        continue;
      }

      normalizedSnapshots[snapshot.inventoryId] = snapshot;
    }

    if (Object.keys(normalizedSnapshots).length > 0) {
      normalizedInventories[userId] = normalizedSnapshots;
    }
  }

  return {
    version: typeof state.version === 'number' ? state.version : 3,
    updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : new Date().toISOString(),
    inventories: normalizedInventories,
    byItemId: rebuildByItemId(normalizedInventories)
  };
}

export class UserInventoryStore extends PersistedStore<UserInventoriesStateV3 | undefined> {
  constructor(persistence: AppPersistence) {
    super(persistence);
  }

  hydrate(initialState: UserInventoriesStateV3 | undefined): void {
    super.hydrate(normalizeUserInventoriesState(initialState));
  }

  private loadLatestState(): UserInventoriesStateV3 | undefined {
    try {
      return normalizeUserInventoriesState(this.persistence.loadSnapshot().userInventories);
    } catch (error) {
      console.warn('UserInventoryStore failed to load snapshot from persistence', error);
      return undefined;
    }
  }

  setInventoryItemCount(
    params: {
      userId: string;
      inventoryId: string;
      rarityId: string;
      itemId: string;
      count: number;
      updatedAt?: string;
    },
    options: UpdateOptions = { persist: 'immediate' }
  ): void {
    const { userId, inventoryId, rarityId, itemId, count, updatedAt } = params;

    if (!userId || !inventoryId || !rarityId || !itemId) {
      console.warn('UserInventoryStore.setInventoryItemCount called with insufficient identifiers', params);
      return;
    }

    const normalizedCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    const timestamp = updatedAt ?? new Date().toISOString();

    this.update((previous) => {
      const baseState = previous ?? this.loadLatestState();

      if (!baseState?.inventories) {
        console.warn('UserInventoryStore.setInventoryItemCount could not access inventories state');
        return previous;
      }

      const userInventories = baseState.inventories[userId];
      if (!userInventories) {
        console.warn('UserInventoryStore.setInventoryItemCount could not find inventories for user', params);
        return previous;
      }

      const snapshot = userInventories[inventoryId];
      if (!snapshot) {
        console.warn('UserInventoryStore.setInventoryItemCount could not find inventory snapshot', params);
        return previous;
      }

      const nextItems: Record<string, string[]> = snapshot.items ? { ...snapshot.items } : {};
      const nextCounts: Record<string, Record<string, number>> = snapshot.counts
        ? { ...snapshot.counts }
        : {};

      const currentList = Array.isArray(nextItems[rarityId]) ? [...nextItems[rarityId]] : [];
      const filteredList = currentList.filter((value) => value !== itemId);
      if (normalizedCount > 0) {
        const updatedList = [...filteredList];
        for (let index = 0; index < normalizedCount; index += 1) {
          updatedList.push(itemId);
        }
        updatedList.sort((a, b) => a.localeCompare(b, 'ja'));
        nextItems[rarityId] = updatedList;
      } else if (filteredList.length > 0) {
        nextItems[rarityId] = filteredList;
      } else {
        delete nextItems[rarityId];
      }

      const countsForRarity = { ...(nextCounts[rarityId] ?? {}) };
      if (normalizedCount > 0) {
        countsForRarity[itemId] = normalizedCount;
        nextCounts[rarityId] = countsForRarity;
      } else {
        delete countsForRarity[itemId];
        if (Object.keys(countsForRarity).length > 0) {
          nextCounts[rarityId] = countsForRarity;
        } else {
          delete nextCounts[rarityId];
        }
      }

      const normalizedCounts = Object.keys(nextCounts).length > 0 ? nextCounts : undefined;
      const totalCount = calculateInventoryTotal(nextItems, normalizedCounts);

      const nextSnapshot: UserInventorySnapshotV3 = {
        ...snapshot,
        items: Object.keys(nextItems).length > 0 ? nextItems : {},
        totalCount,
        updatedAt: timestamp
      };

      if (normalizedCounts) {
        nextSnapshot.counts = normalizedCounts;
      } else if (nextSnapshot.counts) {
        delete (nextSnapshot as Partial<UserInventorySnapshotV3>).counts;
      }

      const nextUserInventories = { ...userInventories, [inventoryId]: nextSnapshot };
      const nextInventories = { ...baseState.inventories, [userId]: nextUserInventories };
      const nextByItemId = rebuildByItemId(nextInventories);

      return {
        ...baseState,
        updatedAt: timestamp,
        inventories: nextInventories,
        byItemId: nextByItemId
      };
    }, options);
  }

  updateItemRarity(params: {
    gachaId: string;
    itemId: string;
    previousRarityId: string;
    nextRarityId: string;
    updatedAt?: string;
  }): void {
    const { gachaId, itemId, previousRarityId, nextRarityId, updatedAt } = params;

    if (!gachaId || !itemId || !previousRarityId || !nextRarityId) {
      console.warn('UserInventoryStore.updateItemRarity called with insufficient identifiers', params);
      return;
    }

    if (previousRarityId === nextRarityId) {
      return;
    }

    const timestamp = updatedAt ?? new Date().toISOString();

    this.update(
      (previous) => {
        const baseState = previous ?? this.loadLatestState();

        if (!baseState) {
          console.warn('UserInventoryStore.updateItemRarity could not access inventories state');
          return previous;
        }

        let inventoriesChanged = false;
        const nextInventories: UserInventoriesStateV3['inventories'] = {};

        for (const [userId, inventories] of Object.entries(baseState.inventories ?? {})) {
          let userChanged = false;
          const nextUserInventories: typeof inventories = {};

          for (const [inventoryId, snapshot] of Object.entries(inventories ?? {})) {
            if (!snapshot || snapshot.gachaId !== gachaId) {
              nextUserInventories[inventoryId] = snapshot;
              continue;
            }

            const itemsByRarity = snapshot.items ?? {};
            const sourceItems = Array.isArray(itemsByRarity[previousRarityId])
              ? itemsByRarity[previousRarityId] ?? []
              : [];
            const occurrences = sourceItems.reduce(
              (total, value) => (value === itemId ? total + 1 : total),
              0
            );

            const countsByRarity = snapshot.counts ?? {};
            const sourceCounts = countsByRarity[previousRarityId];
            const explicitCount =
              typeof sourceCounts?.[itemId] === 'number' && sourceCounts[itemId] > 0
                ? sourceCounts[itemId]
                : undefined;

            if (occurrences === 0 && explicitCount === undefined) {
              nextUserInventories[inventoryId] = snapshot;
              continue;
            }

            userChanged = true;

            const nextItems = { ...itemsByRarity };
            const nextCounts = snapshot.counts ? { ...snapshot.counts } : {};

            const filteredSource = sourceItems.filter((value) => value !== itemId);
            if (filteredSource.length > 0) {
              nextItems[previousRarityId] = filteredSource;
            } else {
              delete nextItems[previousRarityId];
            }

            const moveCount = explicitCount ?? occurrences;
            const targetItems = Array.isArray(nextItems[nextRarityId])
              ? [...nextItems[nextRarityId]]
              : [];
            if (moveCount > 0) {
              for (let index = 0; index < moveCount; index += 1) {
                targetItems.push(itemId);
              }
              targetItems.sort((a, b) => a.localeCompare(b, 'ja'));
              nextItems[nextRarityId] = targetItems;
            } else if (targetItems.length === 0) {
              delete nextItems[nextRarityId];
            } else {
              nextItems[nextRarityId] = targetItems;
            }

            if (sourceCounts && Object.prototype.hasOwnProperty.call(sourceCounts, itemId)) {
              const nextSourceCounts = { ...sourceCounts };
              const movedExplicit = nextSourceCounts[itemId];
              delete nextSourceCounts[itemId];

              if (Object.keys(nextSourceCounts).length > 0) {
                nextCounts[previousRarityId] = nextSourceCounts;
              } else {
                delete nextCounts[previousRarityId];
              }

              if (typeof movedExplicit === 'number' && movedExplicit > 0) {
                const targetCountsRecord = { ...(nextCounts[nextRarityId] ?? {}) };
                targetCountsRecord[itemId] = (targetCountsRecord[itemId] ?? 0) + movedExplicit;
                nextCounts[nextRarityId] = targetCountsRecord;
              }
            }

            const normalizedCounts = Object.keys(nextCounts).length > 0 ? nextCounts : undefined;

            nextUserInventories[inventoryId] = {
              ...snapshot,
              items: nextItems,
              counts: normalizedCounts,
              updatedAt: timestamp
            };
          }

          if (userChanged) {
            inventoriesChanged = true;
            nextInventories[userId] = nextUserInventories;
          } else {
            nextInventories[userId] = inventories;
          }
        }

        if (!inventoriesChanged) {
          return previous;
        }

        const nextByItemId = { ...(baseState.byItemId ?? {}) };
        const aggregatedEntries: Array<{
          userId: string;
          gachaId: string;
          rarityId: string;
          count: number;
        }> = [];

        for (const [userId, inventories] of Object.entries(nextInventories)) {
          for (const snapshot of Object.values(inventories ?? {})) {
            if (!snapshot || snapshot.gachaId !== gachaId) {
              continue;
            }

            const itemsByRarity = snapshot.items ?? {};
            const countsByRarity = snapshot.counts ?? {};

            for (const [rarityId, itemIds] of Object.entries(itemsByRarity)) {
              const occurrences = Array.isArray(itemIds)
                ? itemIds.reduce((total, value) => (value === itemId ? total + 1 : total), 0)
                : 0;
              const explicit = countsByRarity?.[rarityId]?.[itemId];
              const totalCount =
                typeof explicit === 'number' && explicit > 0 ? explicit : occurrences;

              if (totalCount > 0) {
                aggregatedEntries.push({
                  userId,
                  gachaId: snapshot.gachaId,
                  rarityId,
                  count: totalCount
                });
              }
            }
          }
        }

        if (aggregatedEntries.length > 0) {
          nextByItemId[itemId] = aggregatedEntries;
        } else {
          delete nextByItemId[itemId];
        }

        return {
          ...baseState,
          updatedAt: timestamp,
          inventories: nextInventories,
          byItemId: nextByItemId
        };
      },
      { persist: 'immediate' }
    );
  }

  protected persistImmediate(state: UserInventoriesStateV3 | undefined): void {
    this.persistence.saveUserInventories(state);
  }

  protected persistDebounced(state: UserInventoriesStateV3 | undefined): void {
    this.persistence.saveUserInventoriesDebounced(state);
  }
}
