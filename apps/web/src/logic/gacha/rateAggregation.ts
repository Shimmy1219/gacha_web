import {
  MAX_RATE_FRACTION_DIGITS,
  formatRarityRate
} from '../../features/rarity/utils/rarityRate';
import type {
  BuildGachaPoolsArgs,
  BuildGachaPoolsResult,
  GachaItemDefinition,
  GachaPoolDefinition,
  GachaRarityGroup
} from './types';

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

  if (digits == null || !formatted) {
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

    const dotIndex = formatted.indexOf('.');
    const digits = dotIndex === -1 ? 0 : formatted.length - dotIndex - 1;
    result.set(rarityId, digits);
  });

  return result;
}

export function buildGachaPools({
  catalogState,
  rarityState,
  rarityFractionDigits
}: BuildGachaPoolsArgs): BuildGachaPoolsResult {
  const poolsByGachaId = new Map<string, GachaPoolDefinition>();
  const itemsById = new Map<string, GachaItemDefinition>();

  if (!catalogState?.byGacha) {
    return { poolsByGachaId, itemsById };
  }

  const rarityEntities = rarityState?.entities ?? {};

  Object.entries(catalogState.byGacha).forEach(([gachaId, catalog]) => {
    if (!catalog?.order?.length) {
      return;
    }

    const rarityCounts = new Map<string, number>();

    catalog.order.forEach((itemId) => {
      const snapshot = catalog.items?.[itemId];
      if (!snapshot) {
        return;
      }
      const previous = rarityCounts.get(snapshot.rarityId) ?? 0;
      rarityCounts.set(snapshot.rarityId, previous + 1);
    });

    const rarityGroups = new Map<string, GachaRarityGroup>();
    const items: GachaItemDefinition[] = [];

    catalog.order.forEach((itemId) => {
      const snapshot = catalog.items?.[itemId];
      if (!snapshot) {
        return;
      }

      const rarityEntity = rarityEntities[snapshot.rarityId];
      const rarityEmitRate = typeof rarityEntity?.emitRate === 'number' ? rarityEntity.emitRate : undefined;
      const rarityCount = rarityCounts.get(snapshot.rarityId) ?? 0;
      const itemRate = rarityEmitRate && rarityCount > 0 ? rarityEmitRate / rarityCount : undefined;
      const ratePrecision = rarityFractionDigits?.get(snapshot.rarityId);
      const formattedRate = formatItemRateWithPrecision(itemRate, ratePrecision);

      const item: GachaItemDefinition = {
        itemId: snapshot.itemId,
        name: snapshot.name,
        rarityId: snapshot.rarityId,
        rarityLabel: rarityEntity?.label ?? snapshot.rarityId,
        rarityColor: rarityEntity?.color ?? undefined,
        rarityEmitRate,
        itemRate,
        itemRateDisplay: formattedRate ? `${formattedRate}%` : ''
      };

      items.push(item);
      itemsById.set(item.itemId, item);

      const group = rarityGroups.get(snapshot.rarityId);
      if (group) {
        group.items.push(item);
        group.itemCount += 1;
      } else {
        rarityGroups.set(snapshot.rarityId, {
          rarityId: snapshot.rarityId,
          label: item.rarityLabel,
          color: item.rarityColor,
          emitRate: rarityEmitRate,
          itemCount: 1,
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

  return { poolsByGachaId, itemsById };
}
