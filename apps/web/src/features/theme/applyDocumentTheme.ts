import { DEFAULT_SITE_ACCENT, type CustomBaseTone, type SiteTheme } from '@domain/stores/uiPreferencesStore';

type RgbTuple = [number, number, number];

export function normalizeAccentHex(raw: string): string {
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

export function resolveAccentHex(theme: SiteTheme, customAccentHex: string): string {
  if (theme === 'custom') {
    return normalizeAccentHex(customAccentHex);
  }
  return DEFAULT_SITE_ACCENT;
}

export const SURFACE_TONE_CONFIG: Record<CustomBaseTone, { colorScheme: 'dark' | 'light'; vars: Record<string, string> }> = {
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

export function applyDocumentTheme(
  theme: SiteTheme,
  accentHex: string,
  customBaseTone: CustomBaseTone
): void {
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
