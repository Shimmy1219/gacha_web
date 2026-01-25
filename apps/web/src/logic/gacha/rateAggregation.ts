import {
  MAX_RATE_FRACTION_DIGITS,
  formatRarityRate
} from '../../features/rarity/utils/rarityRate';
import { RATE_TOLERANCE, getAutoAdjustRarityId, sortRarityRows, type RarityRateRow } from '../rarityTable';
import type {
  BuildGachaPoolsArgs,
  BuildGachaPoolsResult,
  GachaItemDefinition,
  GachaPoolDefinition,
  GachaRarityGroup,
  RarityRateRedistribution
} from './types';
import { resolveRemainingStock } from './stock';

function clampFractionDigits(value?: number | null): number | undefined {
  if (value == null || Number.isNaN(value)) {
    return undefined;
  }

  const truncated = Math.trunc(value);
  if (!Number.isFinite(truncated)) {
    return undefined;
  }

  if (truncated <= 0) {
    return 0;
  }

  if (truncated >= MAX_RATE_FRACTION_DIGITS) {
    return MAX_RATE_FRACTION_DIGITS;
  }

  return truncated;
}

export function formatItemRateWithPrecision(rate?: number, fractionDigits?: number): string {
  if (rate == null || Number.isNaN(rate)) {
    return '';
  }

  const formatted = formatRarityRate(rate);
  const digits = clampFractionDigits(fractionDigits);

  if (digits == null || !formatted || formatted.endsWith('...')) {
    return formatted;
  }

  const dotIndex = formatted.indexOf('.');
  if (dotIndex === -1) {
    if (digits <= 0) {
      return formatted;
    }
    return `${formatted}.${'0'.repeat(digits)}`;
  }

  const currentDigits = formatted.length - dotIndex - 1;
  if (currentDigits >= digits) {
    return formatted;
  }

  return `${formatted}${'0'.repeat(digits - currentDigits)}`;
}

export function inferRarityFractionDigits(
  rarityState: BuildGachaPoolsArgs['rarityState']
): Map<string, number> {
  const result = new Map<string, number>();
  const entities = rarityState?.entities ?? {};

  Object.entries(entities).forEach(([rarityId, entity]) => {
    const formatted = formatRarityRate(entity?.emitRate);
    if (!formatted) {
      return;
    }

    const sanitized = formatted.endsWith('...') ? formatted.slice(0, -3) : formatted;
    const dotIndex = sanitized.indexOf('.');
    const digits = dotIndex === -1 ? 0 : sanitized.length - dotIndex - 1;
    result.set(rarityId, digits);
  });

  return result;
}

function buildEffectiveRarityEmitRates(
  gachaId: string,
  rarityState: BuildGachaPoolsArgs['rarityState'],
  rarityStats: Map<string, { itemCount: number; totalWeight: number }>
): { rates: Map<string, number | undefined>; redistribution: RarityRateRedistribution | null } {
  const rarityIds = rarityState?.byGacha?.[gachaId] ?? [];
  if (rarityIds.length === 0) {
    return { rates: new Map(), redistribution: null };
  }

  const entities = rarityState?.entities ?? {};
  const rows: RarityRateRow[] = rarityIds.map((rarityId) => {
    const entity = entities[rarityId];
    return {
      id: rarityId,
      emitRate: typeof entity?.emitRate === 'number' ? entity.emitRate : undefined,
      sortOrder: typeof entity?.sortOrder === 'number' ? entity.sortOrder : undefined,
      label: entity?.label ?? ''
    };
  });

  const sortedRows = sortRarityRows(rows);
  const autoAdjustRarityId = getAutoAdjustRarityId(sortedRows);

  const sourceRarityIds: string[] = [];
  const missingRate = rows.reduce((sum, row) => {
    const hasItems = (rarityStats.get(row.id)?.itemCount ?? 0) > 0;
    if (hasItems) {
      return sum;
    }
    const rate = row.emitRate ?? 0;
    if (rate > 0) {
      sourceRarityIds.push(row.id);
    }
    return sum + rate;
  }, 0);

  const availableRows = sortedRows.filter((row) => (rarityStats.get(row.id)?.itemCount ?? 0) > 0);
  if (availableRows.length === 0) {
    return { rates: new Map(rows.map((row) => [row.id, row.emitRate])), redistribution: null };
  }

  const canUseAutoAdjust = autoAdjustRarityId && availableRows.some((row) => row.id === autoAdjustRarityId);
  const targetId = canUseAutoAdjust ? autoAdjustRarityId : availableRows[availableRows.length - 1]?.id ?? null;

  const result = new Map<string, number | undefined>(rows.map((row) => [row.id, row.emitRate]));
  let redistribution: RarityRateRedistribution | null = null;

  if (targetId && missingRate > RATE_TOLERANCE) {
    const current = result.get(targetId) ?? 0;
    result.set(targetId, current + missingRate);
    redistribution = {
      targetRarityId: targetId,
      sourceRarityIds,
      totalMissingRate: missingRate,
      targetStrategy: canUseAutoAdjust ? 'auto-adjust' : 'next-highest'
    };
  }

  return { rates: result, redistribution };
}

export function buildGachaPools({
  catalogState,
  rarityState,
  rarityFractionDigits,
  inventoryCountsByItemId
}: BuildGachaPoolsArgs): BuildGachaPoolsResult {
  const poolsByGachaId = new Map<string, GachaPoolDefinition>();
  const itemsById = new Map<string, GachaItemDefinition>();
  const rateRedistributionsByGachaId = new Map<string, RarityRateRedistribution>();

  if (!catalogState?.byGacha) {
    return { poolsByGachaId, itemsById, rateRedistributionsByGachaId };
  }

  const rarityEntities = rarityState?.entities ?? {};

  Object.entries(catalogState.byGacha).forEach(([gachaId, catalog]) => {
    if (!catalog?.order?.length) {
      return;
    }

    const rarityStats = new Map<string, { itemCount: number; totalWeight: number }>();
    const remainingStockByItemId = new Map<string, number | null>();

    catalog.order.forEach((itemId) => {
      const snapshot = catalog.items?.[itemId];
      if (!snapshot) {
        return;
      }

      const remainingStock = resolveRemainingStock(
        snapshot.itemId,
        snapshot.stockCount,
        inventoryCountsByItemId
      );
      remainingStockByItemId.set(snapshot.itemId, remainingStock);
      if (remainingStock === 0) {
        return;
      }

      const weight = snapshot.pickupTarget ? 2 : 1;
      const existing = rarityStats.get(snapshot.rarityId);
      if (existing) {
        existing.itemCount += 1;
        existing.totalWeight += weight;
      } else {
        rarityStats.set(snapshot.rarityId, { itemCount: 1, totalWeight: weight });
      }
    });

    const { rates: effectiveRarityEmitRates, redistribution } = buildEffectiveRarityEmitRates(
      gachaId,
      rarityState,
      rarityStats
    );
    if (redistribution) {
      rateRedistributionsByGachaId.set(gachaId, redistribution);
    }
    const rarityGroups = new Map<string, GachaRarityGroup>();
    const items: GachaItemDefinition[] = [];

    catalog.order.forEach((itemId) => {
      const snapshot = catalog.items?.[itemId];
      if (!snapshot) {
        return;
      }

      const remainingStock = remainingStockByItemId.get(snapshot.itemId) ?? null;
      if (remainingStock === 0) {
        return;
      }

      const rarityEntity = rarityEntities[snapshot.rarityId];
      const baseEmitRate = typeof rarityEntity?.emitRate === 'number' ? rarityEntity.emitRate : undefined;
      const rarityEmitRate = effectiveRarityEmitRates.get(snapshot.rarityId) ?? baseEmitRate;
      const stats = rarityStats.get(snapshot.rarityId);
      const totalWeight = stats?.totalWeight ?? 0;
      const itemWeight = snapshot.pickupTarget ? 2 : 1;
      const itemRate = rarityEmitRate && totalWeight > 0 ? (rarityEmitRate * itemWeight) / totalWeight : undefined;
      const ratePrecision = rarityFractionDigits?.get(snapshot.rarityId);
      const formattedRate = formatItemRateWithPrecision(itemRate, ratePrecision);
      const stockCount = typeof snapshot.stockCount === 'number' && Number.isFinite(snapshot.stockCount)
        ? Math.max(0, Math.floor(snapshot.stockCount))
        : undefined;

      const item: GachaItemDefinition = {
        itemId: snapshot.itemId,
        name: snapshot.name,
        rarityId: snapshot.rarityId,
        rarityLabel: rarityEntity?.label ?? snapshot.rarityId,
        rarityColor: rarityEntity?.color ?? undefined,
        rarityEmitRate,
        itemRate,
        itemRateDisplay: formattedRate ? `${formattedRate}%` : '',
        pickupTarget: Boolean(snapshot.pickupTarget),
        drawWeight: itemWeight,
        stockCount,
        remainingStock: remainingStock ?? undefined
      };

      items.push(item);
      itemsById.set(item.itemId, item);

      const group = rarityGroups.get(snapshot.rarityId);
      if (group) {
        group.items.push(item);
        group.itemCount += 1;
        group.totalWeight += itemWeight;
      } else {
        rarityGroups.set(snapshot.rarityId, {
          rarityId: snapshot.rarityId,
          label: item.rarityLabel,
          color: item.rarityColor,
          emitRate: rarityEmitRate,
          itemCount: 1,
          totalWeight: itemWeight,
          items: [item]
        });
      }
    });

    if (!items.length) {
      return;
    }

    poolsByGachaId.set(gachaId, {
      gachaId,
      items,
      rarityGroups
    });
  });

  return { poolsByGachaId, itemsById, rateRedistributionsByGachaId };
}
