import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from 'react';

import { DEFAULT_SITE_ACCENT, type CustomBaseTone, type SiteTheme } from '@domain/stores/uiPreferencesStore';

import {
  applyDocumentTheme,
  normalizeAccentHex,
  resolveAccentHex
} from './applyDocumentTheme';

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

const SiteThemeContext = createContext<SiteThemeContextValue | null>(null);

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

export function SiteThemeProvider({ children }: PropsWithChildren): JSX.Element {
  const { uiPreferences } = useDomainStores();
  const [theme, setThemeState] = useState<SiteTheme>(() => uiPreferences.getSiteTheme());
  const [customAccentColor, setCustomAccentColorState] = useState<string>(() =>
    uiPreferences.getCustomAccentColor()
  );
  const [customBaseTone, setCustomBaseToneState] = useState<CustomBaseTone>(() =>
    uiPreferences.getCustomBaseTone()
  );

  useEffect(() => {
    applyDocumentTheme(theme, resolveAccentHex(theme, customAccentColor), customBaseTone);
  }, [theme, customAccentColor, customBaseTone]);

  useEffect(() => {
    const unsubscribe = uiPreferences.subscribe(() => {
      const nextTheme = uiPreferences.getSiteTheme();
      const nextAccent = uiPreferences.getCustomAccentColor();
      const nextBaseTone = uiPreferences.getCustomBaseTone();

      setThemeState((previous) => (previous === nextTheme ? previous : nextTheme));
      setCustomAccentColorState((previous) => (previous === nextAccent ? previous : nextAccent));
      setCustomBaseToneState((previous) => (previous === nextBaseTone ? previous : nextBaseTone));
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
