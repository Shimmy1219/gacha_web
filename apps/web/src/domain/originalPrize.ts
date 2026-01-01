import type {
  OriginalPrizeAssetV1,
  PullHistoryEntrySourceV1,
  PullHistoryEntryV1,
  PullHistoryStateV1
} from './app-persistence';
import { generateDeterministicUserId } from './idGenerators';

export interface OriginalPrizeInstance {
  instanceId: string;
  itemId: string;
  pullId?: string;
  index: number;
  acquiredAt?: string;
  asset?: OriginalPrizeAssetV1 | null;
  isPlaceholder?: boolean;
}

const DEFAULT_USER_ID = generateDeterministicUserId('default-user');

function normalizePullUserId(userId: string | undefined): string {
  if (!userId) {
    return DEFAULT_USER_ID;
  }

  const trimmed = userId.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_USER_ID;
}

function normalizePullEntryCount(value: number | undefined, source: PullHistoryEntrySourceV1 | undefined): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const normalized = Math.trunc(value ?? 0);
  if (source === 'manual') {
    return normalized;
  }

  return normalized > 0 ? normalized : 0;
}

function ensureIsoString(input: string | undefined): string {
  const parsed = new Date(input ?? '');
  if (Number.isNaN(parsed.valueOf())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

export function buildOriginalPrizeInstanceMap(params: {
  pullHistory: PullHistoryStateV1 | undefined;
  userId: string;
  gachaId: string;
  targetItemIds: Set<string>;
}): Record<string, OriginalPrizeInstance[]> {
  const { pullHistory, userId, gachaId, targetItemIds } = params;

  if (!pullHistory || targetItemIds.size === 0) {
    return {};
  }

  const normalizedUserId = normalizePullUserId(userId);
  const entries = Object.values(pullHistory.pulls ?? {}).filter(
    (entry): entry is PullHistoryEntryV1 =>
      Boolean(entry) &&
      entry.gachaId === gachaId &&
      normalizePullUserId(entry.userId) === normalizedUserId
  );

  if (entries.length === 0) {
    return {};
  }

  entries.sort((a, b) => {
    const timeA = new Date(a.executedAt ?? '').getTime();
    const timeB = new Date(b.executedAt ?? '').getTime();
    if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
      return timeA - timeB;
    }
    return String(a.id).localeCompare(String(b.id), 'ja');
  });

  const instancesByItemId: Record<string, OriginalPrizeInstance[]> = {};

  entries.forEach((entry) => {
    const executedAt = ensureIsoString(entry.executedAt);
    const assignmentsByItem = new Map<string, Map<number, OriginalPrizeAssetV1>>();

    Object.entries(entry.originalPrizeAssignments ?? {}).forEach(([itemId, assignments]) => {
      if (!targetItemIds.has(itemId) || !Array.isArray(assignments)) {
        return;
      }

      const byIndex = new Map<number, OriginalPrizeAssetV1>();
      assignments.forEach((assignment) => {
        if (!assignment?.assetId) {
          return;
        }
        const index = Math.trunc(assignment.index);
        if (index < 0 || byIndex.has(index)) {
          return;
        }
        byIndex.set(index, {
          assetId: assignment.assetId,
          thumbnailAssetId: assignment.thumbnailAssetId ?? null
        });
      });

      if (byIndex.size > 0) {
        assignmentsByItem.set(itemId, byIndex);
      }
    });

    Object.entries(entry.itemCounts ?? {}).forEach(([itemId, rawCount]) => {
      if (!targetItemIds.has(itemId)) {
        return;
      }

      const count = normalizePullEntryCount(rawCount, entry.source);
      if (count === 0) {
        return;
      }

      const existing = instancesByItemId[itemId] ?? [];

      if (count > 0) {
        const assignments = assignmentsByItem.get(itemId);
        for (let index = 0; index < count; index += 1) {
          existing.push({
            instanceId: `${entry.id}:${itemId}:${index}`,
            itemId,
            pullId: entry.id,
            index,
            acquiredAt: executedAt,
            asset: assignments?.get(index) ?? null
          });
        }
      } else {
        const removeCount = Math.min(existing.length, Math.abs(count));
        if (removeCount > 0) {
          existing.splice(-removeCount, removeCount);
        }
      }

      if (existing.length > 0) {
        instancesByItemId[itemId] = existing;
      } else {
        delete instancesByItemId[itemId];
      }
    });
  });

  return instancesByItemId;
}

export function applyLegacyAssetsToInstances(
  instances: OriginalPrizeInstance[],
  legacyAssets: OriginalPrizeAssetV1[] | undefined
): OriginalPrizeInstance[] {
  if (!legacyAssets || legacyAssets.length === 0 || instances.length === 0) {
    return instances;
  }

  const normalizedAssets = legacyAssets
    .filter((asset): asset is OriginalPrizeAssetV1 => Boolean(asset?.assetId))
    .map((asset) => ({
      assetId: asset.assetId,
      thumbnailAssetId: asset.thumbnailAssetId ?? null
    }));

  if (normalizedAssets.length === 0) {
    return instances;
  }

  const nextInstances = instances.map((instance) => ({ ...instance }));
  let assetIndex = 0;

  for (let index = 0; index < nextInstances.length && assetIndex < normalizedAssets.length; index += 1) {
    if (nextInstances[index].asset) {
      continue;
    }
    nextInstances[index].asset = normalizedAssets[assetIndex];
    assetIndex += 1;
  }

  return nextInstances;
}

export function alignOriginalPrizeInstances(
  instances: OriginalPrizeInstance[],
  desiredCount: number,
  itemId: string
): OriginalPrizeInstance[] {
  if (desiredCount <= 0) {
    return [];
  }

  if (instances.length >= desiredCount) {
    return instances.slice(0, desiredCount);
  }

  const nextInstances = [...instances];
  const missing = desiredCount - instances.length;

  for (let index = 0; index < missing; index += 1) {
    nextInstances.push({
      instanceId: `placeholder:${itemId}:${instances.length + index}`,
      itemId,
      index: -1,
      acquiredAt: undefined,
      asset: null,
      isPlaceholder: true
    });
  }

  return nextInstances;
}
