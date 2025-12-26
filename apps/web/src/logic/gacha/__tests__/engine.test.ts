import { describe, expect, test } from 'vitest';

import { executeGacha } from '..';
import type { GachaItemDefinition, GachaPoolDefinition } from '..';
import type { PtSettingV3 } from '@domain/app-persistence';

describe('executeGacha', () => {
  const common1: GachaItemDefinition = {
    itemId: 'common-1',
    name: 'Common One',
    rarityId: 'common',
    rarityLabel: 'Common',
    rarityColor: '#cccccc',
    rarityEmitRate: 0.8,
    itemRate: 0.4,
    itemRateDisplay: '40%',
    pickupTarget: false,
    drawWeight: 1
  };
  const common2: GachaItemDefinition = {
    itemId: 'common-2',
    name: 'Common Two',
    rarityId: 'common',
    rarityLabel: 'Common',
    rarityColor: '#cccccc',
    rarityEmitRate: 0.8,
    itemRate: 0.4,
    itemRateDisplay: '40%',
    pickupTarget: false,
    drawWeight: 1
  };
  const rare: GachaItemDefinition = {
    itemId: 'rare-1',
    name: 'Rare One',
    rarityId: 'rare',
    rarityLabel: 'Rare',
    rarityColor: '#ffaa00',
    rarityEmitRate: 0.2,
    itemRate: 0.2,
    itemRateDisplay: '20%',
    pickupTarget: false,
    drawWeight: 1
  };

  const pool: GachaPoolDefinition = {
    gachaId: 'sample',
    items: [common1, common2, rare],
    rarityGroups: new Map([
      [
        'common',
        {
          rarityId: 'common',
          label: 'Common',
          color: '#cccccc',
          emitRate: 0.8,
          itemCount: 2,
          totalWeight: 2,
          items: [common1, common2]
        }
      ],
      [
        'rare',
        {
          rarityId: 'rare',
          label: 'Rare',
          color: '#ffaa00',
          emitRate: 0.2,
          itemCount: 1,
          totalWeight: 1,
          items: [rare]
        }
      ]
    ])
  };

  test('applies pre-draw guarantees and aggregates results', () => {
    const settings: PtSettingV3 = {
      perPull: { price: 10, pulls: 1 },
      guarantees: [
        {
          id: 'g1',
          rarityId: 'rare',
          threshold: 2,
          quantity: 1,
          target: { type: 'rarity' }
        }
      ]
    };

    const rolls = [0.3, 0.1, 0.6];
    const rng = () => {
      const next = rolls.shift();
      return next ?? 0.5;
    };

    const result = executeGacha({
      gachaId: 'sample',
      pool,
      settings,
      points: 30,
      rng
    });

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.pointsSpent).toBe(30);
    expect(result.totalPulls).toBe(3);
    expect(result.plan.randomPulls).toBe(3);

    const rareItem = result.items.find((item) => item.itemId === 'rare-1');
    expect(rareItem?.count).toBe(1);
    expect(rareItem?.guaranteedCount).toBe(1);

    const commonItemCounts = result.items
      .filter((item) => item.rarityId === 'common')
      .map((item) => item.count)
      .sort();
    expect(commonItemCounts).toEqual([1, 1]);
  });

  test('guarantees specific items when available', () => {
    const rareTwo: GachaItemDefinition = {
      itemId: 'rare-2',
      name: 'Rare Two',
      rarityId: 'rare',
      rarityLabel: 'Rare',
      rarityColor: '#ffaa00',
      rarityEmitRate: 0.2,
      itemRate: 0,
      itemRateDisplay: '0%',
      pickupTarget: false,
      drawWeight: 1
    };

    const poolWithTwoRares: GachaPoolDefinition = {
      ...pool,
      items: [...pool.items, rareTwo],
      rarityGroups: new Map([
        ...pool.rarityGroups.entries(),
        [
          'rare',
          {
            rarityId: 'rare',
            label: 'Rare',
            color: '#ffaa00',
            emitRate: 0.2,
            itemCount: 2,
            totalWeight: 2,
            items: [rare, rareTwo]
          }
        ]
      ])
    };

    const settings: PtSettingV3 = {
      perPull: { price: 10, pulls: 1 },
      guarantees: [
        {
          id: 'g-item',
          rarityId: 'rare',
          threshold: 1,
          quantity: 2,
          target: { type: 'item', itemId: 'rare-2' }
        }
      ]
    };

    const result = executeGacha({ gachaId: 'sample', pool: poolWithTwoRares, settings, points: 20 });

    const targeted = result.items.find((item) => item.itemId === 'rare-2');
    expect(targeted?.count).toBe(2);
    expect(targeted?.guaranteedCount).toBe(2);
    expect(result.totalPulls).toBe(2);
    expect(result.plan.randomPulls).toBe(2);
  });

  test('complete purchases emit full sets for each execution', () => {
    const settings: PtSettingV3 = {
      complete: { price: 100 }
    };

    const result = executeGacha({ gachaId: 'sample', pool, settings, points: 300 });

    expect(result.plan.completeExecutions).toBe(3);
    expect(result.plan.completePulls).toBe(pool.items.length * 3);
    expect(result.plan.randomPulls).toBe(0);
    expect(result.totalPulls).toBe(result.plan.totalPulls);
    expect(result.pointsSpent).toBe(300);
    expect(result.pointsRemainder).toBe(0);

    pool.items.forEach((item) => {
      const aggregated = result.items.find((entry) => entry.itemId === item.itemId);
      expect(aggregated).toBeDefined();
      expect(aggregated?.count ?? 0).toBe(3);
    });
  });

  test('complete purchases leave remaining points for random pulls', () => {
    const settings: PtSettingV3 = {
      perPull: { price: 10, pulls: 1 },
      complete: { price: 100 }
    };

    const result = executeGacha({ gachaId: 'sample', pool, settings, points: 120 });

    expect(result.plan.completeExecutions).toBe(1);
    expect(result.plan.completePulls).toBe(pool.items.length);
    expect(result.plan.randomPulls).toBe(2);
    expect(result.totalPulls).toBe(5);
    expect(result.pointsSpent).toBe(120);
    expect(result.pointsRemainder).toBe(0);

    pool.items.forEach((item) => {
      const aggregated = result.items.find((entry) => entry.itemId === item.itemId);
      expect(aggregated).toBeDefined();
      expect(aggregated?.count ?? 0).toBeGreaterThanOrEqual(1);
    });

    const totalCount = result.items.reduce((sum, item) => sum + item.count, 0);
    expect(totalCount).toBe(5);
  });

  test('supports legacy complate complete settings when executing gacha', () => {
    const settings = {
      complate: { price: 120 }
    } as PtSettingV3 & { complate: PtSettingV3['complete'] };

    const result = executeGacha({ gachaId: 'sample', pool, settings, points: 240 });

    expect(result.errors).toHaveLength(0);
    expect(result.plan.completeExecutions).toBe(2);
    expect(result.plan.completePulls).toBe(pool.items.length * 2);
  });
});
