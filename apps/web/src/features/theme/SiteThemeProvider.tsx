import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { type SiteTheme } from '@domain/stores/uiPreferencesStore';

import { useDomainStores } from '../storage/AppPersistenceProvider';

export interface SiteThemeOption {
  id: SiteTheme;
  label: string;
  description: string;
  swatch: string[];
}

interface SiteThemeContextValue {
  theme: SiteTheme;
  setTheme(next: SiteTheme): void;
  options: SiteThemeOption[];
}

const SITE_THEME_OPTIONS: SiteThemeOption[] = [
  {
    id: 'dark',
    label: 'ダークモード',
    description: '高コントラストで目の負担を抑える既定の配色です。',
    swatch: ['#0b0b0f', '#e11d48', '#f5f5f6']
  },
  {
    id: 'light',
    label: 'ライトモード',
    description: '明るい背景で資料や画面共有に最適です。',
    swatch: ['#f8f8fa', '#e11d48', '#1b1d28']
  },
  {
    id: 'twilight',
    label: 'トワイライト',
    description: '紫とネオンを基調にした演出向けのカラーテーマです。',
    swatch: ['#120c1f', '#8b5cf6', '#ede6ff']
  }
];

const SiteThemeContext = createContext<SiteThemeContextValue | null>(null);

function applyDocumentTheme(theme: SiteTheme): void {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;
  root.dataset.siteTheme = theme;
}

export function SiteThemeProvider({ children }: PropsWithChildren): JSX.Element {
  const { uiPreferences } = useDomainStores();
  const [theme, setThemeState] = useState<SiteTheme>(() => uiPreferences.getSiteTheme());

  useEffect(() => {
    applyDocumentTheme(theme);
  }, [theme]);

  useEffect(() => {
    const unsubscribe = uiPreferences.subscribe(() => {
      const next = uiPreferences.getSiteTheme();
      setThemeState(next);
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

  const value = useMemo<SiteThemeContextValue>(
    () => ({
      theme,
      setTheme,
      options: SITE_THEME_OPTIONS
    }),
    [theme, setTheme]
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
