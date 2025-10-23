import {
  AppPersistence,
  type PullHistoryEntryV1,
  type PullHistoryStateV1
} from '../app-persistence';
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
  notes?: string;
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
    const entry = state.pulls?.[id];
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
    pulls[id] = entry;
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
    const {
      gachaId,
      userId,
      executedAt,
      pullCount,
      currencyUsed,
      itemCounts,
      rarityCounts,
      notes,
      id
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
        notes
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

    return entryId;
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

      const nextPulls = { ...base.pulls };
      nextPulls[entry.id] = {
        ...entry,
        executedAt: ensureTimestamp(executedAtOverride ?? entry.executedAt),
        itemCounts: sanitizedItemCounts,
        rarityCounts: Object.keys(sanitizedRarityCounts).length > 0 ? sanitizedRarityCounts : undefined
      };

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
