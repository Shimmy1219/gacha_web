import { AppPersistence, type UiPreferencesStateV3 } from '../app-persistence';
import { PersistedStore, type UpdateOptions } from './persistedStore';

export interface UserFilterPreferences {
  selectedGachaIds: '*' | string[];
  selectedRarityIds: '*' | string[];
  hideMiss: boolean;
  showCounts: boolean;
  showSkipOnly: boolean;
  keyword: string;
}

export const DEFAULT_USER_FILTER_PREFERENCES: UserFilterPreferences = {
  selectedGachaIds: '*',
  selectedRarityIds: '*',
  hideMiss: false,
  showCounts: false,
  showSkipOnly: false,
  keyword: ''
};

export const SITE_THEME_VALUES = ['dark', 'light', 'custom'] as const;

export const DEFAULT_SITE_ACCENT = '#e11d48';
export const CUSTOM_BASE_TONE_VALUES = ['dark', 'light'] as const;
export type CustomBaseTone = (typeof CUSTOM_BASE_TONE_VALUES)[number];
const CUSTOM_BASE_TONE_SET = new Set<string>(CUSTOM_BASE_TONE_VALUES);
export const DEFAULT_CUSTOM_BASE_TONE: CustomBaseTone = 'dark';
const LEGACY_TWILIGHT_ACCENT = '#8b5cf6';

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export type SiteTheme = (typeof SITE_THEME_VALUES)[number];

const SITE_THEME_SET = new Set<string>(SITE_THEME_VALUES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeSelection(value: unknown): '*' | string[] {
  if (value === '*') {
    return '*';
  }
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0);
    return Array.from(new Set(normalized));
  }
  return '*';
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return fallback;
}

function normalizeKeyword(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return '';
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

function detectPreferredSiteTheme(): SiteTheme {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch (error) {
      console.warn('Failed to detect prefers-color-scheme', error);
    }
  }
  return 'dark';
}

function readSiteThemeFromState(state: UiPreferencesStateV3 | undefined): SiteTheme | null {
  if (!state) {
    return null;
  }
  const appearance = state.appearance;
  if (!isRecord(appearance)) {
    return null;
  }
  return normalizeSiteTheme(appearance.siteTheme);
}

function readCustomAccentColorFromState(state: UiPreferencesStateV3 | undefined): string | null {
  if (!state) {
    return null;
  }
  const appearance = state.appearance;
  if (!isRecord(appearance)) {
    return null;
  }
  const accent = normalizeHexColor(appearance.customAccentColor);
  if (accent) {
    return accent;
  }
  if (typeof appearance.siteTheme === 'string' && appearance.siteTheme.toLowerCase() === 'twilight') {
    return LEGACY_TWILIGHT_ACCENT;
  }
  return null;
}

function readCustomBaseToneFromState(state: UiPreferencesStateV3 | undefined): CustomBaseTone | null {
  if (!state) {
    return null;
  }
  const appearance = state.appearance;
  if (!isRecord(appearance)) {
    return null;
  }
  return normalizeCustomBaseTone(appearance.customBaseTone);
}

function normalizeUserFilterPreferences(raw: unknown): UserFilterPreferences {
  if (!isRecord(raw)) {
    return { ...DEFAULT_USER_FILTER_PREFERENCES };
  }

  const selectedGachaIds = normalizeSelection(raw.selectedGachaIds);
  const selectedRarityIds = normalizeSelection(raw.selectedRarityIds ?? raw.selectedRarities);
  const hideMiss = normalizeBoolean(raw.hideMiss, DEFAULT_USER_FILTER_PREFERENCES.hideMiss);
  const showCounts = normalizeBoolean(raw.showCounts, DEFAULT_USER_FILTER_PREFERENCES.showCounts);
  const showSkipOnly = normalizeBoolean(
    raw.showSkipOnly ?? raw.riaguOnly,
    DEFAULT_USER_FILTER_PREFERENCES.showSkipOnly
  );
  const keyword = normalizeKeyword(raw.keyword ?? raw.query ?? raw.userSearch);

  return {
    selectedGachaIds,
    selectedRarityIds,
    hideMiss,
    showCounts,
    showSkipOnly,
    keyword
  };
}

function serializeSelection(value: '*' | string[]): '*' | string[] {
  if (value === '*') {
    return '*';
  }
  return Array.from(new Set(value));
}

function serializeUserFilterPreferences(preferences: UserFilterPreferences): Record<string, unknown> {
  return {
    selectedGachaIds: serializeSelection(preferences.selectedGachaIds),
    selectedRarityIds: serializeSelection(preferences.selectedRarityIds),
    hideMiss: preferences.hideMiss,
    showCounts: preferences.showCounts,
    showSkipOnly: preferences.showSkipOnly,
    query: preferences.keyword
  };
}

function arePreferencesEqual(a: UserFilterPreferences, b: UserFilterPreferences): boolean {
  if (a === b) {
    return true;
  }
  if (a.keyword !== b.keyword) {
    return false;
  }
  if (a.hideMiss !== b.hideMiss || a.showCounts !== b.showCounts || a.showSkipOnly !== b.showSkipOnly) {
    return false;
  }
  const aGacha = a.selectedGachaIds === '*' ? '*' : [...a.selectedGachaIds].sort();
  const bGacha = b.selectedGachaIds === '*' ? '*' : [...b.selectedGachaIds].sort();
  if (Array.isArray(aGacha) && Array.isArray(bGacha)) {
    if (aGacha.length !== bGacha.length) {
      return false;
    }
    for (let index = 0; index < aGacha.length; index += 1) {
      if (aGacha[index] !== bGacha[index]) {
        return false;
      }
    }
  } else if (aGacha !== bGacha) {
    return false;
  }

  const aRarity = a.selectedRarityIds === '*' ? '*' : [...a.selectedRarityIds].sort();
  const bRarity = b.selectedRarityIds === '*' ? '*' : [...b.selectedRarityIds].sort();
  if (Array.isArray(aRarity) && Array.isArray(bRarity)) {
    if (aRarity.length !== bRarity.length) {
      return false;
    }
    for (let index = 0; index < aRarity.length; index += 1) {
      if (aRarity[index] !== bRarity[index]) {
        return false;
      }
    }
  } else if (aRarity !== bRarity) {
    return false;
  }

  return true;
}

function ensureState(previous: UiPreferencesStateV3 | undefined): UiPreferencesStateV3 {
  const nowIso = new Date().toISOString();
  if (!previous) {
    return {
      version: 3,
      updatedAt: nowIso
    };
  }
  return {
    ...previous,
    appearance: previous.appearance && isRecord(previous.appearance) ? { ...previous.appearance } : undefined,
    version: typeof previous.version === 'number' ? previous.version : 3,
    updatedAt: nowIso
  };
}

export class UiPreferencesStore extends PersistedStore<UiPreferencesStateV3 | undefined> {
  constructor(persistence: AppPersistence) {
    super(persistence);
  }

  protected persistImmediate(state: UiPreferencesStateV3 | undefined): void {
    this.persistence.saveUiPreferences(state);
  }

  protected persistDebounced(state: UiPreferencesStateV3 | undefined): void {
    this.persistence.saveUiPreferencesDebounced(state);
  }

  getSiteTheme(): SiteTheme {
    return readSiteThemeFromState(this.state) ?? detectPreferredSiteTheme();
  }

  setSiteTheme(theme: SiteTheme, options: UpdateOptions = { persist: 'debounced' }): void {
    const persistMode = options.persist ?? 'debounced';
    const emit = options.emit;

    this.update(
      (previous) => {
        const current = readSiteThemeFromState(previous);
        if (current === theme) {
          return previous;
        }

        const base = ensureState(previous);
        const previousAppearance = base.appearance && isRecord(base.appearance) ? base.appearance : {};

        return {
          ...base,
          appearance: {
            ...previousAppearance,
            siteTheme: theme
          }
        };
      },
      { persist: persistMode, emit }
    );
  }

  getCustomAccentColor(): string {
    return readCustomAccentColorFromState(this.state) ?? DEFAULT_SITE_ACCENT;
  }

  setCustomAccentColor(color: string, options: UpdateOptions = { persist: 'debounced' }): void {
    const persistMode = options.persist ?? 'debounced';
    const emit = options.emit;
    const normalized = normalizeHexColor(color) ?? DEFAULT_SITE_ACCENT;

    this.update(
      (previous) => {
        const current = readCustomAccentColorFromState(previous) ?? DEFAULT_SITE_ACCENT;
        if (current === normalized) {
          return previous;
        }

        const base = ensureState(previous);
        const previousAppearance = base.appearance && isRecord(base.appearance) ? base.appearance : {};

        return {
          ...base,
          appearance: {
            ...previousAppearance,
            customAccentColor: normalized
          }
        };
      },
      { persist: persistMode, emit }
    );
  }

  getCustomBaseTone(): CustomBaseTone {
    return readCustomBaseToneFromState(this.state) ?? DEFAULT_CUSTOM_BASE_TONE;
  }

  setCustomBaseTone(tone: CustomBaseTone, options: UpdateOptions = { persist: 'debounced' }): void {
    const persistMode = options.persist ?? 'debounced';
    const emit = options.emit;

    this.update(
      (previous) => {
        const current = readCustomBaseToneFromState(previous) ?? DEFAULT_CUSTOM_BASE_TONE;
        if (current === tone) {
          return previous;
        }

        const base = ensureState(previous);
        const previousAppearance = base.appearance && isRecord(base.appearance) ? base.appearance : {};

        return {
          ...base,
          appearance: {
            ...previousAppearance,
            customBaseTone: tone
          }
        };
      },
      { persist: persistMode, emit }
    );
  }

  getUserFilterPreferences(): UserFilterPreferences {
    return normalizeUserFilterPreferences(this.state?.users && isRecord(this.state.users) ? this.state.users.filter : undefined);
  }

  setUserFilterPreferences(
    next: UserFilterPreferences,
    options: UpdateOptions = { persist: 'debounced' }
  ): void {
    this.updateUserFilterPreferences(() => next, options);
  }

  updateUserFilterPreferences(
    updater: (previous: UserFilterPreferences) => UserFilterPreferences,
    options: UpdateOptions = { persist: 'debounced' }
  ): void {
    const persistMode = options.persist ?? 'debounced';
    const emit = options.emit;

    this.update(
      (previous) => {
        const base = ensureState(previous);
        const previousUsers = base.users && isRecord(base.users) ? base.users : {};
        const previousFilterRaw = previousUsers.filter;
        const previousFilter = normalizeUserFilterPreferences(previousFilterRaw);
        const nextFilter = updater(previousFilter);

        if (arePreferencesEqual(previousFilter, nextFilter)) {
          return previous;
        }

        const serialized = serializeUserFilterPreferences(nextFilter);
        const nextUsers = {
          ...previousUsers,
          filter: {
            ...(isRecord(previousFilterRaw) ? previousFilterRaw : {}),
            ...serialized
          }
        };

        return {
          ...base,
          users: nextUsers
        };
      },
      { persist: persistMode, emit }
    );
  }
}
