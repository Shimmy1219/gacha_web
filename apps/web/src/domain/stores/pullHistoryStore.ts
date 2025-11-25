import {
  AppPersistence,
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
}

interface ReplacePullParams {
  entry: PullHistoryEntryV1;
  executedAtOverride?: string;
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

const PULL_HISTORY_STATUS_VALUES: readonly PullHistoryEntryStatus[] = ['new', 'ziped', 'uploaded'];

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
  const { status: _ignoredStatus, ...rest } = entry;
  const normalizedEntry: PullHistoryEntryV1 = {
    ...rest,
    source: entry.source ?? 'insiteResult'
  };

  if (normalizedStatus) {
    normalizedEntry.status = normalizedStatus;
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

  appendPull(params: AppendPullParams, options: UpdateOptions = { persist: 'immediate' }): string {
    const { gachaId, userId, executedAt, pullCount, currencyUsed, itemCounts, rarityCounts, source, id } = params;

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
        status: 'new'
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
    const { gachaId, userId, executedAt, pullCount, currencyUsed, items } = result;

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
        rarityCounts
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
      const { status: incomingStatus, ...restEntry } = entry;
      const normalizedStatus =
        normalizeStatusValue(incomingStatus) ?? normalizeStatusValue(previousEntry?.status);
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
