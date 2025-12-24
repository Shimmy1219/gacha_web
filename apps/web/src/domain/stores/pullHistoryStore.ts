import {
  AppPersistence,
  type OriginalPrizeAssignmentV1,
  type OriginalPrizeAssetV1,
  type PullHistoryEntrySourceV1,
  type PullHistoryEntryStatus,
  type PullHistoryEntryV1,
  type PullHistoryStateV1
} from '../app-persistence';
import type { GachaResultPayload } from '../gacha/gachaResult';
import { generatePullId } from '../idGenerators';
import { PersistedStore, type UpdateOptions } from './persistedStore';

interface AppendPullParams {
  gachaId: string;
  userId?: string;
  executedAt?: string;
  pullCount: number;
  currencyUsed?: number;
  itemCounts: Record<string, number>;
  rarityCounts?: Record<string, number>;
  source?: PullHistoryEntrySourceV1;
  id?: string;
  newItems?: string[];
}

interface ReplacePullParams {
  entry: PullHistoryEntryV1;
  executedAtOverride?: string;
}

interface RecordManualInventoryChangeParams {
  gachaId: string;
  userId?: string;
  itemId: string;
  delta: number;
  executedAt?: string;
  source?: Extract<PullHistoryEntrySourceV1, 'manual' | 'realtime'>;
}

function sanitizeCounts(map: Record<string, number> | undefined): Record<string, number> {
  const result: Record<string, number> = {};
  if (!map) {
    return result;
  }

  Object.entries(map).forEach(([key, value]) => {
    const normalized = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    if (normalized > 0) {
      result[key] = normalized;
    }
  });

  return result;
}

function ensureTimestamp(value?: string): string {
  if (!value) {
    return new Date().toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function normalizeUserIdValue(userId: string | undefined): string | undefined {
  if (!userId) {
    return undefined;
  }

  const trimmed = userId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeNewItems(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
  if (normalized.length === 0) {
    return undefined;
  }
  return Array.from(new Set(normalized));
}

function normalizeOriginalPrizeAssignments(
  value: Record<string, OriginalPrizeAssignmentV1[]> | undefined
): Record<string, OriginalPrizeAssignmentV1[]> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const normalized: Record<string, OriginalPrizeAssignmentV1[]> = {};

  Object.entries(value).forEach(([itemId, assignments]) => {
    if (!itemId || !Array.isArray(assignments) || assignments.length === 0) {
      return;
    }

    const byIndex = new Map<number, OriginalPrizeAssignmentV1>();

    assignments.forEach((assignment) => {
      if (!assignment?.assetId) {
        return;
      }

      const index = Math.trunc(assignment.index);
      if (index < 0 || byIndex.has(index)) {
        return;
      }

      byIndex.set(index, {
        index,
        assetId: assignment.assetId,
        thumbnailAssetId: assignment.thumbnailAssetId ?? null
      });
    });

    if (byIndex.size === 0) {
      return;
    }

    normalized[itemId] = Array.from(byIndex.values()).sort((a, b) => a.index - b.index);
  });

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

const PULL_HISTORY_STATUS_VALUES: readonly PullHistoryEntryStatus[] = ['new', 'ziped', 'uploaded', 'discord_shared'];

function normalizeStatusValue(value: string | undefined): PullHistoryEntryStatus | undefined {
  if (!value) {
    return undefined;
  }
  return PULL_HISTORY_STATUS_VALUES.find((status) => status === value) ?? undefined;
}

function normalizeEntry(entry: PullHistoryEntryV1 | undefined): PullHistoryEntryV1 | undefined {
  if (!entry) {
    return undefined;
  }

  const normalizedStatus = normalizeStatusValue(entry.status);
  const normalizedOriginalPrizeMissing = entry.hasOriginalPrizeMissing === true ? true : undefined;
  const normalizedNewItems = normalizeNewItems(entry.newItems);
  const normalizedAssignments = normalizeOriginalPrizeAssignments(entry.originalPrizeAssignments);
  const {
    status: _ignoredStatus,
    hasOriginalPrizeMissing: _ignoredOriginalPrizeMissing,
    newItems: _ignoredNewItems,
    originalPrizeAssignments: _ignoredAssignments,
    ...rest
  } = entry;
  const normalizedEntry: PullHistoryEntryV1 = {
    ...rest,
    source: entry.source ?? 'insiteResult'
  };

  if (normalizedStatus) {
    normalizedEntry.status = normalizedStatus;
  }
  if (normalizedOriginalPrizeMissing) {
    normalizedEntry.hasOriginalPrizeMissing = true;
  }
  if (normalizedNewItems) {
    normalizedEntry.newItems = normalizedNewItems;
  }
  if (normalizedAssignments) {
    normalizedEntry.originalPrizeAssignments = normalizedAssignments;
  }

  return normalizedEntry;
}

function normalizeState(state: PullHistoryStateV1 | undefined): PullHistoryStateV1 {
  if (!state || state.version !== 1) {
    const now = new Date().toISOString();
    return {
      version: 1,
      updatedAt: now,
      order: [],
      pulls: {}
    };
  }

  const pulls: Record<string, PullHistoryEntryV1> = {};
  const order: string[] = [];

  const seen = new Set<string>();
  const orderedIds = Array.isArray(state.order) ? state.order : [];
  orderedIds.forEach((id) => {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) {
      return;
    }
    const entry = normalizeEntry(state.pulls?.[id]);
    if (!entry) {
      return;
    }
    pulls[id] = entry;
    order.push(id);
    seen.add(id);
  });

  Object.entries(state.pulls ?? {}).forEach(([id, entry]) => {
    if (!entry || seen.has(id)) {
      return;
    }
    const normalizedEntry = normalizeEntry(entry);
    if (!normalizedEntry) {
      return;
    }
    pulls[id] = normalizedEntry;
    order.push(id);
    seen.add(id);
  });

  return {
    version: 1,
    updatedAt: state.updatedAt ?? new Date().toISOString(),
    order,
    pulls
  };
}

export class PullHistoryStore extends PersistedStore<PullHistoryStateV1 | undefined> {
  constructor(persistence: AppPersistence) {
    super(persistence);
  }

  override hydrate(initialState: PullHistoryStateV1 | undefined): void {
    const normalized = initialState ? normalizeState(initialState) : undefined;
    super.hydrate(normalized);
  }

  getPull(pullId: string): PullHistoryEntryV1 | undefined {
    return this.state?.pulls?.[pullId];
  }

  updateOriginalPrizeAssignment(
    params: { pullId: string; itemId: string; index: number; asset: OriginalPrizeAssetV1 | null },
    options: UpdateOptions = { persist: 'immediate' }
  ): void {
    const normalizedPullId = params.pullId?.trim() ?? '';
    const normalizedItemId = params.itemId?.trim() ?? '';
    const normalizedIndex = Math.trunc(params.index);

    if (!normalizedPullId || !normalizedItemId || !Number.isFinite(normalizedIndex) || normalizedIndex < 0) {
      return;
    }

    const normalizedAssetId = params.asset?.assetId?.trim() ?? '';
    const normalizedThumbnail = params.asset?.thumbnailAssetId ?? null;

    this.update((previous) => {
      const base = normalizeState(previous ?? this.loadLatestState());
      const entry = base.pulls[normalizedPullId];
      if (!entry) {
        return base;
      }

      const rawCount = entry.itemCounts?.[normalizedItemId];
      const normalizedCount = Number.isFinite(rawCount) ? Math.trunc(rawCount ?? 0) : 0;
      if (normalizedCount <= 0 || normalizedIndex >= normalizedCount) {
        return base;
      }

      const existingAssignments = entry.originalPrizeAssignments?.[normalizedItemId] ?? [];
      const existingAtIndex = existingAssignments.find((assignment) => assignment.index === normalizedIndex);

      if (!normalizedAssetId) {
        if (!existingAtIndex) {
          return base;
        }
      } else if (existingAtIndex) {
        const existingThumbnail = existingAtIndex.thumbnailAssetId ?? null;
        if (existingAtIndex.assetId === normalizedAssetId && existingThumbnail === normalizedThumbnail) {
          return base;
        }
      }

      const nextAssignments = existingAssignments.filter((assignment) => assignment.index !== normalizedIndex);
      if (normalizedAssetId) {
        nextAssignments.push({
          index: normalizedIndex,
          assetId: normalizedAssetId,
          thumbnailAssetId: normalizedThumbnail
        });
        nextAssignments.sort((a, b) => a.index - b.index);
      }

      const nextAssignmentsMap = { ...(entry.originalPrizeAssignments ?? {}) };
      if (nextAssignments.length > 0) {
        nextAssignmentsMap[normalizedItemId] = nextAssignments;
      } else {
        delete nextAssignmentsMap[normalizedItemId];
      }

      const nextEntry: PullHistoryEntryV1 = {
        ...entry,
        originalPrizeAssignments:
          Object.keys(nextAssignmentsMap).length > 0 ? nextAssignmentsMap : undefined
      };

      return {
        ...base,
        updatedAt: new Date().toISOString(),
        pulls: {
          ...base.pulls,
          [normalizedPullId]: nextEntry
        }
      } satisfies PullHistoryStateV1;
    }, options);
  }

  appendPull(params: AppendPullParams, options: UpdateOptions = { persist: 'immediate' }): string {
    const {
      gachaId,
      userId,
      executedAt,
      pullCount,
      currencyUsed,
      itemCounts,
      rarityCounts,
      source,
      id,
      newItems
    } = params;

    if (!gachaId) {
      console.warn('PullHistoryStore.appendPull called without gachaId', params);
      return '';
    }

    const normalizedPullCount = Number.isFinite(pullCount) ? Math.max(0, Math.floor(pullCount)) : 0;
    if (normalizedPullCount <= 0) {
      console.warn('PullHistoryStore.appendPull requires pullCount > 0', params);
      return '';
    }

    const entryId = id ?? generatePullId();
    const sanitizedItemCounts = sanitizeCounts(itemCounts);
    const sanitizedRarityCounts = sanitizeCounts(rarityCounts);
    const executedAtIso = ensureTimestamp(executedAt);
    const normalizedSource: PullHistoryEntrySourceV1 = source ?? 'insiteResult';
    const normalizedNewItems = normalizeNewItems(newItems);

    this.update((previous) => {
      const base = normalizeState(previous ?? this.loadLatestState());
      const now = new Date().toISOString();

      const nextPulls = { ...base.pulls };
      const entry: PullHistoryEntryV1 = {
        id: entryId,
        gachaId,
        userId,
        executedAt: executedAtIso,
        pullCount: normalizedPullCount,
        currencyUsed,
        itemCounts: sanitizedItemCounts,
        rarityCounts: Object.keys(sanitizedRarityCounts).length > 0 ? sanitizedRarityCounts : undefined,
        source: normalizedSource,
        status: 'new',
        newItems: normalizedNewItems
      };
      nextPulls[entryId] = entry;

      const nextOrder = [entryId, ...base.order.filter((existingId) => existingId !== entryId)];

      return {
        version: 1,
        updatedAt: now,
        order: nextOrder,
        pulls: nextPulls
      } satisfies PullHistoryStateV1;
    }, options);

    console.info('【デバッグ】pull-historyを更新しました', {
      プルID: entryId,
      ガチャID: gachaId,
      ユーザーID: userId ?? '未指定',
      永続化モード: options.persist ?? 'none',
      アイテム種類数: Object.keys(sanitizedItemCounts).length
    });

    return entryId;
  }

  recordGachaResult(result: GachaResultPayload, options: UpdateOptions = { persist: 'immediate' }): string {
    const { gachaId, userId, executedAt, pullCount, currencyUsed, items, newItems } = result;

    const normalizedGachaId = gachaId?.trim() ?? '';
    if (!normalizedGachaId) {
      console.warn('PullHistoryStore.recordGachaResult called without gachaId', result);
      return '';
    }

    const normalizedPullCount = Number.isFinite(pullCount) ? Math.max(0, Math.floor(pullCount)) : 0;
    if (normalizedPullCount <= 0) {
      console.warn('PullHistoryStore.recordGachaResult called with invalid pullCount', result);
      return '';
    }

    if (!Array.isArray(items) || items.length === 0) {
      console.warn('PullHistoryStore.recordGachaResult called without items', result);
      return '';
    }

    const sanitizedItems = items
      .map((item) => ({
        itemId: item.itemId?.trim() ?? '',
        rarityId: item.rarityId?.trim() ?? '',
        count: Number.isFinite(item.count) ? Math.max(0, Math.floor(item.count)) : 0
      }))
      .filter((item) => item.itemId && item.count > 0);

    if (!sanitizedItems.length) {
      console.warn('PullHistoryStore.recordGachaResult received no valid items after sanitization', result);
      return '';
    }

    const itemCounts = sanitizedItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.itemId] = (acc[item.itemId] ?? 0) + item.count;
      return acc;
    }, {});

    const rarityCounts = sanitizedItems.reduce<Record<string, number>>((acc, item) => {
      if (!item.rarityId) {
        return acc;
      }
      acc[item.rarityId] = (acc[item.rarityId] ?? 0) + item.count;
      return acc;
    }, {});

    const normalizedUserId = normalizeUserIdValue(userId);
    const normalizedNewItems = normalizeNewItems(newItems)?.filter((itemId) =>
      Object.prototype.hasOwnProperty.call(itemCounts, itemId)
    );

    const totalItemCount = Object.values(itemCounts).reduce((total, value) => total + value, 0);
    if (totalItemCount !== normalizedPullCount) {
      console.warn('PullHistoryStore.recordGachaResult detected mismatch between pullCount and item counts', {
        expected: normalizedPullCount,
        actual: totalItemCount,
        result
      });
    }

    return this.appendPull(
      {
        gachaId: normalizedGachaId,
        userId: normalizedUserId,
        executedAt,
        pullCount: normalizedPullCount,
        currencyUsed,
        itemCounts,
        rarityCounts,
        newItems: normalizedNewItems
      },
      options
    );
  }

  replacePull(params: ReplacePullParams, options: UpdateOptions = { persist: 'immediate' }): void {
    const { entry, executedAtOverride } = params;
    if (!entry?.id) {
      console.warn('PullHistoryStore.replacePull called without entry id', params);
      return;
    }

    this.update((previous) => {
      const base = normalizeState(previous ?? this.loadLatestState());
      if (!base.pulls[entry.id]) {
        console.warn('PullHistoryStore.replacePull could not find entry', entry.id);
        return previous;
      }

      const now = new Date().toISOString();
      const sanitizedItemCounts = sanitizeCounts(entry.itemCounts);
      const sanitizedRarityCounts = sanitizeCounts(entry.rarityCounts);
      const normalizedSource: PullHistoryEntrySourceV1 = entry.source ?? 'insiteResult';

      const nextPulls = { ...base.pulls };
      const previousEntry = base.pulls[entry.id];
      const { status: incomingStatus, newItems: incomingNewItems, ...restEntry } = entry;
      const normalizedStatus =
        normalizeStatusValue(incomingStatus) ?? normalizeStatusValue(previousEntry?.status);
      const normalizedNewItems =
        normalizeNewItems(incomingNewItems) ?? normalizeNewItems(previousEntry?.newItems);
      const nextEntry: PullHistoryEntryV1 = {
        ...restEntry,
        executedAt: ensureTimestamp(executedAtOverride ?? entry.executedAt),
        itemCounts: sanitizedItemCounts,
        rarityCounts: Object.keys(sanitizedRarityCounts).length > 0 ? sanitizedRarityCounts : undefined,
        source: normalizedSource
      };
      if (normalizedStatus) {
        nextEntry.status = normalizedStatus;
      }
      if (normalizedNewItems) {
        nextEntry.newItems = normalizedNewItems;
      }
      nextPulls[entry.id] = nextEntry;

      const nextOrder = [entry.id, ...base.order.filter((existingId) => existingId !== entry.id)];

      return {
        version: 1,
        updatedAt: now,
        order: nextOrder,
        pulls: nextPulls
      } satisfies PullHistoryStateV1;
    }, options);
  }

  deletePull(pullId: string, options: UpdateOptions = { persist: 'immediate' }): void {
    if (!pullId) {
      console.warn('PullHistoryStore.deletePull called without pullId');
      return;
    }

    this.update((previous) => {
      const base = normalizeState(previous ?? this.loadLatestState());
      if (!base.pulls[pullId]) {
        return previous;
      }

      const now = new Date().toISOString();
      const nextPulls = { ...base.pulls };
      delete nextPulls[pullId];
      const nextOrder = base.order.filter((entryId) => entryId !== pullId);

      if (nextOrder.length === base.order.length && Object.keys(nextPulls).length === Object.keys(base.pulls).length) {
        return previous;
      }

      return {
        version: 1,
        updatedAt: now,
        order: nextOrder,
        pulls: nextPulls
      } satisfies PullHistoryStateV1;
    }, options);
  }

  deletePullsForInventory(
    params: { gachaId: string; userId?: string },
    options: UpdateOptions = { persist: 'immediate' }
  ): void {
    const normalizedUserId = typeof params.userId === 'string' && params.userId.length > 0 ? params.userId : undefined;
    const { gachaId } = params;

    if (!gachaId) {
      console.warn('PullHistoryStore.deletePullsForInventory called without gachaId', params);
      return;
    }

    this.update((previous) => {
      const base = normalizeState(previous ?? this.loadLatestState());

      const shouldRemove = (entry: PullHistoryEntryV1 | undefined): boolean => {
        if (!entry) {
          return true;
        }
        if (entry.gachaId !== gachaId) {
          return false;
        }
        if (normalizedUserId && entry.userId !== normalizedUserId) {
          return false;
        }
        return true;
      };

      let removed = false;
      const nextPulls: Record<string, PullHistoryEntryV1 | undefined> = {};
      const nextOrder: string[] = [];
      const seen = new Set<string>();

      base.order.forEach((entryId) => {
        const entry = base.pulls[entryId];
        if (shouldRemove(entry)) {
          removed = true;
          return;
        }
        if (!entry) {
          removed = true;
          return;
        }

        nextPulls[entryId] = entry;
        nextOrder.push(entryId);
        seen.add(entryId);
      });

      Object.entries(base.pulls).forEach(([entryId, entry]) => {
        if (seen.has(entryId)) {
          return;
        }

        if (shouldRemove(entry)) {
          removed = true;
          return;
        }
        if (!entry) {
          removed = true;
          return;
        }

        nextPulls[entryId] = entry;
        nextOrder.push(entryId);
      });

      if (!removed) {
        return previous;
      }

      if (nextOrder.length === 0) {
        return undefined;
      }

      const now = new Date().toISOString();

      return {
        version: 1,
        updatedAt: now,
        order: nextOrder,
        pulls: nextPulls
      } satisfies PullHistoryStateV1;
    }, options);
  }

  deletePullsForUser(userId: string, options: UpdateOptions = { persist: 'immediate' }): void {
    const normalizedUserId = normalizeUserIdValue(userId);
    if (!normalizedUserId) {
      return;
    }

    this.update((previous) => {
      const base = normalizeState(previous ?? this.loadLatestState());
      let removed = false;
      const nextPulls: Record<string, PullHistoryEntryV1 | undefined> = {};
      const nextOrder: string[] = [];
      const seen = new Set<string>();

      base.order.forEach((entryId) => {
        const entry = base.pulls[entryId];
        if (!entry) {
          removed = true;
          return;
        }
        if (normalizeUserIdValue(entry.userId) === normalizedUserId) {
          removed = true;
          return;
        }
        nextPulls[entryId] = entry;
        nextOrder.push(entryId);
        seen.add(entryId);
      });

      Object.entries(base.pulls).forEach(([entryId, entry]) => {
        if (seen.has(entryId)) {
          return;
        }
        if (!entry) {
          removed = true;
          return;
        }
        if (normalizeUserIdValue(entry.userId) === normalizedUserId) {
          removed = true;
          return;
        }
        nextPulls[entryId] = entry;
        nextOrder.push(entryId);
      });

      if (!removed) {
        return previous;
      }

      if (nextOrder.length === 0) {
        return undefined;
      }

      const now = new Date().toISOString();

      return {
        version: 1,
        updatedAt: now,
        order: nextOrder,
        pulls: nextPulls
      } satisfies PullHistoryStateV1;
    }, options);
  }

  recordManualInventoryChange(
    params: RecordManualInventoryChangeParams,
    options: UpdateOptions = { persist: 'immediate' }
  ): string | undefined {
    const { gachaId, userId, itemId, delta, executedAt, source } = params;

    const normalizedGachaId = gachaId?.trim() ?? '';
    if (!normalizedGachaId) {
      console.warn('PullHistoryStore.recordManualInventoryChange called without gachaId', params);
      return undefined;
    }

    const normalizedItemId = itemId?.trim() ?? '';
    if (!normalizedItemId) {
      console.warn('PullHistoryStore.recordManualInventoryChange called without itemId', params);
      return undefined;
    }

    if (!Number.isFinite(delta)) {
      console.warn('PullHistoryStore.recordManualInventoryChange called without valid delta', params);
      return undefined;
    }

    const normalizedDelta = Math.trunc(delta);
    if (normalizedDelta === 0) {
      return undefined;
    }

    const normalizedUserId = normalizeUserIdValue(userId);
    const executedAtIso = ensureTimestamp(executedAt);
    const normalizedSource: PullHistoryEntrySourceV1 = source ?? 'manual';

    let resultId: string | undefined;

    this.update((previous) => {
      const base = normalizeState(previous ?? this.loadLatestState());
      const now = new Date().toISOString();

      const entryId = generatePullId();
      const entry: PullHistoryEntryV1 = {
        id: entryId,
        gachaId: normalizedGachaId,
        userId: normalizedUserId,
        executedAt: executedAtIso,
        pullCount: 0,
        currencyUsed: 0,
        itemCounts: { [normalizedItemId]: normalizedDelta },
        source: normalizedSource,
        status: 'new'
      };

      const nextPulls = { ...base.pulls, [entryId]: entry };
      const nextOrder = [entryId, ...base.order.filter((existingId) => existingId !== entryId)];

      resultId = entryId;

      return {
        version: 1,
        updatedAt: now,
        order: nextOrder,
        pulls: nextPulls
      } satisfies PullHistoryStateV1;
    }, options);

    return resultId;
  }

  markPullStatus(
    pullIds: Iterable<string>,
    status: PullHistoryEntryStatus,
    options: UpdateOptions = { persist: 'immediate' }
  ): void {
    const normalizedStatus = normalizeStatusValue(status);
    if (!normalizedStatus) {
      return;
    }

    const uniqueIds = Array.from(
      new Set(
        Array.from(pullIds, (id) => (typeof id === 'string' ? id.trim() : '')).filter(
          (id): id is string => id.length > 0
        )
      )
    );

    if (uniqueIds.length === 0) {
      return;
    }

    this.update((previous) => {
      const base = normalizeState(previous ?? this.loadLatestState());
      let mutated = false;
      const nextPulls = { ...base.pulls };

      uniqueIds.forEach((pullId) => {
        const entry = nextPulls[pullId];
        if (!entry) {
          return;
        }
        if (entry.status === normalizedStatus) {
          return;
        }
        nextPulls[pullId] = { ...entry, status: normalizedStatus };
        mutated = true;
      });

      if (!mutated) {
        return previous;
      }

      const now = new Date().toISOString();

      return {
        version: 1,
        updatedAt: now,
        order: [...base.order],
        pulls: nextPulls
      } satisfies PullHistoryStateV1;
    }, options);
  }

  markPullOriginalPrizeMissing(
    pullIds: Iterable<string>,
    missingPullIds: Iterable<string>,
    options: UpdateOptions = { persist: 'immediate' }
  ): void {
    const targetIds = Array.from(
      new Set(
        Array.from(pullIds, (id) => (typeof id === 'string' ? id.trim() : '')).filter(
          (id): id is string => id.length > 0
        )
      )
    );
    if (targetIds.length === 0) {
      return;
    }

    const missingSet = new Set(
      Array.from(missingPullIds, (id) => (typeof id === 'string' ? id.trim() : '')).filter(
        (id): id is string => id.length > 0
      )
    );

    this.update((previous) => {
      const base = normalizeState(previous ?? this.loadLatestState());
      let mutated = false;
      const nextPulls = { ...base.pulls };

      targetIds.forEach((pullId) => {
        const entry = nextPulls[pullId];
        if (!entry) {
          return;
        }
        const shouldMark = missingSet.has(pullId);
        const currentMark = entry.hasOriginalPrizeMissing === true;
        if (shouldMark === currentMark) {
          return;
        }
        nextPulls[pullId] = {
          ...entry,
          hasOriginalPrizeMissing: shouldMark ? true : undefined
        };
        mutated = true;
      });

      if (!mutated) {
        return previous;
      }

      const now = new Date().toISOString();

      return {
        version: 1,
        updatedAt: now,
        order: [...base.order],
        pulls: nextPulls
      } satisfies PullHistoryStateV1;
    }, options);
  }

  deleteManualEntriesForItem(
    params: { gachaId: string; itemId: string },
    options: UpdateOptions = { persist: 'immediate' }
  ): void {
    const normalizedGachaId = params.gachaId?.trim() ?? '';
    const normalizedItemId = params.itemId?.trim() ?? '';

    if (!normalizedGachaId) {
      console.warn('PullHistoryStore.deleteManualEntriesForItem called without gachaId', params);
      return;
    }

    if (!normalizedItemId) {
      console.warn('PullHistoryStore.deleteManualEntriesForItem called without itemId', params);
      return;
    }

    this.update((previous) => {
      const base = normalizeState(previous ?? this.loadLatestState());

      let mutated = false;
      const nextPulls: Record<string, PullHistoryEntryV1 | undefined> = { ...base.pulls };

      Object.entries(base.pulls).forEach(([entryId, entry]) => {
        if (!entry) {
          return;
        }

        if (entry.gachaId !== normalizedGachaId) {
          return;
        }

        if (entry.source !== 'manual') {
          return;
        }

        if (entry.itemCounts?.[normalizedItemId] === undefined) {
          return;
        }

        delete nextPulls[entryId];
        mutated = true;
      });

      if (!mutated) {
        return previous;
      }

      const filteredEntries = Object.entries(nextPulls).filter(
        (entry): entry is [string, PullHistoryEntryV1] => Boolean(entry[1])
      );

      if (filteredEntries.length === 0) {
        return undefined;
      }

      const nextOrder = base.order.filter((entryId) => nextPulls[entryId]);
      filteredEntries.forEach(([entryId]) => {
        if (!nextOrder.includes(entryId)) {
          nextOrder.push(entryId);
        }
      });

      const now = new Date().toISOString();

      return {
        version: 1,
        updatedAt: now,
        order: nextOrder,
        pulls: Object.fromEntries(filteredEntries)
      } satisfies PullHistoryStateV1;
    }, options);
  }

  reorder(pullIds: string[], options: UpdateOptions = { persist: 'immediate' }): void {
    const uniqueIds = pullIds.filter((id, index, array) => typeof id === 'string' && array.indexOf(id) === index);
    this.update((previous) => {
      const base = normalizeState(previous ?? this.loadLatestState());
      if (uniqueIds.length === 0) {
        return previous;
      }

      const validIds = uniqueIds.filter((id) => Boolean(base.pulls[id]));
      if (validIds.length === 0) {
        return previous;
      }

      const now = new Date().toISOString();
      const remaining = base.order.filter((id) => !validIds.includes(id));
      const nextOrder = [...validIds, ...remaining];

      return {
        version: 1,
        updatedAt: now,
        order: nextOrder,
        pulls: { ...base.pulls }
      } satisfies PullHistoryStateV1;
    }, options);
  }

  clearHistory(options: UpdateOptions = { persist: 'immediate' }): void {
    this.setState(undefined, options);
  }

  protected persistImmediate(state: PullHistoryStateV1 | undefined): void {
    this.persistence.savePullHistory(state);
  }

  protected persistDebounced(state: PullHistoryStateV1 | undefined): void {
    this.persistence.savePullHistoryDebounced(state);
  }

  private loadLatestState(): PullHistoryStateV1 | undefined {
    try {
      return this.persistence.loadSnapshot().pullHistory;
    } catch (error) {
      console.warn('PullHistoryStore failed to load snapshot from persistence', error);
      return undefined;
    }
  }
}
