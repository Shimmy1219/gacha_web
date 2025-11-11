import { describe, expect, it } from 'vitest';

import {
  buildGachaPools,
  formatItemRateWithPrecision,
  inferRarityFractionDigits
} from '../rateAggregation';

const baseTimestamp = new Date().toISOString();

function buildTestStates({
  emitRate,
  itemCount,
  rarityId = 'rarity-1',
  gachaId = 'gacha-1',
  label = 'UR'
}: {
  emitRate: number;
  itemCount: number;
  rarityId?: string;
  gachaId?: string;
  label?: string;
}) {
  const itemIds = Array.from({ length: itemCount }, (_, index) => `item-${index + 1}`);

  const catalogState = {
    version: 3,
    updatedAt: baseTimestamp,
    byGacha: {
      [gachaId]: {
        order: itemIds,
        items: Object.fromEntries(
          itemIds.map((itemId) => [itemId, { itemId, name: itemId, rarityId }])
        )
      }
    }
  } satisfies import('@domain/app-persistence').GachaCatalogStateV3;

  const rarityState = {
    version: 3,
    updatedAt: baseTimestamp,
    byGacha: {
      [gachaId]: [rarityId]
    },
    entities: {
      [rarityId]: {
        id: rarityId,
        gachaId,
        label,
        emitRate
      }
    }
  } satisfies import('@domain/app-persistence').GachaRarityStateV3;

  const rarityFractionDigits = inferRarityFractionDigits(rarityState);

  return {
    gachaId,
    rarityId,
    catalogState,
    rarityState,
    rarityFractionDigits
  };
}

describe('formatItemRateWithPrecision', () => {
  it('returns formatted rate without rounding when precision is omitted', () => {
    const result = formatItemRateWithPrecision(0.00123456789);
    expect(result).toBe('0.123456789');
  });

  it('does not round away fractional precision when precision is provided', () => {
    const result = formatItemRateWithPrecision(0.00108025, 2);
    expect(result).toBe('0.108025');
  });

  it('pads the formatted rate when fewer digits are present', () => {
    const result = formatItemRateWithPrecision(0.05, 3);
    expect(result).toBe('5.000');
  });
});

describe('buildGachaPools item rate distribution', () => {
  it('splits a 1% UR rate across five items without rounding', () => {
    const { gachaId, catalogState, rarityState, rarityFractionDigits } = buildTestStates({
      emitRate: 0.01,
      itemCount: 5
    });

    const { poolsByGachaId } = buildGachaPools({
      catalogState,
      rarityState,
      rarityFractionDigits
    });

    const pool = poolsByGachaId.get(gachaId);
    expect(pool?.items).toHaveLength(5);
    pool?.items.forEach((item) => {
      expect(item.itemRate).toBeCloseTo(0.002, 12);
      expect(item.itemRateDisplay).toBe('0.2%');
    });
  });

  it('handles small UR rates and five items', () => {
    const { gachaId, catalogState, rarityState, rarityFractionDigits } = buildTestStates({
      emitRate: 0.0001,
      itemCount: 5
    });

    const { poolsByGachaId } = buildGachaPools({
      catalogState,
      rarityState,
      rarityFractionDigits
    });

    const pool = poolsByGachaId.get(gachaId);
    expect(pool?.items).toHaveLength(5);
    pool?.items.forEach((item) => {
      expect(item.itemRate).toBeCloseTo(0.00002, 15);
      expect(item.itemRateDisplay).toBe('0.002%');
    });
  });

  it('preserves recurring decimals when splitting UR rates across three items', () => {
    const { gachaId, catalogState, rarityState, rarityFractionDigits } = buildTestStates({
      emitRate: 0.0001,
      itemCount: 3
    });

    const { poolsByGachaId } = buildGachaPools({
      catalogState,
      rarityState,
      rarityFractionDigits
    });

    const pool = poolsByGachaId.get(gachaId);
    expect(pool?.items).toHaveLength(3);
    pool?.items.forEach((item) => {
      expect(item.itemRate).toBeCloseTo(0.0000333333333333, 15);
      expect(item.itemRateDisplay).toBe('0.0033...%');
    });
  });

  it('supports extremely small UR rates across twenty items', () => {
    const { gachaId, catalogState, rarityState, rarityFractionDigits } = buildTestStates({
      emitRate: 0.0000025,
      itemCount: 20
    });

    const { poolsByGachaId } = buildGachaPools({
      catalogState,
      rarityState,
      rarityFractionDigits
    });

    const pool = poolsByGachaId.get(gachaId);
    expect(pool?.items).toHaveLength(20);
    pool?.items.forEach((item) => {
      expect(item.itemRate).toBeCloseTo(0.000000125, 18);
      expect(item.itemRateDisplay).toBe('0.0000125%');
    });
  });

  it('distributes N rarity rates across fifteen items without rounding', () => {
    const { gachaId, catalogState, rarityState, rarityFractionDigits } = buildTestStates({
      emitRate: 0.74235,
      itemCount: 15,
      label: 'N'
    });

    const { poolsByGachaId } = buildGachaPools({
      catalogState,
      rarityState,
      rarityFractionDigits
    });

    const pool = poolsByGachaId.get(gachaId);
    expect(pool?.items).toHaveLength(15);
    pool?.items.forEach((item) => {
      expect(item.itemRate).toBeCloseTo(0.04949, 12);
      expect(item.itemRateDisplay).toBe('4.949%');
    });
  });

  it('avoids rounding recurring decimals for thirteen-way N rarity splits', () => {
    const { gachaId, catalogState, rarityState, rarityFractionDigits } = buildTestStates({
      emitRate: 0.74235,
      itemCount: 13,
      label: 'N'
    });

    const { poolsByGachaId } = buildGachaPools({
      catalogState,
      rarityState,
      rarityFractionDigits
    });

    const pool = poolsByGachaId.get(gachaId);
    expect(pool?.items).toHaveLength(13);
    const expectedRate = 0.74235 / 13;
    pool?.items.forEach((item) => {
      expect(item.itemRate).toBeCloseTo(expectedRate, 12);
      expect(item.itemRateDisplay).toBe('5.7103846154%');
    });
  });
});
