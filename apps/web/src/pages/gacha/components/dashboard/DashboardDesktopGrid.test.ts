import { describe, expect, it } from 'vitest';

import { DESKTOP_GRID_MAIN_HEIGHT_CSS } from './DashboardDesktopGrid';

describe('DashboardDesktopGrid', () => {
  it('uses viewport-derived css expression for main height', () => {
    expect(DESKTOP_GRID_MAIN_HEIGHT_CSS).toContain('100vh * var(--site-zoom-inverse-scale, 1)');
    expect(DESKTOP_GRID_MAIN_HEIGHT_CSS).toContain('var(--app-header-height, 0px)');
    expect(DESKTOP_GRID_MAIN_HEIGHT_CSS).toContain('var(--app-main-vertical-padding, 0px)');
  });
});
