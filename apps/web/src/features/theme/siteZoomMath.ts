export const SITE_ZOOM_CHANGE_EVENT = 'site-zoom:change';

const FALLBACK_ZOOM_SCALE = 1;
const MIN_ZOOM_SCALE = 0.01;
const SITE_ZOOM_SCALE_CSS_VARIABLE = '--site-zoom-scale';

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
