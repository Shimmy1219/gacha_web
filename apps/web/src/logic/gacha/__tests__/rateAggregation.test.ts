import { describe, expect, it } from 'vitest';

import { formatItemRateWithPrecision } from '../rateAggregation';

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
