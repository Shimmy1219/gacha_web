import { useCallback, useEffect, useState } from 'react';

import {
  MAX_RATE_FRACTION_DIGITS,
  formatRarityRate,
  parseRarityRateInput
} from '../utils/rarityRate';
import {
  RATE_TOLERANCE,
  buildEmitRateUpdates,
  computeAutoAdjustRate,
  type EmitRateChangeError,
  type RateUpdate,
  type RarityRateRow
} from '../../../logic/rarityTable';

export interface EmitRateInputStateEntry {
  value: string;
  lastSyncedRate: number | undefined;
}

interface PrecisionExceededDetail {
  rarityId: string;
  fractionDigits: number;
  input: string;
}

interface UseRarityTableControllerOptions<Row extends RarityRateRow> {
  rows: ReadonlyArray<Row>;
  autoAdjustRarityId: string | null;
  onApplyRateUpdates: (updates: ReadonlyArray<RateUpdate>) => void;
  onAutoAdjustRate?: (rarityId: string, rate: number) => void;
  onPrecisionExceeded?: (detail: PrecisionExceededDetail) => void;
  onTotalExceedsLimit?: (error: EmitRateChangeError & { type: 'total-exceeds-limit' }) => void;
}

function countFractionDigits(value: string): number | null {
  const normalized = value.replace(/,/g, '').trim();

  if (normalized === '') {
    return null;
  }

  const exponentIndex = normalized.toLowerCase().indexOf('e');
  if (exponentIndex !== -1) {
    return null;
  }

  let unsigned = normalized;
  if (unsigned.startsWith('-') || unsigned.startsWith('+')) {
    unsigned = unsigned.slice(1);
  }

  const decimalPointIndex = unsigned.indexOf('.');
  if (decimalPointIndex === -1) {
    return 0;
  }

  return unsigned.slice(decimalPointIndex + 1).length;
}

export interface UseRarityTableControllerResult {
  emitRateInputs: Record<string, EmitRateInputStateEntry>;
  handleEmitRateInputChange: (rarityId: string, value: string) => void;
  handleEmitRateInputCommit: (rarityId: string) => void;
}

export function useRarityTableController<Row extends RarityRateRow>(
  options: UseRarityTableControllerOptions<Row>
): UseRarityTableControllerResult {
  const {
    rows,
    autoAdjustRarityId,
    onApplyRateUpdates,
    onAutoAdjustRate,
    onPrecisionExceeded,
    onTotalExceedsLimit
  } = options;

  const [emitRateInputs, setEmitRateInputs] = useState<Record<string, EmitRateInputStateEntry>>({});

  useEffect(() => {
    setEmitRateInputs((previous) => {
      let changed = false;
      const next: Record<string, EmitRateInputStateEntry> = {};

      rows.forEach((rarity) => {
        const prevEntry = previous[rarity.id];
        const formatted = formatRarityRate(rarity.emitRate);

        if (!prevEntry) {
          next[rarity.id] = { value: formatted, lastSyncedRate: rarity.emitRate };
          changed = true;
          return;
        }

        if (rarity.emitRate !== prevEntry.lastSyncedRate && formatted !== prevEntry.value) {
          next[rarity.id] = { value: formatted, lastSyncedRate: rarity.emitRate };
          changed = true;
          return;
        }

        const shouldUpdateSync = rarity.emitRate !== prevEntry.lastSyncedRate;
        next[rarity.id] = { value: prevEntry.value, lastSyncedRate: rarity.emitRate };
        if (shouldUpdateSync) {
          changed = true;
        }
      });

      if (Object.keys(previous).length !== rows.length) {
        changed = true;
      }

      if (!changed) {
        return previous;
      }

      return next;
    });
  }, [rows]);

  useEffect(() => {
    if (!autoAdjustRarityId) {
      return;
    }

    const computation = computeAutoAdjustRate(rows, autoAdjustRarityId);
    if (!computation) {
      return;
    }

    const autoAdjustRow = rows.find((rarity) => rarity.id === autoAdjustRarityId);
    const currentRate = autoAdjustRow?.emitRate ?? 0;

    if (Math.abs(currentRate - computation.desiredRate) <= RATE_TOLERANCE) {
      return;
    }

    onAutoAdjustRate?.(autoAdjustRarityId, computation.desiredRate);
  }, [autoAdjustRarityId, onAutoAdjustRate, rows]);

  const revertEmitRateInput = useCallback(
    (rarityId: string) => {
      const previousRow = rows.find((row) => row.id === rarityId);
      const previousRate = previousRow?.emitRate;
      const formatted = formatRarityRate(previousRate);
      setEmitRateInputs((previousInputs) => ({
        ...previousInputs,
        [rarityId]: {
          value: formatted,
          lastSyncedRate: previousRate
        }
      }));
    },
    [rows]
  );

  const handleEmitRateInputChange = useCallback(
    (rarityId: string, value: string) => {
      const previousRow = rows.find((row) => row.id === rarityId);
      const fallbackRate = previousRow?.emitRate;
      setEmitRateInputs((previousInputs) => {
        const prevEntry = previousInputs[rarityId];
        const nextSyncedRate = prevEntry?.lastSyncedRate ?? fallbackRate;
        if (prevEntry?.value === value && prevEntry?.lastSyncedRate === nextSyncedRate) {
          return previousInputs;
        }
        return {
          ...previousInputs,
          [rarityId]: {
            value,
            lastSyncedRate: nextSyncedRate
          }
        };
      });
    },
    [rows]
  );

  const handleEmitRateInputCommit = useCallback(
    (rarityId: string) => {
      const entry = emitRateInputs[rarityId];
      const value = entry?.value ?? '';
      const trimmed = value.trim();

      if (trimmed !== '') {
        const fractionDigits = countFractionDigits(trimmed);
        if (fractionDigits != null && fractionDigits > MAX_RATE_FRACTION_DIGITS) {
          revertEmitRateInput(rarityId);
          onPrecisionExceeded?.({ rarityId, fractionDigits, input: trimmed });
          return;
        }
      }

      const parsedRate = trimmed === '' ? null : parseRarityRateInput(trimmed);

      if (trimmed !== '' && parsedRate == null) {
        revertEmitRateInput(rarityId);
        return;
      }

      const nextRate = trimmed === '' ? 0 : parsedRate ?? undefined;
      const previousRow = rows.find((row) => row.id === rarityId);
      const currentRate = previousRow?.emitRate;
      const sanitizedValue = formatRarityRate(nextRate);

      const noChange =
        (nextRate == null && currentRate == null) ||
        (nextRate != null && currentRate != null && Math.abs(currentRate - nextRate) <= RATE_TOLERANCE);

      if (noChange) {
        setEmitRateInputs((previousInputs) => {
          const prevEntry = previousInputs[rarityId];
          if (prevEntry?.value === sanitizedValue && prevEntry?.lastSyncedRate === nextRate) {
            return previousInputs;
          }
          return {
            ...previousInputs,
            [rarityId]: {
              value: sanitizedValue,
              lastSyncedRate: nextRate
            }
          };
        });
        return;
      }

      const result = buildEmitRateUpdates({
        rarityId,
        nextRate,
        autoAdjustRarityId: autoAdjustRarityId ?? null,
        rows
      });

      if (result.error) {
        revertEmitRateInput(rarityId);
        if (result.error.type === 'total-exceeds-limit') {
          onTotalExceedsLimit?.(result.error);
        }
        return;
      }

      if (result.updates.length > 0) {
        onApplyRateUpdates(result.updates);
      }

      setEmitRateInputs((previousInputs) => ({
        ...previousInputs,
        [rarityId]: {
          value: sanitizedValue,
          lastSyncedRate: nextRate
        }
      }));

      if (result.autoAdjustRate != null && autoAdjustRarityId) {
        setEmitRateInputs((previousInputs) => {
          const prevEntry = previousInputs[autoAdjustRarityId];
          const formatted = formatRarityRate(result.autoAdjustRate);
          if (
            prevEntry &&
            prevEntry.value === formatted &&
            Math.abs((prevEntry.lastSyncedRate ?? 0) - result.autoAdjustRate) <= RATE_TOLERANCE
          ) {
            return previousInputs;
          }

          return {
            ...previousInputs,
            [autoAdjustRarityId]: {
              value: formatted,
              lastSyncedRate: result.autoAdjustRate
            }
          };
        });
      }
    },
    [
      autoAdjustRarityId,
      emitRateInputs,
      onApplyRateUpdates,
      onPrecisionExceeded,
      onTotalExceedsLimit,
      revertEmitRateInput,
      rows
    ]
  );

  return {
    emitRateInputs,
    handleEmitRateInputChange,
    handleEmitRateInputCommit
  };
}
