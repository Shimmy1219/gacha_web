import { describe, expect, it } from 'vitest';

import {
  calculateResizeHandleOffsets,
  clampColumnWidthByPair,
  columnWidthsToFrUnits,
  remToVisualPixels
} from './desktopGridResizeMath';

describe('desktopGridResizeMath', () => {
  it('clamps pair resize so both columns keep minimum widths', () => {
    const result = clampColumnWidthByPair([280, 360, 320], [240, 300, 240], 0, -120);

    expect(result[0]).toBe(240);
    expect(result[1]).toBe(400);
    expect(result[2]).toBe(320);
  });

  it('normalizes widths into fr units', () => {
    const frUnits = columnWidthsToFrUnits([400, 500, 300]);

    expect(frUnits[0]).toBeCloseTo(1);
    expect(frUnits[1]).toBeCloseTo(1.25);
    expect(frUnits[2]).toBeCloseTo(0.75);
  });

  it('calculates handle offsets with column gaps', () => {
    const offsets = calculateResizeHandleOffsets([300, 350, 250], 16);

    expect(offsets).toEqual([308, 674]);
  });

  it('converts rem minimum widths into visual pixels with zoom scale', () => {
    expect(remToVisualPixels(24, 16, 1)).toBe(384);
    expect(remToVisualPixels(24, 16, 0.5)).toBe(192);
  });
});
