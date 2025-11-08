import { describe, expect, test } from 'vitest';

import { calculateDrawPlan } from '..';
import type { PtSettingV3 } from '@domain/app-persistence';

describe('calculateDrawPlan', () => {
  test('applies bundles before single pulls', () => {
    const settings: PtSettingV3 = {
      perPull: { price: 10, pulls: 1 },
      bundles: [{ id: 'bundle-11', price: 100, pulls: 11 }]
    };

    const plan = calculateDrawPlan({ points: 250, settings, totalItemTypes: 5 });

    expect(plan.errors).toHaveLength(0);
    expect(plan.pointsUsed).toBe(250);
    expect(plan.pointsRemainder).toBe(0);
    expect(plan.bundleApplications).toEqual([
      {
        bundleId: 'bundle-11',
        bundlePrice: 100,
        bundlePulls: 11,
        times: 2,
        totalPrice: 200,
        totalPulls: 22
      }
    ]);
    expect(plan.perPullPurchases).toEqual({
      price: 10,
      pulls: 1,
      times: 5,
      totalPrice: 50,
      totalPulls: 5
    });
    expect(plan.randomPulls).toBe(27);
    expect(plan.completeExecutions).toBe(0);
  });

  test('handles complete purchases alongside single pulls', () => {
    const settings: PtSettingV3 = {
      perPull: { price: 10, pulls: 1 },
      complete: { price: 1000 }
    };

    const plan = calculateDrawPlan({ points: 1200, settings, totalItemTypes: 3 });

    expect(plan.errors).toHaveLength(0);
    expect(plan.completeExecutions).toBe(1);
    expect(plan.completePulls).toBe(3);
    expect(plan.randomPulls).toBe(20);
    expect(plan.pointsUsed).toBe(1200);
    expect(plan.pointsRemainder).toBe(0);
  });

  test('frontload mode only guarantees the first completion', () => {
    const settings: PtSettingV3 = {
      perPull: { price: 10, pulls: 1 },
      complete: { price: 100, mode: 'frontload' }
    };

    const plan = calculateDrawPlan({ points: 250, settings, totalItemTypes: 5 });

    expect(plan.errors).toHaveLength(0);
    expect(plan.completeExecutions).toBe(2);
    expect(plan.completePulls).toBe(5);
    expect(plan.randomPulls).toBe(10);
    expect(plan.pointsUsed).toBe(250);
    expect(plan.pointsRemainder).toBe(0);
    expect(plan.normalizedSettings.complete?.mode).toBe('frontload');
  });

  test('frontload mode converts additional completions into random pulls', () => {
    const settings: PtSettingV3 = {
      complete: { price: 80, mode: 'frontload' }
    };

    const plan = calculateDrawPlan({ points: 240, settings, totalItemTypes: 4 });

    expect(plan.errors).toHaveLength(0);
    expect(plan.completeExecutions).toBe(3);
    expect(plan.completePulls).toBe(4);
    expect(plan.randomPulls).toBe(8);
    expect(plan.totalPulls).toBe(12);
    expect(plan.pointsUsed).toBe(240);
    expect(plan.pointsRemainder).toBe(0);
  });

  test('reports errors when no purchasable settings are provided', () => {
    const plan = calculateDrawPlan({ points: 50, settings: {}, totalItemTypes: 4 });

    expect(plan.errors).toContain('購入設定が不足しているため、ポイントを消費できません。');
  });

  test('emits warnings when guarantees are incomplete', () => {
    const settings: PtSettingV3 = {
      perPull: { price: 10, pulls: 1 },
      guarantees: [{ id: 'g1', rarityId: 'rare', threshold: 0 }]
    };

    const plan = calculateDrawPlan({ points: 10, settings, totalItemTypes: 2 });

    expect(plan.warnings.some((warning) => warning.includes('保証設定'))).toBe(true);
  });
});
