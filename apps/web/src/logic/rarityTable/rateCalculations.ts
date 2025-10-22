export const RATE_TOLERANCE = 1e-6;

export interface RarityRateRow {
  id: string;
  emitRate?: number;
  sortOrder?: number;
  label?: string;
}

export interface RateUpdate {
  rarityId: string;
  emitRate: number | undefined;
}

export interface EmitRateChangeError {
  type: 'total-exceeds-limit';
  total: number;
}

export interface EmitRateChangeResult {
  updates: RateUpdate[];
  error?: EmitRateChangeError;
  autoAdjustRate?: number;
}

export interface EmitRateChangeParams<T extends RarityRateRow> {
  rarityId: string;
  nextRate: number | undefined;
  autoAdjustRarityId: string | null;
  rows: ReadonlyArray<T>;
}

export interface AutoAdjustComputation {
  desiredRate: number;
  sumOfOthers: number;
}

export function clampRate(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round(clamped * 1e8) / 1e8;
}

export function sortRarityRows<T extends RarityRateRow>(rows: ReadonlyArray<T>): T[] {
  const sorted = [...rows] as T[];
  sorted.sort((a, b) => {
    const aRate = typeof a.emitRate === 'number' ? a.emitRate : Number.POSITIVE_INFINITY;
    const bRate = typeof b.emitRate === 'number' ? b.emitRate : Number.POSITIVE_INFINITY;

    if (Math.abs(aRate - bRate) > RATE_TOLERANCE) {
      return aRate - bRate;
    }

    const aOrder = typeof a.sortOrder === 'number' ? a.sortOrder : Number.POSITIVE_INFINITY;
    const bOrder = typeof b.sortOrder === 'number' ? b.sortOrder : Number.POSITIVE_INFINITY;

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    const aLabel = a.label ?? '';
    const bLabel = b.label ?? '';

    if (aLabel !== bLabel) {
      return aLabel.localeCompare(bLabel);
    }

    return a.id.localeCompare(b.id);
  });
  return sorted;
}

export function getAutoAdjustRarityId<T extends RarityRateRow>(rows: ReadonlyArray<T>): string | null {
  if (rows.length < 2) {
    return null;
  }
  const last = rows[rows.length - 1];
  return last ? last.id : null;
}

export function computeAutoAdjustRate<T extends RarityRateRow>(
  rows: ReadonlyArray<T>,
  autoAdjustRarityId: string | null
): AutoAdjustComputation | null {
  if (!autoAdjustRarityId || rows.length <= 1) {
    return null;
  }

  const sumOfOthers = rows.reduce((sum, row) => {
    if (row.id === autoAdjustRarityId) {
      return sum;
    }
    return sum + (row.emitRate ?? 0);
  }, 0);

  return {
    desiredRate: clampRate(1 - sumOfOthers),
    sumOfOthers
  };
}

export function buildEmitRateUpdates<T extends RarityRateRow>(
  params: EmitRateChangeParams<T>
): EmitRateChangeResult {
  const { rarityId, nextRate, autoAdjustRarityId, rows } = params;
  const autoAdjustEnabled = autoAdjustRarityId != null && rows.length > 1;

  if (!autoAdjustEnabled || rarityId === autoAdjustRarityId) {
    return {
      updates: [
        {
          rarityId,
          emitRate: nextRate
        }
      ]
    };
  }

  const sumOfOthers = rows.reduce((sum, row) => {
    if (row.id === autoAdjustRarityId) {
      return sum;
    }
    if (row.id === rarityId) {
      return sum + (nextRate ?? 0);
    }
    return sum + (row.emitRate ?? 0);
  }, 0);

  if (sumOfOthers - 1 > RATE_TOLERANCE) {
    return {
      updates: [],
      error: {
        type: 'total-exceeds-limit',
        total: sumOfOthers
      }
    };
  }

  const desiredRate = clampRate(1 - sumOfOthers);
  const updates: RateUpdate[] = [
    {
      rarityId,
      emitRate: nextRate
    }
  ];

  const autoAdjustRow = rows.find((row) => row.id === autoAdjustRarityId);
  const currentAutoRate = autoAdjustRow?.emitRate ?? 0;

  if (Math.abs(currentAutoRate - desiredRate) > RATE_TOLERANCE) {
    updates.push({
      rarityId: autoAdjustRarityId,
      emitRate: desiredRate
    });
  }

  return {
    updates,
    autoAdjustRate: desiredRate
  };
}
