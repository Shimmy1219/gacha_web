import {
  AppPersistence,
  type PullHistoryEntryV1,
  type PullHistoryInventoryAdjustmentV1,
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

interface UpsertAdjustmentParams {
  gachaId: string;
  userId?: string;
  rarityId: string;
  itemId: string;
  count: number | null;
  executedAt?: string;
  notes?: string;
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

function buildAdjustmentKey(params: {
  userId?: string;
  gachaId: string;
  rarityId: string;
  itemId: string;
}): string {
  const { userId, gachaId, rarityId, itemId } = params;
  const normalizedUserId = normalizeUserIdValue(userId) ?? '__default__';
  return ['manual', normalizedUserId, gachaId, rarityId, itemId].join(':');
}

function normalizeAdjustmentCount(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  if (!Number.isFinite(value)) {
    return 0;
  }

  const normalized = Math.floor(value);
  return normalized >= 0 ? normalized : 0;
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
        notes,
        source: 'gacha'
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

  upsertAdjustment(
    params: UpsertAdjustmentParams,
    options: UpdateOptions = { persist: 'immediate' }
  ): string | undefined {
    const { gachaId, userId, rarityId, itemId, count, executedAt, notes } = params;

    const normalizedGachaId = typeof gachaId === 'string' ? gachaId.trim() : '';
    if (!normalizedGachaId) {
      console.warn('PullHistoryStore.upsertAdjustment called without gachaId', params);
      return undefined;
    }

    const normalizedItemId = typeof itemId === 'string' ? itemId.trim() : '';
    if (!normalizedItemId) {
      console.warn('PullHistoryStore.upsertAdjustment called without itemId', params);
      return undefined;
    }

    const normalizedRarityId = typeof rarityId === 'string' ? rarityId.trim() : '';
    if (!normalizedRarityId) {
      console.warn('PullHistoryStore.upsertAdjustment called without rarityId', params);
      return undefined;
    }

    const normalizedCount = normalizeAdjustmentCount(count);
    const normalizedUserId = normalizeUserIdValue(userId);
    const adjustmentKey = buildAdjustmentKey({
      userId: normalizedUserId,
      gachaId: normalizedGachaId,
      rarityId: normalizedRarityId,
      itemId: normalizedItemId
    });

    const executedAtIso = ensureTimestamp(executedAt);
    let resultId: string | undefined;

    this.update((previous) => {
      const base = normalizeState(previous ?? this.loadLatestState());
      const now = new Date().toISOString();

      let targetId: string | undefined;
      let targetEntry: PullHistoryEntryV1 | undefined;

      for (const [entryId, entry] of Object.entries(base.pulls)) {
        if (!entry) {
          continue;
        }

        const adjustments = Array.isArray(entry.adjustments) ? entry.adjustments : [];
        if (adjustments.length === 0) {
          continue;
        }

        const matched = adjustments.some((adjustment) => adjustment?.key === adjustmentKey);
        if (matched) {
          targetId = entryId;
          targetEntry = entry;
          break;
        }
      }

      if (normalizedCount === null) {
        if (!targetId || !targetEntry) {
          return previous;
        }

        const remainingAdjustments = (targetEntry.adjustments ?? []).filter(
          (adjustment) => adjustment?.key !== adjustmentKey
        );

        const nextPulls = { ...base.pulls };
        const nextOrder = base.order.filter((entryId) => entryId !== targetId);

        if (remainingAdjustments.length === 0) {
          delete nextPulls[targetId];
          resultId = targetId;

          if (nextOrder.length === 0 && Object.keys(nextPulls).length === 0) {
            return undefined;
          }

          return {
            version: 1,
            updatedAt: now,
            order: nextOrder.length > 0 ? nextOrder : Object.keys(nextPulls),
            pulls: nextPulls
          } satisfies PullHistoryStateV1;
        }

        const updatedEntry: PullHistoryEntryV1 = {
          ...targetEntry,
          userId: normalizedUserId,
          gachaId: normalizedGachaId,
          executedAt: executedAtIso,
          notes: notes ?? targetEntry.notes,
          adjustments: remainingAdjustments,
          itemCounts: targetEntry.itemCounts ?? {},
          pullCount: 0,
          source: 'manual'
        };

        const nextPulls = { ...base.pulls, [targetId]: updatedEntry };
        const nextOrderWithTarget = [targetId, ...nextOrder];

        resultId = targetId;
        return {
          version: 1,
          updatedAt: now,
          order: nextOrderWithTarget,
          pulls: nextPulls
        } satisfies PullHistoryStateV1;
      }

      const adjustment: PullHistoryInventoryAdjustmentV1 = {
        type: 'inventory-count',
        key: adjustmentKey,
        itemId: normalizedItemId,
        rarityId: normalizedRarityId,
        count: normalizedCount ?? 0
      };

      if (targetId && targetEntry) {
        const adjustments = Array.isArray(targetEntry.adjustments)
          ? targetEntry.adjustments.slice()
          : [];

        let mutated = false;
        for (let index = 0; index < adjustments.length; index += 1) {
          const candidate = adjustments[index];
          if (!candidate || candidate.key !== adjustmentKey) {
            continue;
          }
          if (
            candidate.count === adjustment.count &&
            candidate.itemId === adjustment.itemId &&
            candidate.rarityId === adjustment.rarityId &&
            (notes === undefined || notes === targetEntry.notes) &&
            targetEntry.userId === normalizedUserId &&
            targetEntry.gachaId === normalizedGachaId &&
            targetEntry.executedAt === executedAtIso
          ) {
            resultId = targetId;
            return previous;
          }

          adjustments[index] = { ...candidate, ...adjustment };
          mutated = true;
          break;
        }

        if (!mutated) {
          adjustments.push(adjustment);
          mutated = true;
        }

        if (!mutated) {
          resultId = targetId;
          return previous;
        }

        const updatedEntry: PullHistoryEntryV1 = {
          ...targetEntry,
          userId: normalizedUserId,
          gachaId: normalizedGachaId,
          executedAt: executedAtIso,
          notes: notes ?? targetEntry.notes,
          adjustments,
          itemCounts: targetEntry.itemCounts ?? {},
          pullCount: 0,
          source: 'manual'
        };

        const nextPulls = { ...base.pulls, [targetId]: updatedEntry };
        const nextOrder = [targetId, ...base.order.filter((entryId) => entryId !== targetId)];

        resultId = targetId;
        return {
          version: 1,
          updatedAt: now,
          order: nextOrder,
          pulls: nextPulls
        } satisfies PullHistoryStateV1;
      }

      const entryId = generatePullId();
      const entry: PullHistoryEntryV1 = {
        id: entryId,
        gachaId: normalizedGachaId,
        userId: normalizedUserId,
        executedAt: executedAtIso,
        pullCount: 0,
        itemCounts: {},
        notes,
        source: 'manual',
        adjustments: [adjustment]
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

  retargetAdjustmentsForItem(
    params: {
      gachaId: string;
      itemId: string;
      previousRarityId: string;
      nextRarityId: string;
      executedAt?: string;
    },
    options: UpdateOptions = { persist: 'immediate' }
  ): void {
    const normalizedGachaId = params.gachaId?.trim() ?? '';
    const normalizedItemId = params.itemId?.trim() ?? '';
    const previousRarityId = params.previousRarityId?.trim() ?? '';
    const nextRarityId = params.nextRarityId?.trim() ?? '';

    if (!normalizedGachaId) {
      console.warn('PullHistoryStore.retargetAdjustmentsForItem called without gachaId', params);
      return;
    }

    if (!normalizedItemId) {
      console.warn('PullHistoryStore.retargetAdjustmentsForItem called without itemId', params);
      return;
    }

    if (!previousRarityId || !nextRarityId || previousRarityId === nextRarityId) {
      return;
    }

    const executedAtIso = ensureTimestamp(params.executedAt);

    this.update((previous) => {
      const base = normalizeState(previous ?? this.loadLatestState());

      let mutated = false;
      const nextPulls = { ...base.pulls };
      let nextOrder = base.order.slice();

      Object.entries(base.pulls).forEach(([entryId, entry]) => {
        if (!entry || entry.gachaId !== normalizedGachaId) {
          return;
        }

        const adjustments = Array.isArray(entry.adjustments) ? entry.adjustments : [];
        if (adjustments.length === 0) {
          return;
        }

        const normalizedUserId = normalizeUserIdValue(entry.userId);
        const previousKey = buildAdjustmentKey({
          userId: normalizedUserId,
          gachaId: normalizedGachaId,
          rarityId: previousRarityId,
          itemId: normalizedItemId
        });
        const nextKey = buildAdjustmentKey({
          userId: normalizedUserId,
          gachaId: normalizedGachaId,
          rarityId: nextRarityId,
          itemId: normalizedItemId
        });

        let entryMutated = false;
        const seenKeys = new Set<string>();
        const nextAdjustments: PullHistoryInventoryAdjustmentV1[] = [];

        adjustments.forEach((adjustment) => {
          if (!adjustment) {
            return;
          }

          let candidate = adjustment;

          if (
            adjustment.type === 'inventory-count' &&
            adjustment.itemId === normalizedItemId &&
            (adjustment.key === previousKey || adjustment.rarityId === previousRarityId)
          ) {
            entryMutated = true;
            candidate = {
              ...adjustment,
              key: nextKey,
              rarityId: nextRarityId
            };
          }

          if (seenKeys.has(candidate.key)) {
            const index = nextAdjustments.findIndex((record) => record.key === candidate.key);
            if (index >= 0) {
              nextAdjustments[index] = candidate;
            }
            return;
          }

          nextAdjustments.push(candidate);
          seenKeys.add(candidate.key);
        });

        if (!entryMutated) {
          return;
        }

        mutated = true;
        nextPulls[entryId] = {
          ...entry,
          adjustments: nextAdjustments,
          executedAt: executedAtIso,
          source: entry.source ?? 'manual'
        };
        nextOrder = [entryId, ...nextOrder.filter((id) => id !== entryId)];
      });

      if (!mutated) {
        return previous;
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

  deleteAdjustmentsForItem(
    params: { gachaId: string; itemId: string; executedAt?: string },
    options: UpdateOptions = { persist: 'immediate' }
  ): void {
    const normalizedGachaId = params.gachaId?.trim() ?? '';
    const normalizedItemId = params.itemId?.trim() ?? '';

    if (!normalizedGachaId) {
      console.warn('PullHistoryStore.deleteAdjustmentsForItem called without gachaId', params);
      return;
    }

    if (!normalizedItemId) {
      console.warn('PullHistoryStore.deleteAdjustmentsForItem called without itemId', params);
      return;
    }

    const executedAtIso = ensureTimestamp(params.executedAt);

    this.update((previous) => {
      const base = normalizeState(previous ?? this.loadLatestState());

      let mutated = false;
      const nextPulls: Record<string, PullHistoryEntryV1 | undefined> = { ...base.pulls };
      let nextOrder = base.order.slice();

      Object.entries(base.pulls).forEach(([entryId, entry]) => {
        if (!entry || entry.gachaId !== normalizedGachaId) {
          return;
        }

        const adjustments = Array.isArray(entry.adjustments) ? entry.adjustments : [];
        if (adjustments.length === 0) {
          return;
        }

        const remaining = adjustments.filter(
          (adjustment) =>
            !adjustment ||
            adjustment.type !== 'inventory-count' ||
            adjustment.itemId !== normalizedItemId
        );

        if (remaining.length === adjustments.length) {
          return;
        }

        mutated = true;

        if (
          remaining.length === 0 &&
          (entry.pullCount ?? 0) <= 0 &&
          Object.keys(entry.itemCounts ?? {}).length === 0
        ) {
          delete nextPulls[entryId];
          nextOrder = nextOrder.filter((id) => id !== entryId);
          return;
        }

        const seenKeys = new Set<string>();
        const normalizedRemaining: PullHistoryInventoryAdjustmentV1[] = [];

        remaining.forEach((adjustment) => {
          if (!adjustment) {
            return;
          }

          if (seenKeys.has(adjustment.key)) {
            const index = normalizedRemaining.findIndex((record) => record.key === adjustment.key);
            if (index >= 0) {
              normalizedRemaining[index] = adjustment;
            }
            return;
          }

          normalizedRemaining.push(adjustment);
          seenKeys.add(adjustment.key);
        });

        nextPulls[entryId] = {
          ...entry,
          adjustments: normalizedRemaining,
          executedAt: executedAtIso,
          source: entry.source ?? 'manual'
        };
        nextOrder = [entryId, ...nextOrder.filter((id) => id !== entryId)];
      });

      if (!mutated) {
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
