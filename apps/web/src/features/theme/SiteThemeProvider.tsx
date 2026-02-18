import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from 'react';

import {
  DEFAULT_SITE_ACCENT,
  DEFAULT_SITE_ZOOM_PERCENT,
  SITE_ZOOM_PERCENT_MAX,
  SITE_ZOOM_PERCENT_MIN,
  type CustomBaseTone,
  type SiteTheme
} from '@domain/stores/uiPreferencesStore';

import { useDomainStores } from '../storage/AppPersistenceProvider';
import { normalizeSiteZoomScale, SITE_ZOOM_CHANGE_EVENT } from './siteZoomMath';

type ThemeRole = 'main' | 'accent' | 'text';

export interface ThemeSwatchSample {
  role: ThemeRole;
  label: string;
  color: string;
  sampleBackground?: string;
}

export interface SiteThemeOption {
  id: SiteTheme;
  label: string;
  description: string;
  swatch: ThemeSwatchSample[];
}

interface SiteThemeContextValue {
  theme: SiteTheme;
  setTheme(next: SiteTheme): void;
  options: SiteThemeOption[];
  customAccentColor: string;
  setCustomAccentColor(next: string): void;
  customBaseTone: CustomBaseTone;
  setCustomBaseTone(next: CustomBaseTone): void;
}

const DARK_MAIN_HEX = '#0b0b0f';
const DARK_TEXT_HEX = '#f5f5f6';
const LIGHT_MAIN_HEX = '#ffffff';
const LIGHT_TEXT_HEX = '#1b1d28';

const BASE_THEME_OPTIONS: Array<Omit<SiteThemeOption, 'swatch'>> = [
  {
    id: 'dark',
    label: 'ダークモード',
    description: '高コントラストで目の負担を抑える既定の配色です。'
  },
  {
    id: 'light',
    label: 'ライトモード',
    description: '標準的な白背景で資料や画面共有に適した配色です。'
  },
  {
    id: 'custom',
    label: 'カスタムカラー',
    description: 'アクセントカラーと背景の明るさを自由に選べるテーマです。'
  }
];

type RgbTuple = [number, number, number];

const SiteThemeContext = createContext<SiteThemeContextValue | null>(null);

function normalizeAccentHex(raw: string): string {
  const value = raw?.trim().toLowerCase();
  if (/^#(?:[0-9a-f]{6})$/.test(value)) {
    return value;
  }
  if (/^#(?:[0-9a-f]{3})$/.test(value)) {
    const [, r, g, b] = value;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return DEFAULT_SITE_ACCENT;
}

function hexToRgb(hex: string): RgbTuple | null {
  if (!/^#(?:[0-9a-f]{6})$/.test(hex)) {
    return null;
  }

  const value = hex.slice(1);
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return [r, g, b];
}

function mixRgb(source: RgbTuple, target: RgbTuple, amount: number): RgbTuple {
  const ratio = Math.min(Math.max(amount, 0), 1);
  const complement = 1 - ratio;
  return [
    Math.round(source[0] * complement + target[0] * ratio),
    Math.round(source[1] * complement + target[1] * ratio),
    Math.round(source[2] * complement + target[2] * ratio)
  ];
}

function rgbToCss([r, g, b]: RgbTuple): string {
  return `${r} ${g} ${b}`;
}

function getLuminance([r, g, b]: RgbTuple): number {
  const channels = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  }) as [number, number, number];

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function resolveAccentHex(theme: SiteTheme, customAccentHex: string): string {
  if (theme === 'custom') {
    return normalizeAccentHex(customAccentHex);
  }
  return DEFAULT_SITE_ACCENT;
}

const SURFACE_TONE_CONFIG: Record<CustomBaseTone, { colorScheme: 'dark' | 'light'; vars: Record<string, string> }> = {
  dark: {
    colorScheme: 'dark',
    vars: {
      '--color-surface': '11 11 15',
      '--color-surface-foreground': '245 245 246',
      '--color-surface-alt': '17 17 25',
      '--color-surface-deep': '9 9 15',
      '--color-panel': '21 21 27',
      '--color-panel-muted': '33 33 43',
      '--color-panel-contrast': '45 45 57',
      '--color-border': '42 42 54',
      '--color-muted': '35 35 43',
      '--color-muted-foreground': '179 179 189',
      '--color-overlay': '17 17 26',
      '--color-user-card': '#1b1b23',
      '--color-item-card': '#1b1b23',
      '--color-user-inventory-card': '#1b1b23'
    }
  },
  light: {
    colorScheme: 'light',
    vars: {
      '--color-surface': '255 255 255',
      '--color-surface-foreground': '27 29 40',
      '--color-surface-alt': '248 249 252',
      '--color-surface-deep': '240 242 247',
      '--color-panel': '255 255 255',
      '--color-panel-muted': '243 244 249',
      '--color-panel-contrast': '227 230 239',
      '--color-border': '210 214 224',
      '--color-muted': '238 240 246',
      '--color-muted-foreground': '104 112 130',
      '--color-overlay': '252 253 255',
      '--color-user-card': '#fafafc',
      '--color-item-card': '#fafafc',
      '--color-user-inventory-card': '#f5f6fa'
    }
  }
};

const SURFACE_VARIABLE_NAMES = Object.keys(SURFACE_TONE_CONFIG.dark.vars);

function createThemeSwatches(
  theme: SiteTheme,
  customAccentHex: string,
  customBaseTone: CustomBaseTone
): ThemeSwatchSample[] {
  const accentHex = theme === 'custom' ? normalizeAccentHex(customAccentHex) : DEFAULT_SITE_ACCENT;
  const isLight = theme === 'light' || (theme === 'custom' && customBaseTone === 'light');
  const main = isLight ? LIGHT_MAIN_HEX : DARK_MAIN_HEX;
  const text = isLight ? LIGHT_TEXT_HEX : DARK_TEXT_HEX;

  return [
    { role: 'main', label: 'メイン', color: main },
    { role: 'accent', label: 'アクセント', color: accentHex },
    { role: 'text', label: '文字', color: text, sampleBackground: main }
  ];
}

function computeAccentPalette(hex: string, scheme: 'dark' | 'light') {
  const normalized = normalizeAccentHex(hex);
  const accentRgb = hexToRgb(normalized) ?? (hexToRgb(DEFAULT_SITE_ACCENT) as RgbTuple);
  const darkMix = scheme === 'light' ? 0.28 : 0.22;
  const brightMix = scheme === 'light' ? 0.32 : 0.18;
  const accentDark = mixRgb(accentRgb, [0, 0, 0], darkMix);
  const accentBright = mixRgb(accentRgb, [255, 255, 255], brightMix);
  const accentBrightDark = mixRgb(accentBright, [0, 0, 0], 0.24);

  const luminance = getLuminance(accentRgb);
  const accentForeground = luminance > 0.58 ? '17 17 17' : '255 255 255';

  return {
    accent: rgbToCss(accentRgb),
    accentDark: rgbToCss(accentDark),
    accentBright: rgbToCss(accentBright),
    accentBrightDark: rgbToCss(accentBrightDark),
    accentForeground,
    gradient1: 'rgba(0, 0, 0, 0)',
    gradient2: 'rgba(0, 0, 0, 0)'
  };
}

function applyDocumentTheme(theme: SiteTheme, accentHex: string, customBaseTone: CustomBaseTone): void {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.dataset.siteTheme = theme;

  const scheme: 'dark' | 'light' = theme === 'light' ? 'light' : theme === 'dark' ? 'dark' : customBaseTone;
  root.dataset.siteThemeScheme = scheme;
  const palette = computeAccentPalette(accentHex, scheme);

  root.style.setProperty('--color-accent', palette.accent);
  root.style.setProperty('--color-accent-dark', palette.accentDark);
  root.style.setProperty('--color-accent-bright', palette.accentBright);
  root.style.setProperty('--color-accent-bright-dark', palette.accentBrightDark);
  root.style.setProperty('--color-accent-foreground', palette.accentForeground);
  root.style.setProperty('--background-gradient-1', palette.gradient1);
  root.style.setProperty('--background-gradient-2', palette.gradient2);

  if (theme === 'custom') {
    const toneConfig = SURFACE_TONE_CONFIG[customBaseTone];
    root.style.setProperty('color-scheme', toneConfig.colorScheme);
    for (const name of SURFACE_VARIABLE_NAMES) {
      root.style.setProperty(name, toneConfig.vars[name]);
    }
  } else {
    root.style.removeProperty('color-scheme');
    for (const name of SURFACE_VARIABLE_NAMES) {
      root.style.removeProperty(name);
    }
    root.dataset.siteThemeScheme = scheme;
  }
}

function normalizeSiteZoomPercent(raw: unknown): number {
  const rounded = Math.round(normalizeSiteZoomScale(raw) * 100);
  if (!Number.isFinite(rounded) || Number.isNaN(rounded)) {
    return DEFAULT_SITE_ZOOM_PERCENT;
  }
  return Math.min(Math.max(rounded, SITE_ZOOM_PERCENT_MIN), SITE_ZOOM_PERCENT_MAX);
}

function applyDocumentZoom(percent: number): void {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const normalized = normalizeSiteZoomPercent(percent);
  const scale = normalized / 100;
  const supportsCssZoom =
    typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('zoom', '1');

  root.style.setProperty('--site-zoom-percent', String(normalized));
  root.style.setProperty('--site-zoom-scale', String(scale));
  root.style.setProperty('--site-zoom-inverse-scale', String(1 / scale));

  if (supportsCssZoom) {
    root.dataset.siteZoomMode = 'native';
    root.style.setProperty('zoom', String(scale));
  } else {
    root.dataset.siteZoomMode = 'transform';
    root.style.removeProperty('zoom');
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(SITE_ZOOM_CHANGE_EVENT, {
        detail: { percent: normalized, scale }
      })
    );
  }
}

export function SiteThemeProvider({ children }: PropsWithChildren): JSX.Element {
  const { uiPreferences } = useDomainStores();
  const [theme, setThemeState] = useState<SiteTheme>(() => uiPreferences.getSiteTheme());
  const [customAccentColor, setCustomAccentColorState] = useState<string>(() =>
    uiPreferences.getCustomAccentColor()
  );
  const [customBaseTone, setCustomBaseToneState] = useState<CustomBaseTone>(() =>
    uiPreferences.getCustomBaseTone()
  );
  const [siteZoomPercent, setSiteZoomPercentState] = useState<number>(() =>
    uiPreferences.getSiteZoomPercent()
  );

  useEffect(() => {
    applyDocumentTheme(theme, resolveAccentHex(theme, customAccentColor), customBaseTone);
  }, [theme, customAccentColor, customBaseTone]);

  useEffect(() => {
    applyDocumentZoom(siteZoomPercent);
  }, [siteZoomPercent]);

  useEffect(() => {
    const unsubscribe = uiPreferences.subscribe(() => {
      const nextTheme = uiPreferences.getSiteTheme();
      const nextAccent = uiPreferences.getCustomAccentColor();
      const nextBaseTone = uiPreferences.getCustomBaseTone();
      const nextSiteZoomPercent = uiPreferences.getSiteZoomPercent();

      setThemeState((previous) => (previous === nextTheme ? previous : nextTheme));
      setCustomAccentColorState((previous) => (previous === nextAccent ? previous : nextAccent));
      setCustomBaseToneState((previous) => (previous === nextBaseTone ? previous : nextBaseTone));
      setSiteZoomPercentState((previous) =>
        previous === nextSiteZoomPercent ? previous : nextSiteZoomPercent
      );
    });
    return unsubscribe;
  }, [uiPreferences]);

  const setTheme = useCallback(
    (next: SiteTheme) => {
      setThemeState(next);
      uiPreferences.setSiteTheme(next, { persist: 'debounced' });
    },
    [uiPreferences]
  );

  const handleSetCustomAccentColor = useCallback(
    (next: string) => {
      const normalized = normalizeAccentHex(next);
      setCustomAccentColorState((previous) => (previous === normalized ? previous : normalized));
      uiPreferences.setCustomAccentColor(normalized, { persist: 'debounced' });
    },
    [uiPreferences]
  );

  const handleSetCustomBaseTone = useCallback(
    (next: CustomBaseTone) => {
      setCustomBaseToneState((previous) => (previous === next ? previous : next));
      uiPreferences.setCustomBaseTone(next, { persist: 'debounced' });
    },
    [uiPreferences]
  );

  const options = useMemo<SiteThemeOption[]>(() => {
    return BASE_THEME_OPTIONS.map((option) => ({
      ...option,
      swatch: createThemeSwatches(option.id, customAccentColor, customBaseTone)
    }));
  }, [customAccentColor, customBaseTone]);

  const value = useMemo<SiteThemeContextValue>(
    () => ({
      theme,
      setTheme,
      options,
      customAccentColor,
      setCustomAccentColor: handleSetCustomAccentColor,
      customBaseTone,
      setCustomBaseTone: handleSetCustomBaseTone
    }),
    [theme, setTheme, options, customAccentColor, handleSetCustomAccentColor, customBaseTone, handleSetCustomBaseTone]
  );

  return <SiteThemeContext.Provider value={value}>{children}</SiteThemeContext.Provider>;
}

export function useSiteTheme(): SiteThemeContextValue {
  const context = useContext(SiteThemeContext);
  if (!context) {
    throw new Error('useSiteTheme must be used within a SiteThemeProvider');
  }
  return context;
}
