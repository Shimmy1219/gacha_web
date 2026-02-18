import {
  DEFAULT_SITE_ZOOM_PERCENT,
  SITE_ZOOM_PERCENT_MAX,
  SITE_ZOOM_PERCENT_MIN
} from '@domain/stores/uiPreferencesStore';

export const SITE_ZOOM_CHANGE_EVENT = 'site-zoom:change';

const FALLBACK_ZOOM_SCALE = 1;
const MIN_ZOOM_SCALE = 0.01;
const SITE_ZOOM_SCALE_CSS_VARIABLE = '--site-zoom-scale';

export function normalizeSiteZoomPercent(raw: unknown): number {
  const numeric = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(numeric) || Number.isNaN(numeric)) {
    return DEFAULT_SITE_ZOOM_PERCENT;
  }

  const rounded = Math.round(numeric);
  if (!Number.isFinite(rounded) || Number.isNaN(rounded)) {
    return DEFAULT_SITE_ZOOM_PERCENT;
  }

  return Math.min(Math.max(rounded, SITE_ZOOM_PERCENT_MIN), SITE_ZOOM_PERCENT_MAX);
}

export function normalizeSiteZoomScale(raw: unknown): number {
  const numeric = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(numeric) || Number.isNaN(numeric)) {
    return FALLBACK_ZOOM_SCALE;
  }

  if (numeric < MIN_ZOOM_SCALE) {
    return FALLBACK_ZOOM_SCALE;
  }

  return numeric;
}

export function readSiteZoomScaleFromComputedStyle(style: Pick<CSSStyleDeclaration, 'getPropertyValue'>): number {
  const raw = style.getPropertyValue(SITE_ZOOM_SCALE_CSS_VARIABLE).trim();
  return normalizeSiteZoomScale(raw);
}

export function resolveEffectiveViewportWidth(layoutViewportWidth: number, zoomScale: number): number {
  const safeWidth = Number.isFinite(layoutViewportWidth) && !Number.isNaN(layoutViewportWidth)
    ? Math.max(layoutViewportWidth, 0)
    : 0;
  return safeWidth / normalizeSiteZoomScale(zoomScale);
}

export function resolveUnscaledPixelValue(measuredPixels: number, zoomScale: number): number {
  const safePixels = Number.isFinite(measuredPixels) && !Number.isNaN(measuredPixels)
    ? Math.max(measuredPixels, 0)
    : 0;
  return safePixels / normalizeSiteZoomScale(zoomScale);
}
