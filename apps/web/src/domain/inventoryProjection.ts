import {
  type GachaCatalogStateV3,
  type PullHistoryEntrySourceV1,
  type PullHistoryEntryV1,
  type PullHistoryStateV1,
  type UserInventoriesStateV3,
  type UserInventorySnapshotV3
} from './app-persistence';
import {
  generateDeterministicInventoryId,
  generateDeterministicUserId
} from './idGenerators';

interface AggregatedSnapshot {
  readonly gachaId: string;
  readonly inventoryId: string;
  readonly counts: Map<string, Map<string, number>>;
  readonly earliestExecutedAt?: string;
  readonly latestExecutedAt?: string;
}

export interface InventoryProjectionParams {
  pullHistory: PullHistoryStateV1 | undefined;
  catalogState?: GachaCatalogStateV3 | undefined;
  legacyInventories?: UserInventoriesStateV3 | undefined;
  now?: string;
}

export interface InventoryProjectionDiagnostics {
  readonly projectedUsers: number;
  readonly projectedInventories: number;
  readonly pullEntries: number;
  readonly warnings: string[];
  readonly orphanInventories: Array<{ userId: string; inventoryId: string; gachaId: string }>;
}

export interface InventoryProjectionResult {
  readonly state: UserInventoriesStateV3 | undefined;
  readonly diagnostics: InventoryProjectionDiagnostics;
}

const UNKNOWN_RARITY_ID = 'rar-unknown';

const DEFAULT_USER_ID = generateDeterministicUserId('default-user');

function ensureIsoString(input: string | undefined, fallback: string): string {
  if (!input) {
    return fallback;
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.valueOf())) {
    return fallback;
  }

  return parsed.toISOString();
}

function sanitizePositiveCount(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const normalized = Math.floor(value ?? 0);
  return normalized > 0 ? normalized : 0;
}

function normalizeEntryItemCount(
  value: number | undefined,
  source: PullHistoryEntrySourceV1 | undefined
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const normalized = Math.trunc(value ?? 0);
  if (source === 'manual') {
    return normalized;
  }

  return normalized > 0 ? normalized : 0;
}

type ItemRarityIndex = Map<string, Map<string, string>>;

function buildItemRarityIndex(catalogState: GachaCatalogStateV3 | undefined): ItemRarityIndex {
  const index: ItemRarityIndex = new Map();

  if (!catalogState?.byGacha) {
    return index;
  }

  Object.entries(catalogState.byGacha).forEach(([gachaId, snapshot]) => {
    if (!gachaId || !snapshot?.items) {
      return;
    }

    const map = new Map<string, string>();

    Object.entries(snapshot.items).forEach(([itemId, item]) => {
      if (!itemId || !item?.rarityId) {
        return;
      }
      map.set(itemId, item.rarityId);
    });

    index.set(gachaId, map);
  });

  return index;
}

function resolveUserId(entry: PullHistoryEntryV1 | undefined): string {
  if (!entry?.userId) {
    return DEFAULT_USER_ID;
  }

  const trimmed = entry.userId.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_USER_ID;
}

function resolveInventoryId(userId: string, gachaId: string): string {
  return generateDeterministicInventoryId(`${userId}-${gachaId}`);
}

function updateAggregatedSnapshot(
  snapshot: AggregatedSnapshot,
  entry: PullHistoryEntryV1,
  itemRarityIndex: ItemRarityIndex,
  fallbackTimestamp: string
): void {
  const rarityIndexForGacha = itemRarityIndex.get(entry.gachaId ?? '') ?? new Map<string, string>();

  const executedAt = ensureIsoString(entry.executedAt, fallbackTimestamp);

  if (!snapshot.earliestExecutedAt || snapshot.earliestExecutedAt > executedAt) {
    snapshot.earliestExecutedAt = executedAt;
  }

  if (!snapshot.latestExecutedAt || snapshot.latestExecutedAt < executedAt) {
    snapshot.latestExecutedAt = executedAt;
  }

  Object.entries(entry.itemCounts ?? {}).forEach(([itemId, rawCount]) => {
    if (!itemId) {
      return;
    }

    const count = normalizeEntryItemCount(rawCount, entry.source);
    if (count === 0) {
      return;
    }

    const rarityId = rarityIndexForGacha.get(itemId) ?? UNKNOWN_RARITY_ID;

    let countsForRarity = snapshot.counts.get(rarityId);
    if (!countsForRarity) {
      countsForRarity = new Map<string, number>();
      snapshot.counts.set(rarityId, countsForRarity);
    }

    const nextValue = (countsForRarity.get(itemId) ?? 0) + count;
    if (nextValue === 0) {
      countsForRarity.delete(itemId);
      if (countsForRarity.size === 0) {
        snapshot.counts.delete(rarityId);
      }
      return;
    }

    countsForRarity.set(itemId, nextValue);
  });
}

function cloneSnapshot(snapshot: UserInventorySnapshotV3): UserInventorySnapshotV3 {
  const nextItems: Record<string, string[]> = {};
  Object.entries(snapshot.items ?? {}).forEach(([rarityId, items]) => {
    if (!Array.isArray(items)) {
      return;
    }
    nextItems[rarityId] = [...items];
  });

  const nextCounts: Record<string, Record<string, number>> = {};
  Object.entries(snapshot.counts ?? {}).forEach(([rarityId, record]) => {
    if (!record) {
      return;
    }
    const clonedRecord: Record<string, number> = {};
    Object.entries(record).forEach(([itemId, value]) => {
      const normalized = sanitizePositiveCount(value);
      if (normalized > 0) {
        clonedRecord[itemId] = normalized;
      }
    });
    if (Object.keys(clonedRecord).length > 0) {
      nextCounts[rarityId] = clonedRecord;
    }
  });

  const totalCount = Object.values(nextCounts).reduce((total, record) => {
    return (
      total +
      Object.values(record).reduce((rarityTotal, value) => rarityTotal + sanitizePositiveCount(value), 0)
    );
  }, 0);

  const result: UserInventorySnapshotV3 = {
    inventoryId: snapshot.inventoryId,
    gachaId: snapshot.gachaId,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    totalCount: totalCount > 0 ? totalCount : undefined,
    items: nextItems,
    counts: nextCounts
  };

  return result;
}

function applySnapshotToIndex(
  index: UserInventoriesStateV3['byItemId'],
  snapshot: UserInventorySnapshotV3,
  userId: string
): void {
  const itemsByRarity = snapshot.items ?? {};
  const countsByRarity = snapshot.counts ?? {};

  Object.entries(countsByRarity).forEach(([rarityId, record]) => {
    const entries = Object.entries(record ?? {});
    entries.forEach(([itemId, count]) => {
      const normalized = sanitizePositiveCount(count);
      if (normalized <= 0) {
        return;
      }

      if (!index[itemId]) {
        index[itemId] = [];
      }

      index[itemId].push({
        userId,
        gachaId: snapshot.gachaId,
        rarityId,
        count: normalized
      });
    });
  });

  Object.entries(itemsByRarity).forEach(([rarityId, itemIds]) => {
    if (!Array.isArray(itemIds)) {
      return;
    }

    const fallbackCounts = new Map<string, number>();
    itemIds.forEach((itemId) => {
      fallbackCounts.set(itemId, (fallbackCounts.get(itemId) ?? 0) + 1);
    });

    fallbackCounts.forEach((count, itemId) => {
      if (index[itemId]?.some((entry) => entry.userId === userId && entry.gachaId === snapshot.gachaId && entry.rarityId === rarityId)) {
        return;
      }

      const normalized = sanitizePositiveCount(count);
      if (normalized <= 0) {
        return;
      }

      if (!index[itemId]) {
        index[itemId] = [];
      }

      index[itemId].push({
        userId,
        gachaId: snapshot.gachaId,
        rarityId,
        count: normalized
      });
    });
  });
}

function buildSnapshotFromAggregate(
  aggregate: AggregatedSnapshot
): UserInventorySnapshotV3 | null {
  const countsByRarity: Record<string, Record<string, number>> = {};
  let totalCount = 0;

  aggregate.counts.forEach((itemMap, rarityId) => {
    if (!rarityId || itemMap.size === 0) {
      return;
    }

    const record: Record<string, number> = {};
    itemMap.forEach((count, itemId) => {
      const normalized = sanitizePositiveCount(count);
      if (normalized <= 0) {
        return;
      }
      record[itemId] = normalized;
      totalCount += normalized;
    });

    if (Object.keys(record).length > 0) {
      countsByRarity[rarityId] = record;
    }
  });

  if (Object.keys(countsByRarity).length === 0) {
    return null;
  }

  const itemsByRarity: Record<string, string[]> = {};
  Object.entries(countsByRarity).forEach(([rarityId, record]) => {
    const sortedItems = Object.keys(record).sort((a, b) => a.localeCompare(b, 'ja'));
    const list: string[] = [];
    sortedItems.forEach((itemId) => {
      const count = record[itemId];
      for (let index = 0; index < count; index += 1) {
        list.push(itemId);
      }
    });
    if (list.length > 0) {
      itemsByRarity[rarityId] = list;
    }
  });

  const snapshot: UserInventorySnapshotV3 = {
    inventoryId: aggregate.inventoryId,
    gachaId: aggregate.gachaId,
    createdAt: aggregate.earliestExecutedAt,
    updatedAt: aggregate.latestExecutedAt,
    totalCount,
    items: itemsByRarity,
    counts: countsByRarity
  };

  return snapshot;
}

export function projectInventories(params: InventoryProjectionParams): InventoryProjectionResult {
  const { pullHistory, catalogState, legacyInventories, now } = params;
  const nowIso = ensureIsoString(now, new Date().toISOString());
  const itemRarityIndex = buildItemRarityIndex(catalogState);
  const aggregated = new Map<string, Map<string, AggregatedSnapshot>>();
  const warnings: string[] = [];

  const pulls = pullHistory?.pulls ?? {};
  let pullEntries = 0;

  const orderedEntries: PullHistoryEntryV1[] = [];
  const processedPullIds = new Set<string>();
  const pullOrder = Array.isArray(pullHistory?.order) ? pullHistory?.order : undefined;

  if (pullOrder && pullOrder.length > 0) {
    pullOrder.forEach((id) => {
      if (!id) {
        return;
      }
      const entry = pulls[id];
      if (entry) {
        orderedEntries.push(entry);
        processedPullIds.add(id);
      }
    });
  }

  Object.entries(pulls).forEach(([id, entry]) => {
    if (!entry || processedPullIds.has(id)) {
      return;
    }
    orderedEntries.push(entry);
  });

  orderedEntries.forEach((entry) => {
    pullEntries += 1;

    const gachaId = entry.gachaId?.trim();
    if (!gachaId) {
      warnings.push(`pull ${entry.id ?? '(unknown)'} を処理できませんでした: gachaId が未設定です`);
      return;
    }

    const userId = resolveUserId(entry);
    const userAggregates = aggregated.get(userId) ?? new Map<string, AggregatedSnapshot>();
    aggregated.set(userId, userAggregates);

    const inventoryId = resolveInventoryId(userId, gachaId);
    const existing = userAggregates.get(gachaId);
    const snapshot: AggregatedSnapshot = existing ?? {
      gachaId,
      inventoryId,
      counts: new Map<string, Map<string, number>>()
    };

    updateAggregatedSnapshot(snapshot, entry, itemRarityIndex, nowIso);
    userAggregates.set(gachaId, snapshot);
  });

  const inventories: UserInventoriesStateV3['inventories'] = {};
  const byItemId: UserInventoriesStateV3['byItemId'] = {};

  aggregated.forEach((gachaMap, userId) => {
    const snapshots: Record<string, UserInventorySnapshotV3> = {};

    gachaMap.forEach((aggregate) => {
      const snapshot = buildSnapshotFromAggregate(aggregate);
      if (!snapshot) {
        return;
      }

      snapshot.createdAt = snapshot.createdAt ?? nowIso;
      snapshot.updatedAt = snapshot.updatedAt ?? nowIso;

      snapshots[snapshot.inventoryId] = snapshot;
      applySnapshotToIndex(byItemId, snapshot, userId);
    });

    if (Object.keys(snapshots).length > 0) {
      inventories[userId] = snapshots;
    }
  });

  const orphanInventories: Array<{ userId: string; inventoryId: string; gachaId: string }> = [];

  if (legacyInventories?.inventories) {
    Object.entries(legacyInventories.inventories).forEach(([userId, legacySnapshots]) => {
      if (!legacySnapshots) {
        return;
      }

      const nextSnapshots = { ...(inventories[userId] ?? {}) };
      let mutated = false;

      Object.entries(legacySnapshots).forEach(([inventoryId, snapshot]) => {
        if (!snapshot) {
          return;
        }

        const hasSameGacha = Object.values(nextSnapshots).some((candidate) => candidate.gachaId === snapshot.gachaId);
        if (hasSameGacha) {
          return;
        }

        const cloned = cloneSnapshot(snapshot);
        cloned.inventoryId = snapshot.inventoryId ?? inventoryId;
        cloned.updatedAt = cloned.updatedAt ?? legacyInventories.updatedAt ?? nowIso;
        cloned.createdAt = cloned.createdAt ?? cloned.updatedAt;

        nextSnapshots[cloned.inventoryId] = cloned;
        applySnapshotToIndex(byItemId, cloned, userId);
        orphanInventories.push({
          userId,
          inventoryId: cloned.inventoryId,
          gachaId: cloned.gachaId
        });
        mutated = true;
      });

      if (mutated) {
        inventories[userId] = nextSnapshots;
      }
    });
  }

  const projectedUsers = Object.keys(inventories).length;
  const projectedInventories = Object.values(inventories).reduce(
    (total, snapshotMap) => total + Object.keys(snapshotMap ?? {}).length,
    0
  );

  let updatedAt: string | undefined;

  if (projectedInventories > 0) {
    const timestamps: string[] = [];
    Object.values(inventories).forEach((snapshotMap) => {
      Object.values(snapshotMap ?? {}).forEach((snapshot) => {
        if (snapshot?.updatedAt) {
          timestamps.push(snapshot.updatedAt);
        }
      });
    });

    if (timestamps.length > 0) {
      updatedAt = timestamps.sort().reverse()[0];
    }
  }

  const state: UserInventoriesStateV3 | undefined = projectedInventories > 0
    ? {
        version: 3,
        updatedAt: updatedAt ?? nowIso,
        inventories,
        byItemId
      }
    : undefined;

  const diagnostics: InventoryProjectionDiagnostics = {
    projectedUsers,
    projectedInventories,
    pullEntries,
    warnings,
    orphanInventories
  };

  return { state, diagnostics };
}
