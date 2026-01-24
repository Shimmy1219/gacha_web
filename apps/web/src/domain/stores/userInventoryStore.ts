import { AppPersistence, type OriginalPrizeAssetV1, type UserInventoriesStateV3 } from '../app-persistence';
import { PersistedStore, type UpdateOptions } from './persistedStore';

function normalizeOriginalPrizeAssets(assets: OriginalPrizeAssetV1[]): OriginalPrizeAssetV1[] {
  const seen = new Set<string>();
  const normalized: OriginalPrizeAssetV1[] = [];

  assets.forEach((asset) => {
    if (!asset?.assetId || seen.has(asset.assetId)) {
      return;
    }
    seen.add(asset.assetId);
    normalized.push({
      assetId: asset.assetId,
      thumbnailAssetId: asset.thumbnailAssetId ?? null
    });
  });

  return normalized;
}

function areOriginalPrizeAssetsEqual(left: OriginalPrizeAssetV1[], right: OriginalPrizeAssetV1[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftEntry = left[index];
    const rightEntry = right[index];
    if (leftEntry?.assetId !== rightEntry?.assetId) {
      return false;
    }
    const leftPreview = leftEntry?.thumbnailAssetId ?? null;
    const rightPreview = rightEntry?.thumbnailAssetId ?? null;
    if (leftPreview !== rightPreview) {
      return false;
    }
  }

  return true;
}

export class UserInventoryStore extends PersistedStore<UserInventoriesStateV3 | undefined> {
  constructor(persistence: AppPersistence) {
    super(persistence);
  }

  updateOriginalPrizeAssets(
    params: { userId: string; inventoryId: string; itemId: string; assets: OriginalPrizeAssetV1[] },
    options: UpdateOptions = { persist: 'immediate' }
  ): void {
    const normalizedUserId = params.userId.trim();
    const normalizedInventoryId = params.inventoryId.trim();
    const normalizedItemId = params.itemId.trim();

    if (!normalizedUserId || !normalizedInventoryId || !normalizedItemId) {
      return;
    }

    const normalizedAssets = normalizeOriginalPrizeAssets(params.assets ?? []);

    this.update(
      (previous) => {
        if (!previous?.inventories?.[normalizedUserId]) {
          return previous;
        }

        const userInventories = previous.inventories[normalizedUserId];
        const snapshot = userInventories?.[normalizedInventoryId];
        if (!snapshot) {
          return previous;
        }

        const existingAssets = snapshot.originalPrizeAssets?.[normalizedItemId] ?? [];
        if (areOriginalPrizeAssetsEqual(existingAssets, normalizedAssets)) {
          return previous;
        }

        const nextOriginalPrizeAssets = { ...(snapshot.originalPrizeAssets ?? {}) };
        if (normalizedAssets.length > 0) {
          nextOriginalPrizeAssets[normalizedItemId] = normalizedAssets;
        } else {
          delete nextOriginalPrizeAssets[normalizedItemId];
        }

        const nextSnapshot = {
          ...snapshot,
          updatedAt: new Date().toISOString(),
          ...(Object.keys(nextOriginalPrizeAssets).length > 0
            ? { originalPrizeAssets: nextOriginalPrizeAssets }
            : { originalPrizeAssets: undefined })
        };

        const nextUserInventories = {
          ...userInventories,
          [normalizedInventoryId]: nextSnapshot
        };

        return {
          ...previous,
          updatedAt: new Date().toISOString(),
          inventories: {
            ...previous.inventories,
            [normalizedUserId]: nextUserInventories
          }
        } satisfies UserInventoriesStateV3;
      },
      options
    );
  }

  removeGacha(gachaId: string, options: UpdateOptions = { persist: 'immediate' }): void {
    if (!gachaId) {
      return;
    }

    this.update(
      (previous) => {
        if (!previous) {
          return previous;
        }

        let changed = false;
        const nextInventories: UserInventoriesStateV3['inventories'] = {};

        Object.entries(previous.inventories ?? {}).forEach(([userId, snapshots]) => {
          if (!snapshots) {
            return;
          }

          const filteredEntries = Object.entries(snapshots).filter(([, snapshot]) => snapshot?.gachaId !== gachaId);
          if (filteredEntries.length === 0) {
            if (Object.keys(snapshots).length > 0) {
              changed = true;
            }
            return;
          }

          if (filteredEntries.length !== Object.keys(snapshots).length) {
            changed = true;
          }

          nextInventories[userId] = Object.fromEntries(filteredEntries);
        });

        const nextByItemId: UserInventoriesStateV3['byItemId'] = {};
        Object.entries(previous.byItemId ?? {}).forEach(([itemId, entries]) => {
          if (!entries) {
            return;
          }

          const filteredEntries = entries.filter((entry) => entry?.gachaId !== gachaId);
          if (filteredEntries.length === 0) {
            if (entries.length > 0) {
              changed = true;
            }
            return;
          }

          if (filteredEntries.length !== entries.length) {
            changed = true;
          }

          nextByItemId[itemId] = filteredEntries;
        });

        if (!changed) {
          return previous;
        }

        if (Object.keys(nextInventories).length === 0 && Object.keys(nextByItemId).length === 0) {
          return undefined;
        }

        const timestamp = new Date().toISOString();

        return {
          version: typeof previous.version === 'number' ? previous.version : 3,
          updatedAt: timestamp,
          inventories: nextInventories,
          byItemId: nextByItemId
        } satisfies UserInventoriesStateV3;
      },
      options
    );
  }

  deleteUser(userId: string, options: UpdateOptions = { persist: 'immediate' }): void {
    const trimmedUserId = userId.trim();
    if (!trimmedUserId) {
      return;
    }

    this.update(
      (previous) => {
        if (!previous) {
          return previous;
        }

        const hasInventories = Object.prototype.hasOwnProperty.call(
          previous.inventories ?? {},
          trimmedUserId
        );

        let changed = false;
        const nextInventories: UserInventoriesStateV3['inventories'] = {};

        Object.entries(previous.inventories ?? {}).forEach(([existingUserId, snapshots]) => {
          if (existingUserId === trimmedUserId) {
            changed = true;
            return;
          }
          if (snapshots) {
            nextInventories[existingUserId] = snapshots;
          }
        });

        const nextByItemId: UserInventoriesStateV3['byItemId'] = {};
        Object.entries(previous.byItemId ?? {}).forEach(([itemId, entries]) => {
          if (!entries) {
            return;
          }

          const filtered = entries.filter((entry) => entry?.userId !== trimmedUserId);
          if (filtered.length === 0) {
            if (entries.length > 0) {
              changed = true;
            }
            return;
          }

          if (filtered.length !== entries.length) {
            changed = true;
          }

          nextByItemId[itemId] = filtered;
        });

        if (!changed && !hasInventories) {
          return previous;
        }

        if (Object.keys(nextInventories).length === 0 && Object.keys(nextByItemId).length === 0) {
          return undefined;
        }

        const timestamp = new Date().toISOString();

        return {
          version: typeof previous.version === 'number' ? previous.version : 3,
          updatedAt: timestamp,
          inventories: nextInventories,
          byItemId: nextByItemId
        } satisfies UserInventoriesStateV3;
      },
      options
    );
  }

  applyProjectionResult(
    state: UserInventoriesStateV3 | undefined,
    options: UpdateOptions = {}
  ): void {
    const { emit, persist = 'none' } = options;
    this.setState(state, { emit, persist: 'none' });

    if (persist === 'immediate') {
      this.save();
    } else if (persist === 'debounced') {
      this.saveDebounced();
    }

    const userCount = state?.inventories ? Object.keys(state.inventories).length : 0;
    console.info('【デバッグ】user-inventoryを更新しました', {
      ユーザー数: userCount,
      永続化モード: persist,
      スナップショット有無: state ? 'あり' : 'なし'
    });
  }

  protected persistImmediate(state: UserInventoriesStateV3 | undefined): void {
    this.persistence.saveUserInventories(state);
  }

  protected persistDebounced(state: UserInventoriesStateV3 | undefined): void {
    this.persistence.saveUserInventoriesDebounced(state);
  }
}
