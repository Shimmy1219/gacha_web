import {
  type UserInventoriesStateV3,
  type UserInventorySnapshotV3
} from '../types';

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

export function calculateInventoryTotal(
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

export function rebuildUserInventoriesByItemId(
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

export function normalizeUserInventoriesState(
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
    byItemId: rebuildUserInventoriesByItemId(normalizedInventories)
  };
}
