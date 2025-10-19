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
        const previousFilterSnapshot: Record<string, unknown> = isRecord(previousFilterRaw)
          ? { ...previousFilterRaw }
          : {};
        if ('keyword' in previousFilterSnapshot) {
          delete previousFilterSnapshot.keyword;
        }

        const nextUsers = {
          ...previousUsers,
          filter: {
            ...previousFilterSnapshot,
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
