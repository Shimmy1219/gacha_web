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
  label = 'UR',
  pickupTargets = []
}: {
  emitRate: number;
  itemCount: number;
  rarityId?: string;
  gachaId?: string;
  label?: string;
  pickupTargets?: string[];
}) {
  const itemIds = Array.from({ length: itemCount }, (_, index) => `item-${index + 1}`);
  const pickupSet = new Set(pickupTargets);

  const catalogState = {
    version: 4,
    updatedAt: baseTimestamp,
    byGacha: {
      [gachaId]: {
        order: itemIds,
        items: Object.fromEntries(
          itemIds.map((itemId) => [itemId, { itemId, name: itemId, rarityId, pickupTarget: pickupSet.has(itemId) }])
        )
      }
    }
  } satisfies import('@domain/app-persistence').GachaCatalogStateV4;

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

function buildMultiRarityStates({
  gachaId = 'gacha-multi',
  rarities,
  itemsByRarity
}: {
  gachaId?: string;
  rarities: Array<{ id: string; label: string; emitRate: number; sortOrder?: number }>;
  itemsByRarity: Record<string, number>;
}) {
  const order: string[] = [];
  const items: Record<string, import('@domain/app-persistence').GachaCatalogItemV4> = {};

  Object.entries(itemsByRarity).forEach(([rarityId, count]) => {
    for (let index = 0; index < count; index += 1) {
      const itemId = `${rarityId}-item-${index + 1}`;
      order.push(itemId);
      items[itemId] = { itemId, name: itemId, rarityId };
    }
  });

  const catalogState = {
    version: 4,
    updatedAt: baseTimestamp,
    byGacha: {
      [gachaId]: {
        order,
        items
      }
    }
  } satisfies import('@domain/app-persistence').GachaCatalogStateV4;

  const rarityState = {
    version: 3,
    updatedAt: baseTimestamp,
    byGacha: {
      [gachaId]: rarities.map((rarity) => rarity.id)
    },
    entities: Object.fromEntries(
      rarities.map((rarity) => [
        rarity.id,
        {
          id: rarity.id,
          gachaId,
          label: rarity.label,
          emitRate: rarity.emitRate,
          ...(typeof rarity.sortOrder === 'number' ? { sortOrder: rarity.sortOrder } : {})
        }
      ])
    )
  } satisfies import('@domain/app-persistence').GachaRarityStateV3;

  const rarityFractionDigits = inferRarityFractionDigits(rarityState);

  return {
    gachaId,
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
      expect(item.drawWeight).toBe(1);
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

  it('allocates additional weight to pickup items within the same rarity', () => {
    const { gachaId, catalogState, rarityState, rarityFractionDigits } = buildTestStates({
      emitRate: 0.15,
      itemCount: 3,
      label: 'R',
      pickupTargets: ['item-2']
    });

    const { poolsByGachaId } = buildGachaPools({
      catalogState,
      rarityState,
      rarityFractionDigits
    });

    const pool = poolsByGachaId.get(gachaId);
    expect(pool?.items).toHaveLength(3);

    expect(pool?.items[0].itemRate).toBeCloseTo(0.0375, 12);
    expect(pool?.items[1].itemRate).toBeCloseTo(0.075, 12);
    expect(pool?.items[2].itemRate).toBeCloseTo(0.0375, 12);

    expect(pool?.items[0].itemRateDisplay).toBe('3.75%');
    expect(pool?.items[1].itemRateDisplay).toBe('7.5%');
    expect(pool?.items[2].itemRateDisplay).toBe('3.75%');
    expect(pool?.items.map((item) => item.drawWeight)).toEqual([1, 2, 1]);
  });

  it('keeps non-pickup items even when multiple pickups share the same rarity', () => {
    const { gachaId, catalogState, rarityState, rarityFractionDigits } = buildTestStates({
      emitRate: 0.15,
      itemCount: 4,
      label: 'R',
      pickupTargets: ['item-2', 'item-3']
    });

    const { poolsByGachaId } = buildGachaPools({
      catalogState,
      rarityState,
      rarityFractionDigits
    });

    const pool = poolsByGachaId.get(gachaId);
    expect(pool?.items).toHaveLength(4);

    const expectedRates = [0.025, 0.05, 0.05, 0.025];
    pool?.items.forEach((item, index) => {
      expect(item.itemRate).toBeCloseTo(expectedRates[index], 12);
    });
    expect(pool?.items.map((item) => item.itemRateDisplay)).toEqual([
      '2.5%',
      '5%',
      '5%',
      '2.5%'
    ]);
    expect(pool?.items.map((item) => item.drawWeight)).toEqual([1, 2, 2, 1]);
    const group = pool?.rarityGroups.get('rarity-1');
    expect(group?.totalWeight).toBe(6);
    expect(group?.itemCount).toBe(4);
  });

  it('excludes out-of-stock items from pools', () => {
    const gachaId = 'gacha-stock';
    const rarityId = 'rarity-stock';
    const catalogState = {
      version: 4,
      updatedAt: baseTimestamp,
      byGacha: {
        [gachaId]: {
          order: ['item-1', 'item-2'],
          items: {
            'item-1': { itemId: 'item-1', name: 'Item One', rarityId, stockCount: 1 },
            'item-2': { itemId: 'item-2', name: 'Item Two', rarityId }
          }
        }
      }
    } satisfies import('@domain/app-persistence').GachaCatalogStateV4;

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
          label: 'R',
          emitRate: 0.2
        }
      }
    } satisfies import('@domain/app-persistence').GachaRarityStateV3;

    const { poolsByGachaId } = buildGachaPools({
      catalogState,
      rarityState,
      rarityFractionDigits: inferRarityFractionDigits(rarityState),
      inventoryCountsByItemId: new Map([['item-1', 1]])
    });

    const pool = poolsByGachaId.get(gachaId);
    expect(pool?.items.map((item) => item.itemId)).toEqual(['item-2']);
  });

  it('redistributes missing rarity rates to the auto-adjusted rarity when items exist', () => {
    const { gachaId, catalogState, rarityState, rarityFractionDigits } = buildMultiRarityStates({
      rarities: [
        { id: 'rare-a', label: 'A', emitRate: 0.8 },
        { id: 'rare-b', label: 'B', emitRate: 0.2 }
      ],
      itemsByRarity: {
        'rare-a': 2
      }
    });

    const { poolsByGachaId } = buildGachaPools({
      catalogState,
      rarityState,
      rarityFractionDigits
    });

    const pool = poolsByGachaId.get(gachaId);
    expect(pool?.items).toHaveLength(2);
    pool?.items.forEach((item) => {
      expect(item.rarityId).toBe('rare-a');
      expect(item.rarityEmitRate).toBeCloseTo(1, 12);
      expect(item.itemRate).toBeCloseTo(0.5, 12);
      expect(item.itemRateDisplay).toBe('50%');
    });
  });

  it('falls back to the next highest emit rate rarity when the auto-adjusted rarity has no items', () => {
    const { gachaId, catalogState, rarityState, rarityFractionDigits } = buildMultiRarityStates({
      rarities: [
        { id: 'rare-a', label: 'A', emitRate: 0.5 },
        { id: 'rare-b', label: 'B', emitRate: 0.3 },
        { id: 'rare-c', label: 'C', emitRate: 0.2 }
      ],
      itemsByRarity: {
        'rare-b': 1,
        'rare-c': 1
      }
    });

    const { poolsByGachaId } = buildGachaPools({
      catalogState,
      rarityState,
      rarityFractionDigits
    });

    const pool = poolsByGachaId.get(gachaId);
    const ids = pool?.items.map((poolItem) => poolItem.rarityId) ?? [];
    expect(ids).toEqual(['rare-b', 'rare-c']);
    const rates = pool?.items.map((poolItem) => poolItem.itemRate) ?? [];
    expect(rates[0]).toBeCloseTo(0.8, 12);
    expect(rates[1]).toBeCloseTo(0.2, 12);
    expect(pool?.items.map((poolItem) => poolItem.itemRateDisplay)).toEqual(['80%', '20%']);
  });
});
