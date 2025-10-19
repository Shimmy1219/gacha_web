import { AppPersistence, type UserInventoriesStateV3 } from '../app-persistence';
import { PersistedStore } from './persistedStore';

export class UserInventoryStore extends PersistedStore<UserInventoriesStateV3 | undefined> {
  constructor(persistence: AppPersistence) {
    super(persistence);
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
        if (!previous) {
          console.warn('UserInventoryStore.updateItemRarity called before store was hydrated');
          return previous;
        }

        let inventoriesChanged = false;
        const nextInventories: UserInventoriesStateV3['inventories'] = {};

        for (const [userId, inventories] of Object.entries(previous.inventories ?? {})) {
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

        const nextByItemId = { ...(previous.byItemId ?? {}) };
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
          ...previous,
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
