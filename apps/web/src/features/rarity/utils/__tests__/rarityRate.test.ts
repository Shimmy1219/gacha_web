import { describe, expect, it } from 'vitest';

import { clampRate } from '../../../../logic/rarityTable';
import { formatRarityRate } from '../rarityRate';

describe('formatRarityRate', () => {
  it('appends an ellipsis for recurring thirds', () => {
    const rate = clampRate(0.0001 / 3);
    expect(formatRarityRate(rate)).toBe('0.0033...');
  });

  it('returns a trimmed decimal when the recurring cycle fits within precision', () => {
    const rate = clampRate(0.74235 / 13);
    expect(formatRarityRate(rate)).toBe('5.7103846154');
  });

  it('returns a trimmed decimal when the value terminates', () => {
    const rate = clampRate(0.04949);
    expect(formatRarityRate(rate)).toBe('4.949');
  });

  it('keeps tiny rates without rounding to zero up to 10^-10%', () => {
    const rate = clampRate(0.000005);
    expect(formatRarityRate(rate)).toBe('0.0005');
  });

  it('supports minimum display precision of 10^-10%', () => {
    const rate = clampRate(1e-12);
    expect(formatRarityRate(rate)).toBe('0.0000000001');
  });
});
