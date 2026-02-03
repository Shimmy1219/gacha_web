import { describe, expect, it } from 'vitest';

import { simulateRarityProbabilities } from '../raritySimulation';

describe('simulateRarityProbabilities', () => {
  it('calculates at least one probability over N draws when target is one', () => {
    const [result] = simulateRarityProbabilities({
      rarities: [{ id: 'ur', label: 'UR', color: '#ffffff', emitRate: 0.01 }],
      drawCount: 10,
      targetCount: 1
    });

    expect(result.atLeastCountRate).toBeCloseTo(1 - Math.pow(0.99, 10), 12);
  });

  it('calculates at least M count probability with binomial distribution', () => {
    const [result] = simulateRarityProbabilities({
      rarities: [{ id: 'sr', label: 'SR', color: '#00ff00', emitRate: 0.2 }],
      drawCount: 10,
      targetCount: 2
    });

    const p0 = Math.pow(0.8, 10);
    const p1 = 10 * 0.2 * Math.pow(0.8, 9);
    expect(result.atLeastCountRate).toBeCloseTo(1 - (p0 + p1), 12);
  });

  it('returns certainty when target count is zero', () => {
    const [result] = simulateRarityProbabilities({
      rarities: [{ id: 'n', label: 'N', color: '#cccccc', emitRate: 0.7 }],
      drawCount: 0,
      targetCount: 0
    });

    expect(result.atLeastCountRate).toBe(1);
  });

  it('normalizes out-of-range rates', () => {
    const [tooLow, tooHigh] = simulateRarityProbabilities({
      rarities: [
        { id: 'low', label: 'LOW', color: '#111111', emitRate: -1 },
        { id: 'high', label: 'HIGH', color: '#222222', emitRate: 2 }
      ],
      drawCount: 5,
      targetCount: 5
    });

    expect(tooLow.emitRate).toBe(0);
    expect(tooLow.atLeastCountRate).toBe(0);
    expect(tooHigh.emitRate).toBe(1);
    expect(tooHigh.atLeastCountRate).toBe(1);
  });
});
