import {
  CUSTOM_BASE_TONE_VALUES,
  DEFAULT_CUSTOM_BASE_TONE,
  DEFAULT_SITE_ACCENT,
  SITE_THEME_VALUES,
  detectPreferredSiteTheme,
  type CustomBaseTone,
  type SiteTheme
} from '@domain/stores/uiPreferencesStore';
import { applyDocumentTheme, resolveAccentHex } from '@features/theme/applyDocumentTheme';

const UI_PREFERENCES_STORAGE_KEY = 'gacha:ui-preferences:v3';
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const LEGACY_TWILIGHT_ACCENT = '#8b5cf6';

const SITE_THEME_SET = new Set<string>(SITE_THEME_VALUES);
const CUSTOM_BASE_TONE_SET = new Set<string>(CUSTOM_BASE_TONE_VALUES);

type MaybeStoredTheme = {
  theme: SiteTheme | null;
  customAccentColor: string | null;
  customBaseTone: CustomBaseTone | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeSiteTheme(value: unknown): SiteTheme | null {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'twilight') {
      return 'custom';
    }
    if (SITE_THEME_SET.has(lower)) {
      return lower as SiteTheme;
    }
  }
  return null;
}

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  if (lower.length === 4) {
    const r = lower[1];
    const g = lower[2];
    const b = lower[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  return lower;
}

function normalizeCustomBaseTone(value: unknown): CustomBaseTone | null {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (CUSTOM_BASE_TONE_SET.has(lower)) {
      return lower as CustomBaseTone;
    }
  }
  return null;
}

function readStoredTheme(): MaybeStoredTheme {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    throw new Error('Local storage is not available.');
  }

  const raw = window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);
  if (!raw) {
    throw new Error('Stored UI preferences were not found.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error('Failed to parse stored UI preferences JSON.');
  }

  if (!isRecord(parsed)) {
    throw new Error('Stored UI preferences had an unexpected shape.');
  }

  const appearance = parsed.appearance;
  if (!isRecord(appearance)) {
    return { theme: null, customAccentColor: null, customBaseTone: null };
  }

  const theme = normalizeSiteTheme(appearance.siteTheme);
  const accent =
    normalizeHexColor(appearance.customAccentColor) ??
    (typeof appearance.siteTheme === 'string' && appearance.siteTheme.toLowerCase() === 'twilight'
      ? normalizeHexColor(LEGACY_TWILIGHT_ACCENT)
      : null);
  const customBaseTone = normalizeCustomBaseTone(appearance.customBaseTone);

  return {
    theme,
    customAccentColor: accent,
    customBaseTone
  };
}

(function preloadTheme() {
  if (typeof window === 'undefined') {
    return;
  }

  let theme = detectPreferredSiteTheme();
  let customAccentColor = DEFAULT_SITE_ACCENT;
  let customBaseTone = DEFAULT_CUSTOM_BASE_TONE;

  try {
    const stored = readStoredTheme();
    if (stored.theme) {
      theme = stored.theme;
    }
    if (stored.customAccentColor) {
      customAccentColor = stored.customAccentColor;
    }
    if (stored.customBaseTone) {
      customBaseTone = stored.customBaseTone;
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[preloadTheme] Failed to apply stored theme:', error);
    }
  }

  applyDocumentTheme(theme, resolveAccentHex(theme, customAccentColor), customBaseTone);
})();
