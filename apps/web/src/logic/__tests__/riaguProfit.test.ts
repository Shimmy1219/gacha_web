import { describe, expect, it } from 'vitest';

import {
  calculateInverseRateWeightedBreakEven,
  calculateExpectedCostPerDraw,
  calculateProfitAmount,
  calculateRevenuePerDraw,
  evaluateProfitMargin
} from '../riaguProfit';

describe('riaguProfit', () => {
  it('calculates revenue per draw only when values are positive', () => {
    expect(calculateRevenuePerDraw(100, 0.15)).toBeCloseTo(15, 12);
    expect(calculateRevenuePerDraw(0, 0.15)).toBeNull();
    expect(calculateRevenuePerDraw(100, 0)).toBeNull();
  });

  it('keeps tiny expected costs without rounding to zero', () => {
    const value = calculateExpectedCostPerDraw({ itemRate: 0.000005, unitCost: 2000 });
    expect(value).toBeCloseTo(0.01, 12);
  });

  it('marks out-of-stock evaluations as unavailable', () => {
    const evaluation = evaluateProfitMargin({
      revenueAmount: 15,
      costAmount: 5,
      isOutOfStock: true
    });
    expect(evaluation).toEqual({
      status: 'unavailable',
      percent: null,
      isOutOfStock: true
    });
  });

  it('evaluates margin with modal-compatible rounding and -0 handling', () => {
    expect(
      evaluateProfitMargin({
        revenueAmount: 15,
        costAmount: 5
      })
    ).toEqual({
      status: 'profit',
      percent: 66.7,
      isOutOfStock: false
    });

    expect(
      evaluateProfitMargin({
        revenueAmount: 10,
        costAmount: 10
      })
    ).toEqual({
      status: 'even',
      percent: 0,
      isOutOfStock: false
    });
  });

  it('calculates profit amount when both values are available', () => {
    expect(calculateProfitAmount(12, 7)).toBe(5);
    expect(calculateProfitAmount(null, 7)).toBeNull();
  });

  it('calculates inverse-rate weighted break-even unit cost', () => {
    const result = calculateInverseRateWeightedBreakEven({
      revenuePerDraw: 1.5,
      selectedItemRate: 0.005,
      allRiaguItemRates: [0.005, 0.005, 0.01]
    });
    expect(result.weightShare).toBeCloseTo(0.4, 12);
    expect(result.breakEvenUnitCost).toBeCloseTo(120, 12);
  });
});
