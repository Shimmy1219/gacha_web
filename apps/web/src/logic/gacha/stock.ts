import type { UserInventoriesStateV3 } from '@domain/app-persistence';

import type { ItemInventoryCountMap } from './types';

function normalizeNonNegativeInt(value: unknown): number | null {
  if (value == null) {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const truncated = Math.floor(numeric);
  if (truncated < 0) {
    return 0;
  }

  return truncated;
}

function resolveItemCount(itemId: string, counts?: ItemInventoryCountMap): number {
  if (!counts || !itemId) {
    return 0;
  }

  const raw = counts instanceof Map ? counts.get(itemId) : counts[itemId];
  if (!Number.isFinite(raw)) {
    return 0;
  }

  const normalized = Math.floor(raw ?? 0);
  return normalized > 0 ? normalized : 0;
}

export function buildItemInventoryCountMap(
  byItemId: UserInventoriesStateV3['byItemId'] | undefined
): Map<string, number> {
  const map = new Map<string, number>();

  if (!byItemId) {
    return map;
  }

  Object.entries(byItemId).forEach(([itemId, entries]) => {
    if (!itemId || !Array.isArray(entries)) {
      return;
    }

    let total = 0;
    entries.forEach((entry) => {
      const rawCount = entry?.count;
      if (!Number.isFinite(rawCount)) {
        return;
      }
      const normalized = Math.floor(rawCount ?? 0);
      if (normalized > 0) {
        total += normalized;
      }
    });

    if (total > 0) {
      map.set(itemId, total);
    }
  });

  return map;
}

export function resolveRemainingStock(
  itemId: string,
  stockCount: unknown,
  itemInventoryCountsById?: ItemInventoryCountMap
): number | null {
  const normalizedStock = normalizeNonNegativeInt(stockCount);
  if (normalizedStock == null) {
    return null;
  }

  const usedCount = resolveItemCount(itemId, itemInventoryCountsById);
  return Math.max(0, normalizedStock - usedCount);
}
