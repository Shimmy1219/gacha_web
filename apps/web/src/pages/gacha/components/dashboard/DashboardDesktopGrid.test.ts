import { describe, expect, it } from 'vitest';

import {
  clampWidthsToAvailable,
  distributeWidths,
  getColumnConfig,
  getBreakpoint
} from './DashboardDesktopGrid';

describe('DashboardDesktopGrid width helpers', () => {
  it('scales minimum widths proportionally when available width is smaller', () => {
    const minWidths = [260, 380, 320, 240];
    const weights = [1, 1.4, 1.05, 0.95];
    const available = 900; // narrower than the sum of min widths

    const result = distributeWidths(minWidths, weights, available);
    const total = result.reduce((sum, value) => sum + value, 0);
    const minTotal = minWidths.reduce((sum, value) => sum + value, 0);
    const expectedScale = available / minTotal;

    expect(total).toBeLessThanOrEqual(available + 1e-6);
    result.forEach((value, index) => {
      expect(value).toBeCloseTo(minWidths[index] * expectedScale, 5);
    });
  });

  it('clamps arbitrary widths so that they do not exceed the available space', () => {
    const widths = [320, 400, 520];
    const available = 1000;

    const clamped = clampWidthsToAvailable(widths, available);
    const total = clamped.reduce((sum, value) => sum + value, 0);
    const originalTotal = widths.reduce((sum, value) => sum + value, 0);
    const expectedScale = available / originalTotal;

    expect(total).toBeLessThanOrEqual(available + 1e-6);
    clamped.forEach((value, index) => {
      expect(value).toBeCloseTo(widths[index] * expectedScale, 5);
    });
  });

  it('selects the four column configuration for container widths around 1100px', () => {
    const breakpoint = getBreakpoint(1100);
    expect(breakpoint).toBe('xl');
    const config = getColumnConfig(breakpoint);
    expect(config?.minWidths).toHaveLength(4);
  });

  it('falls back to three columns when the container width is narrower than 4 columns allow', () => {
    const breakpoint = getBreakpoint(980);
    expect(breakpoint).toBe('lg');
    const config = getColumnConfig(breakpoint);
    expect(config?.minWidths).toHaveLength(3);
  });
});
