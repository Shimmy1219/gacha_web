import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from 'react';

import { DEFAULT_SITE_ACCENT, type SiteTheme } from '@domain/stores/uiPreferencesStore';

import { useDomainStores } from '../storage/AppPersistenceProvider';

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
    description: 'アクセントカラーを自由に選べるダークベースのテーマです。'
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

function rgbToRgba([r, g, b]: RgbTuple, alpha: number): string {
  const clamped = Math.min(Math.max(alpha, 0), 1);
  return `rgba(${r}, ${g}, ${b}, ${clamped.toFixed(2)})`;
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

function createThemeSwatches(theme: SiteTheme, customAccentHex: string): ThemeSwatchSample[] {
  const accentHex = theme === 'custom' ? normalizeAccentHex(customAccentHex) : DEFAULT_SITE_ACCENT;
  const main = theme === 'light' ? LIGHT_MAIN_HEX : DARK_MAIN_HEX;
  const text = theme === 'light' ? LIGHT_TEXT_HEX : DARK_TEXT_HEX;

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

  const gradientBase = mixRgb(accentRgb, [255, 255, 255], scheme === 'light' ? 0.38 : 0.22);
  const gradientAlt = mixRgb(accentRgb, [255, 255, 255], scheme === 'light' ? 0.28 : 0.16);
  const gradientPrimaryAlpha = scheme === 'light' ? 0.2 : 0.12;
  const gradientSecondaryAlpha = scheme === 'light' ? 0.14 : 0.1;

  return {
    accent: rgbToCss(accentRgb),
    accentDark: rgbToCss(accentDark),
    accentBright: rgbToCss(accentBright),
    accentBrightDark: rgbToCss(accentBrightDark),
    accentForeground,
    gradient1: rgbToRgba(gradientBase, gradientPrimaryAlpha),
    gradient2: rgbToRgba(gradientAlt, gradientSecondaryAlpha)
  };
}

function applyDocumentTheme(theme: SiteTheme, accentHex: string): void {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.dataset.siteTheme = theme;

  const scheme = theme === 'light' ? 'light' : 'dark';
  const palette = computeAccentPalette(accentHex, scheme);

  root.style.setProperty('--color-accent', palette.accent);
  root.style.setProperty('--color-accent-dark', palette.accentDark);
  root.style.setProperty('--color-accent-bright', palette.accentBright);
  root.style.setProperty('--color-accent-bright-dark', palette.accentBrightDark);
  root.style.setProperty('--color-accent-foreground', palette.accentForeground);
  root.style.setProperty('--background-gradient-1', palette.gradient1);
  root.style.setProperty('--background-gradient-2', palette.gradient2);
}

export function SiteThemeProvider({ children }: PropsWithChildren): JSX.Element {
  const { uiPreferences } = useDomainStores();
  const [theme, setThemeState] = useState<SiteTheme>(() => uiPreferences.getSiteTheme());
  const [customAccentColor, setCustomAccentColorState] = useState<string>(() =>
    uiPreferences.getCustomAccentColor()
  );

  useEffect(() => {
    applyDocumentTheme(theme, resolveAccentHex(theme, customAccentColor));
  }, [theme, customAccentColor]);

  useEffect(() => {
    const unsubscribe = uiPreferences.subscribe(() => {
      const nextTheme = uiPreferences.getSiteTheme();
      const nextAccent = uiPreferences.getCustomAccentColor();

      setThemeState((previous) => (previous === nextTheme ? previous : nextTheme));
      setCustomAccentColorState((previous) => (previous === nextAccent ? previous : nextAccent));
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

  const options = useMemo<SiteThemeOption[]>(() => {
    return BASE_THEME_OPTIONS.map((option) => ({
      ...option,
      swatch: createThemeSwatches(option.id, customAccentColor)
    }));
  }, [customAccentColor]);

  const value = useMemo<SiteThemeContextValue>(
    () => ({
      theme,
      setTheme,
      options,
      customAccentColor,
      setCustomAccentColor: handleSetCustomAccentColor
    }),
    [theme, setTheme, options, customAccentColor, handleSetCustomAccentColor]
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
