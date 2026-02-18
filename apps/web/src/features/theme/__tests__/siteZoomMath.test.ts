import { describe, expect, it } from 'vitest';

import {
  normalizeSiteZoomPercent,
  normalizeSiteZoomScale,
  readSiteZoomScaleFromComputedStyle,
  resolveEffectiveViewportWidth,
  resolveUnscaledPixelValue
} from '../siteZoomMath';

describe('siteZoomMath', () => {
  it('normalizes invalid zoom scale values to 1', () => {
    expect(normalizeSiteZoomScale(undefined)).toBe(1);
    expect(normalizeSiteZoomScale('abc')).toBe(1);
    expect(normalizeSiteZoomScale(0)).toBe(1);
    expect(normalizeSiteZoomScale(-1)).toBe(1);
  });

  it('normalizes site zoom percent as percent (not scale)', () => {
    expect(normalizeSiteZoomPercent('75')).toBe(75);
    expect(normalizeSiteZoomPercent(49)).toBe(50);
    expect(normalizeSiteZoomPercent(101)).toBe(100);
  });

  it('reads zoom scale from computed style text', () => {
    const style = {
      getPropertyValue: (name: string) => {
        if (name === '--site-zoom-scale') {
          return ' 0.8 ';
        }
        return '';
      }
    };

    expect(readSiteZoomScaleFromComputedStyle(style)).toBeCloseTo(0.8, 6);
  });

  it('resolves effective viewport width by dividing layout width with zoom scale', () => {
    expect(resolveEffectiveViewportWidth(1180, 1)).toBeCloseTo(1180, 6);
    expect(resolveEffectiveViewportWidth(1180, 0.85)).toBeCloseTo(1388.235294, 6);
  });

  it('converts measured pixels into unscaled pixels', () => {
    expect(resolveUnscaledPixelValue(64, 0.8)).toBeCloseTo(80, 6);
    expect(resolveUnscaledPixelValue(96, 0.8)).toBeCloseTo(120, 6);
  });
});
