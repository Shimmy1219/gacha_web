import { AppPersistence, type UiPreferencesStateV3 } from '../app-persistence';
import { PersistedStore, type UpdateOptions } from './persistedStore';

export interface UserFilterPreferences {
  selectedGachaIds: '*' | string[];
  selectedRarityIds: '*' | string[];
  hideMiss: boolean;
  showCounts: boolean;
  showSkipOnly: boolean;
  showUnobtainedItems: boolean;
  keyword: string;
}

export const DEFAULT_USER_FILTER_PREFERENCES: UserFilterPreferences = {
  selectedGachaIds: '*',
  selectedRarityIds: '*',
  hideMiss: false,
  showCounts: true,
  showSkipOnly: false,
  showUnobtainedItems: false,
  keyword: ''
};

export const SITE_THEME_VALUES = ['dark', 'light', 'custom'] as const;

export const DEFAULT_SITE_ACCENT = '#e11d48';
export const CUSTOM_BASE_TONE_VALUES = ['dark', 'light'] as const;
export type CustomBaseTone = (typeof CUSTOM_BASE_TONE_VALUES)[number];
const CUSTOM_BASE_TONE_SET = new Set<string>(CUSTOM_BASE_TONE_VALUES);
export const DEFAULT_CUSTOM_BASE_TONE: CustomBaseTone = 'dark';
const LEGACY_TWILIGHT_ACCENT = '#8b5cf6';

export const DASHBOARD_DESKTOP_LAYOUT_VALUES = ['grid', 'sidebar'] as const;
export type DashboardDesktopLayout = (typeof DASHBOARD_DESKTOP_LAYOUT_VALUES)[number];
const DASHBOARD_DESKTOP_LAYOUT_SET = new Set<string>(DASHBOARD_DESKTOP_LAYOUT_VALUES);
export const DEFAULT_DASHBOARD_DESKTOP_LAYOUT: DashboardDesktopLayout = 'grid';

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

function normalizeOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return null;
}

function normalizeKeyword(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

function normalizeDrawDialogLastSelectedGachaId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

function normalizeDashboardDesktopLayout(value: unknown): DashboardDesktopLayout | null {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (DASHBOARD_DESKTOP_LAYOUT_SET.has(lower)) {
      return lower as DashboardDesktopLayout;
    }
  }
  return null;
}

function readDiscordAuthLogsEnabledFromState(state: UiPreferencesStateV3 | undefined): boolean | null {
  if (!state) {
    return null;
  }

  const debug = state.debug;
  if (!isRecord(debug)) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(debug, 'discordAuthLogs')) {
    return null;
  }

  return normalizeBoolean(debug.discordAuthLogs, false);
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

function readDashboardDesktopLayoutFromState(
  state: UiPreferencesStateV3 | undefined
): DashboardDesktopLayout | null {
  if (!state) {
    return null;
  }
  const dashboard = state.dashboard;
  if (!isRecord(dashboard)) {
    return null;
  }
  return normalizeDashboardDesktopLayout(dashboard.desktop);
}

function readUserCardOpenState(state: UiPreferencesStateV3 | undefined, userId: string): boolean | null {
  if (!state) {
    return null;
  }

  const users = state.users;
  if (!isRecord(users)) {
    return null;
  }

  const cards = users.cards;
  if (!isRecord(cards)) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(cards, userId)) {
    return null;
  }

  return normalizeOptionalBoolean(cards[userId]);
}

function readRiaguCardOpenState(state: UiPreferencesStateV3 | undefined, cardId: string): boolean | null {
  if (!state) {
    return null;
  }

  const riagu = state.riagu;
  if (!isRecord(riagu)) {
    return null;
  }

  const cards = riagu.cards;
  if (!isRecord(cards)) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(cards, cardId)) {
    return null;
  }

  return normalizeOptionalBoolean(cards[cardId]);
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
  const showUnobtainedItems = normalizeBoolean(
    raw.showUnobtainedItems,
    DEFAULT_USER_FILTER_PREFERENCES.showUnobtainedItems
  );
  const keyword = normalizeKeyword(raw.keyword ?? raw.query ?? raw.userSearch);

  return {
    selectedGachaIds,
    selectedRarityIds,
    hideMiss,
    showCounts,
    showSkipOnly,
    showUnobtainedItems,
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
    showUnobtainedItems: preferences.showUnobtainedItems,
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
  if (
    a.hideMiss !== b.hideMiss ||
    a.showCounts !== b.showCounts ||
    a.showSkipOnly !== b.showSkipOnly ||
    a.showUnobtainedItems !== b.showUnobtainedItems
  ) {
    return false;
  }
  if (a.showUnobtainedItems !== b.showUnobtainedItems) {
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

function readDrawDialogLastSelectedGachaId(
  state: UiPreferencesStateV3 | undefined
): string | null {
  if (!state) {
    return null;
  }

  const gacha = state.gacha;
  if (!isRecord(gacha)) {
    return null;
  }

  const drawDialog = gacha.drawDialog;
  if (!isRecord(drawDialog)) {
    return null;
  }

  return normalizeDrawDialogLastSelectedGachaId(drawDialog.lastSelectedGachaId);
}

function readQuickSendNewOnlyPreference(state: UiPreferencesStateV3 | undefined): boolean | null {
  if (!state) {
    return null;
  }

  const gacha = state.gacha;
  if (!isRecord(gacha)) {
    return null;
  }

  const drawDialog = gacha.drawDialog;
  if (!isRecord(drawDialog)) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(drawDialog, 'quickSendNewOnly')) {
    return null;
  }

  return normalizeBoolean(drawDialog.quickSendNewOnly, false);
}

function readExcludeRiaguImagesPreference(state: UiPreferencesStateV3 | undefined): boolean | null {
  if (!state) {
    return null;
  }

  const gacha = state.gacha;
  if (!isRecord(gacha)) {
    return null;
  }

  const share = gacha.share;
  if (!isRecord(share)) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(share, 'excludeRiaguImages')) {
    return null;
  }

  return normalizeBoolean(share.excludeRiaguImages, false);
}

function readCompleteGachaIncludeOutOfStockPreference(state: UiPreferencesStateV3 | undefined): boolean | null {
  if (!state) {
    return null;
  }

  const gacha = state.gacha;
  if (!isRecord(gacha)) {
    return null;
  }

  const stock = gacha.stock;
  if (!isRecord(stock)) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(stock, 'includeOutOfStockInComplete')) {
    return null;
  }

  return normalizeBoolean(stock.includeOutOfStockInComplete, false);
}

function readGuaranteeOutOfStockItemPreference(state: UiPreferencesStateV3 | undefined): boolean | null {
  if (!state) {
    return null;
  }

  const gacha = state.gacha;
  if (!isRecord(gacha)) {
    return null;
  }

  const stock = gacha.stock;
  if (!isRecord(stock)) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(stock, 'allowOutOfStockGuaranteeItem')) {
    return null;
  }

  return normalizeBoolean(stock.allowOutOfStockGuaranteeItem, false);
}

function readApplyLowerThresholdGuaranteesPreference(state: UiPreferencesStateV3 | undefined): boolean | null {
  if (!state) {
    return null;
  }

  const gacha = state.gacha;
  if (!isRecord(gacha)) {
    return null;
  }

  const guarantee = gacha.guarantee;
  if (!isRecord(guarantee)) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(guarantee, 'applyLowerThresholdGuarantees')) {
    return null;
  }

  return normalizeBoolean(guarantee.applyLowerThresholdGuarantees, false);
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
    debug: previous.debug && isRecord(previous.debug) ? { ...previous.debug } : undefined,
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

  getDashboardDesktopLayout(): DashboardDesktopLayout {
    return readDashboardDesktopLayoutFromState(this.state) ?? DEFAULT_DASHBOARD_DESKTOP_LAYOUT;
  }

  setDashboardDesktopLayout(
    layout: DashboardDesktopLayout,
    options: UpdateOptions = { persist: 'debounced' }
  ): void {
    const persistMode = options.persist ?? 'debounced';
    const emit = options.emit;

    this.update(
      (previous) => {
        const current = readDashboardDesktopLayoutFromState(previous) ?? DEFAULT_DASHBOARD_DESKTOP_LAYOUT;
        if (current === layout) {
          return previous;
        }

        const base = ensureState(previous);
        const previousDashboard = base.dashboard && isRecord(base.dashboard) ? base.dashboard : {};

        return {
          ...base,
          dashboard: {
            ...previousDashboard,
            desktop: layout
          }
        };
      },
      { persist: persistMode, emit }
    );
  }

  getDiscordAuthLogsEnabled(): boolean {
    return readDiscordAuthLogsEnabledFromState(this.state) ?? false;
  }

  setDiscordAuthLogsEnabled(enabled: boolean, options: UpdateOptions = { persist: 'debounced' }): void {
    const persistMode = options.persist ?? 'debounced';
    const emit = options.emit;

    this.update(
      (previous) => {
        const current = readDiscordAuthLogsEnabledFromState(previous) ?? false;
        if (current === enabled) {
          return previous;
        }

        const base = ensureState(previous);
        const previousDebug = base.debug && isRecord(base.debug) ? base.debug : undefined;
        const nextDebug = { ...(previousDebug ?? {}) } as Record<string, unknown>;

        if (enabled) {
          nextDebug.discordAuthLogs = true;
        } else {
          delete nextDebug.discordAuthLogs;
        }

        const hasDebugEntries = Object.keys(nextDebug).length > 0;
        const nextState: UiPreferencesStateV3 = { ...base };

        if (hasDebugEntries) {
          nextState.debug = nextDebug;
        } else {
          delete nextState.debug;
        }

        return nextState;
      },
      { persist: persistMode, emit }
    );
  }

  getLastSelectedDrawGachaId(): string | null {
    return readDrawDialogLastSelectedGachaId(this.state);
  }

  getQuickSendNewOnlyPreference(): boolean | null {
    return readQuickSendNewOnlyPreference(this.state);
  }

  getExcludeRiaguImagesPreference(): boolean | null {
    return readExcludeRiaguImagesPreference(this.state);
  }

  getCompleteGachaIncludeOutOfStockPreference(): boolean | null {
    return readCompleteGachaIncludeOutOfStockPreference(this.state);
  }

  getGuaranteeOutOfStockItemPreference(): boolean | null {
    return readGuaranteeOutOfStockItemPreference(this.state);
  }

  setLastSelectedDrawGachaId(
    nextId: string | null | undefined,
    options: UpdateOptions = { persist: 'debounced' }
  ): void {
    const persistMode = options.persist ?? 'debounced';
    const emit = options.emit;
    const normalized = normalizeDrawDialogLastSelectedGachaId(nextId);

    this.update(
      (previous) => {
        const current = readDrawDialogLastSelectedGachaId(previous);
        if (current === normalized) {
          return previous;
        }

        const base = ensureState(previous);
        const previousGacha = base.gacha && isRecord(base.gacha) ? base.gacha : undefined;
        const previousDrawDialog =
          previousGacha && isRecord(previousGacha.drawDialog) ? previousGacha.drawDialog : undefined;

        if (normalized) {
          return {
            ...base,
            gacha: {
              ...(previousGacha ?? {}),
              drawDialog: {
                ...(previousDrawDialog ?? {}),
                lastSelectedGachaId: normalized
              }
            }
          };
        }

        const nextDrawDialog = previousDrawDialog ? { ...previousDrawDialog } : undefined;
        if (nextDrawDialog) {
          delete nextDrawDialog.lastSelectedGachaId;
        }

        const hasDrawDialogEntries = Boolean(nextDrawDialog && Object.keys(nextDrawDialog).length > 0);
        const nextGacha = previousGacha ? { ...previousGacha } : undefined;

        if (hasDrawDialogEntries && nextGacha) {
          nextGacha['drawDialog'] = nextDrawDialog as Record<string, unknown>;
        } else if (nextGacha) {
          delete nextGacha['drawDialog'];
        }

        const hasGachaEntries = Boolean(nextGacha && Object.keys(nextGacha).length > 0);

        const nextState: UiPreferencesStateV3 = {
          ...base,
          ...(hasGachaEntries ? { gacha: nextGacha } : {})
        };

        if (!hasGachaEntries) {
          delete nextState.gacha;
        }

        return nextState;
      },
      { persist: persistMode, emit }
    );
  }

  setQuickSendNewOnlyPreference(
    nextValue: boolean | null | undefined,
    options: UpdateOptions = { persist: 'debounced' }
  ): void {
    const persistMode = options.persist ?? 'debounced';
    const emit = options.emit;
    const normalized = typeof nextValue === 'boolean' ? nextValue : null;

    this.update(
      (previous) => {
        const current = readQuickSendNewOnlyPreference(previous);
        if (current === normalized) {
          return previous;
        }

        const base = ensureState(previous);
        const previousGacha = base.gacha && isRecord(base.gacha) ? base.gacha : undefined;
        const previousDrawDialog =
          previousGacha && isRecord(previousGacha.drawDialog) ? previousGacha.drawDialog : undefined;

        if (normalized !== null) {
          return {
            ...base,
            gacha: {
              ...(previousGacha ?? {}),
              drawDialog: {
                ...(previousDrawDialog ?? {}),
                quickSendNewOnly: normalized
              }
            }
          };
        }

        const nextDrawDialog = previousDrawDialog ? { ...previousDrawDialog } : undefined;
        if (nextDrawDialog) {
          delete nextDrawDialog.quickSendNewOnly;
        }

        const hasDrawDialogEntries = Boolean(nextDrawDialog && Object.keys(nextDrawDialog).length > 0);
        const nextGacha = previousGacha ? { ...previousGacha } : undefined;

        if (hasDrawDialogEntries && nextGacha) {
          nextGacha['drawDialog'] = nextDrawDialog as Record<string, unknown>;
        } else if (nextGacha) {
          delete nextGacha['drawDialog'];
        }

        const hasGachaEntries = Boolean(nextGacha && Object.keys(nextGacha).length > 0);

        const nextState: UiPreferencesStateV3 = {
          ...base,
          ...(hasGachaEntries ? { gacha: nextGacha } : {})
        };

        if (!hasGachaEntries) {
          delete nextState.gacha;
        }

        return nextState;
      },
      { persist: persistMode, emit }
    );
  }

  setExcludeRiaguImagesPreference(
    nextValue: boolean | null | undefined,
    options: UpdateOptions = { persist: 'debounced' }
  ): void {
    const persistMode = options.persist ?? 'debounced';
    const emit = options.emit;
    const normalized = typeof nextValue === 'boolean' ? nextValue : null;

    this.update(
      (previous) => {
        const current = readExcludeRiaguImagesPreference(previous);
        if (current === normalized) {
          return previous;
        }

        const base = ensureState(previous);
        const previousGacha = base.gacha && isRecord(base.gacha) ? base.gacha : undefined;
        const previousShare = previousGacha && isRecord(previousGacha.share) ? previousGacha.share : undefined;

        const nextShare = previousShare ? { ...previousShare } : undefined;
        if (normalized !== null) {
          const ensured = nextShare ?? {};
          ensured.excludeRiaguImages = normalized;
          const nextGacha = {
            ...(previousGacha ?? {}),
            share: ensured
          };
          return { ...base, gacha: nextGacha };
        }

        if (nextShare) {
          delete nextShare.excludeRiaguImages;
        }

        const hasShareEntries = Boolean(nextShare && Object.keys(nextShare).length > 0);
        const nextGacha = previousGacha ? { ...previousGacha } : undefined;

        if (hasShareEntries && nextGacha) {
          nextGacha['share'] = nextShare as Record<string, unknown>;
        } else if (nextGacha) {
          delete nextGacha['share'];
        }

        const hasGachaEntries = Boolean(nextGacha && Object.keys(nextGacha).length > 0);

        const nextState: UiPreferencesStateV3 = {
          ...base,
          ...(hasGachaEntries ? { gacha: nextGacha } : {})
        };

        if (!hasGachaEntries) {
          delete nextState.gacha;
        }

        return nextState;
      },
      { persist: persistMode, emit }
    );
  }

  setCompleteGachaIncludeOutOfStockPreference(
    nextValue: boolean | null | undefined,
    options: UpdateOptions = { persist: 'debounced' }
  ): void {
    const persistMode = options.persist ?? 'debounced';
    const emit = options.emit;
    const normalized = typeof nextValue === 'boolean' ? nextValue : null;

    this.update(
      (previous) => {
        const current = readCompleteGachaIncludeOutOfStockPreference(previous);
        if (current === normalized) {
          return previous;
        }

        const base = ensureState(previous);
        const previousGacha = base.gacha && isRecord(base.gacha) ? base.gacha : undefined;
        const previousStock = previousGacha && isRecord(previousGacha.stock) ? previousGacha.stock : undefined;

        const nextStock = previousStock ? { ...previousStock } : undefined;
        if (normalized !== null) {
          const ensured = nextStock ?? {};
          ensured.includeOutOfStockInComplete = normalized;
          const nextGacha = {
            ...(previousGacha ?? {}),
            stock: ensured
          };
          return { ...base, gacha: nextGacha };
        }

        if (nextStock) {
          delete nextStock.includeOutOfStockInComplete;
        }

        const hasStockEntries = Boolean(nextStock && Object.keys(nextStock).length > 0);
        const nextGacha = previousGacha ? { ...previousGacha } : undefined;

        if (hasStockEntries && nextGacha) {
          nextGacha['stock'] = nextStock as Record<string, unknown>;
        } else if (nextGacha) {
          delete nextGacha['stock'];
        }

        const hasGachaEntries = Boolean(nextGacha && Object.keys(nextGacha).length > 0);

        const nextState: UiPreferencesStateV3 = {
          ...base,
          ...(hasGachaEntries ? { gacha: nextGacha } : {})
        };

        if (!hasGachaEntries) {
          delete nextState.gacha;
        }

        return nextState;
      },
      { persist: persistMode, emit }
    );
  }

  setGuaranteeOutOfStockItemPreference(
    nextValue: boolean | null | undefined,
    options: UpdateOptions = { persist: 'debounced' }
  ): void {
    const persistMode = options.persist ?? 'debounced';
    const emit = options.emit;
    const normalized = typeof nextValue === 'boolean' ? nextValue : null;

    this.update(
      (previous) => {
        const current = readGuaranteeOutOfStockItemPreference(previous);
        if (current === normalized) {
          return previous;
        }

        const base = ensureState(previous);
        const previousGacha = base.gacha && isRecord(base.gacha) ? base.gacha : undefined;
        const previousStock = previousGacha && isRecord(previousGacha.stock) ? previousGacha.stock : undefined;

        const nextStock = previousStock ? { ...previousStock } : undefined;
        if (normalized !== null) {
          const ensured = nextStock ?? {};
          ensured.allowOutOfStockGuaranteeItem = normalized;
          const nextGacha = {
            ...(previousGacha ?? {}),
            stock: ensured
          };
          return { ...base, gacha: nextGacha };
        }

        if (nextStock) {
          delete nextStock.allowOutOfStockGuaranteeItem;
        }

        const hasStockEntries = Boolean(nextStock && Object.keys(nextStock).length > 0);
        const nextGacha = previousGacha ? { ...previousGacha } : undefined;

        if (hasStockEntries && nextGacha) {
          nextGacha['stock'] = nextStock as Record<string, unknown>;
        } else if (nextGacha) {
          delete nextGacha['stock'];
        }

        const hasGachaEntries = Boolean(nextGacha && Object.keys(nextGacha).length > 0);

        const nextState: UiPreferencesStateV3 = {
          ...base,
          ...(hasGachaEntries ? { gacha: nextGacha } : {})
        };

        if (!hasGachaEntries) {
          delete nextState.gacha;
        }

        return nextState;
      },
      { persist: persistMode, emit }
    );
  }

  getUserFilterPreferences(): UserFilterPreferences {
    return normalizeUserFilterPreferences(this.state?.users && isRecord(this.state.users) ? this.state.users.filter : undefined);
  }

  getUserCardOpenState(userId: string): boolean | null {
    const trimmed = userId.trim();
    if (!trimmed) {
      return null;
    }
    return readUserCardOpenState(this.state, trimmed);
  }

  setUserCardOpenState(
    userId: string,
    open: boolean,
    options: UpdateOptions = { persist: 'debounced' }
  ): void {
    const trimmed = userId.trim();
    if (!trimmed) {
      return;
    }

    const persistMode = options.persist ?? 'debounced';
    const emit = options.emit;

    this.update(
      (previous) => {
        const current = readUserCardOpenState(previous, trimmed);
        if (current === open) {
          return previous;
        }

        const base = ensureState(previous);
        const previousUsers = base.users && isRecord(base.users) ? base.users : {};
        const previousCards = previousUsers.cards && isRecord(previousUsers.cards) ? previousUsers.cards : {};

        return {
          ...base,
          users: {
            ...previousUsers,
            cards: {
              ...previousCards,
              [trimmed]: open
            }
          }
        };
      },
      { persist: persistMode, emit }
    );
  }

  getRiaguCardOpenState(cardId: string): boolean | null {
    const trimmed = cardId.trim();
    if (!trimmed) {
      return null;
    }
    return readRiaguCardOpenState(this.state, trimmed);
  }

  setRiaguCardOpenState(
    cardId: string,
    open: boolean,
    options: UpdateOptions = { persist: 'debounced' }
  ): void {
    const trimmed = cardId.trim();
    if (!trimmed) {
      return;
    }

    const persistMode = options.persist ?? 'debounced';
    const emit = options.emit;

    this.update(
      (previous) => {
        const current = readRiaguCardOpenState(previous, trimmed);
        if (current === open) {
          return previous;
        }

        const base = ensureState(previous);
        const previousRiagu = base.riagu && isRecord(base.riagu) ? base.riagu : {};
        const previousCards = previousRiagu.cards && isRecord(previousRiagu.cards) ? previousRiagu.cards : {};

        return {
          ...base,
          riagu: {
            ...previousRiagu,
            cards: {
              ...previousCards,
              [trimmed]: open
            }
          }
        };
      },
      { persist: persistMode, emit }
    );
  }

  getApplyLowerThresholdGuaranteesPreference(): boolean | null {
    return readApplyLowerThresholdGuaranteesPreference(this.state);
  }

  setApplyLowerThresholdGuaranteesPreference(
    nextValue: boolean | null | undefined,
    options: UpdateOptions = { persist: 'debounced' }
  ): void {
    const persistMode = options.persist ?? 'debounced';
    const emit = options.emit;
    const normalized = typeof nextValue === 'boolean' ? nextValue : null;

    this.update(
      (previous) => {
        const current = readApplyLowerThresholdGuaranteesPreference(previous);
        if (current === normalized) {
          return previous;
        }

        const base = ensureState(previous);
        const previousGacha = base.gacha && isRecord(base.gacha) ? base.gacha : undefined;
        const previousGuarantee = previousGacha && isRecord(previousGacha.guarantee) ? previousGacha.guarantee : undefined;

        const nextGuarantee = previousGuarantee ? { ...previousGuarantee } : undefined;
        if (normalized !== null) {
          const ensured = nextGuarantee ?? {};
          ensured.applyLowerThresholdGuarantees = normalized;
          const nextGacha = {
            ...(previousGacha ?? {}),
            guarantee: ensured
          };
          return { ...base, gacha: nextGacha };
        }

        if (nextGuarantee) {
          delete nextGuarantee.applyLowerThresholdGuarantees;
        }

        const hasGuaranteeEntries = Boolean(nextGuarantee && Object.keys(nextGuarantee).length > 0);
        const nextGacha = previousGacha ? { ...previousGacha } : undefined;

        if (hasGuaranteeEntries && nextGacha) {
          nextGacha['guarantee'] = nextGuarantee as Record<string, unknown>;
        } else if (nextGacha) {
          delete nextGacha['guarantee'];
        }

        const hasGachaEntries = Boolean(nextGacha && Object.keys(nextGacha).length > 0);

        const nextState: UiPreferencesStateV3 = {
          ...base,
          ...(hasGachaEntries ? { gacha: nextGacha } : {})
        };

        if (!hasGachaEntries) {
          delete nextState.gacha;
        }

        return nextState;
      },
      { persist: persistMode, emit }
    );
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
