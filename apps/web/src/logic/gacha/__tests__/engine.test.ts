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
    itemRateDisplay: '40%'
  };
  const common2: GachaItemDefinition = {
    itemId: 'common-2',
    name: 'Common Two',
    rarityId: 'common',
    rarityLabel: 'Common',
    rarityColor: '#cccccc',
    rarityEmitRate: 0.8,
    itemRate: 0.4,
    itemRateDisplay: '40%'
  };
  const rare: GachaItemDefinition = {
    itemId: 'rare-1',
    name: 'Rare One',
    rarityId: 'rare',
    rarityLabel: 'Rare',
    rarityColor: '#ffaa00',
    rarityEmitRate: 0.2,
    itemRate: 0.2,
    itemRateDisplay: '20%'
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
          items: [rare]
        }
      ]
    ])
  };

  test('enforces guarantees and aggregates results', () => {
    const settings: PtSettingV3 = {
      perPull: { price: 10, pulls: 1 },
      guarantees: [{ id: 'g1', rarityId: 'rare', threshold: 2 }]
    };

    const rolls = [0.1, 0.2, 0.95];
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
    expect(result.pointsSpent).toBe(30);
    expect(result.totalPulls).toBe(3);
    expect(result.plan.randomPulls).toBe(3);

    const rareItem = result.items.find((item) => item.itemId === 'rare-1');
    expect(rareItem?.count).toBe(2);
    expect(rareItem?.guaranteedCount).toBe(1);
  });
});
