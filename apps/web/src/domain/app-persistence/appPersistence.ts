import {
  type GachaCatalogItemV3,
  type GachaCatalogStateV3,
  type GachaLocalStorageSnapshot,
  type PtSettingsStateV3,
  type ReceiveHistoryStateV3,
  type ReceivePrefsStateV3,
  type RiaguStateV3,
  type SaveOptionsSnapshotV3,
  type UiPreferencesStateV3,
  type UserInventoriesStateV3,
  type UserProfilesStateV3,
  type GachaAppStateV3,
  type GachaRarityStateV3,
  type HitCountsStateV3,
  type PullHistoryStateV1
} from './types';

export const GACHA_STORAGE_UPDATED_EVENT = 'gacha-storage:updated' as const;

export const STORAGE_KEYS = {
  appState: 'gacha:app-state:v3',
  catalogState: 'gacha:catalog-state:v3',
  rarityState: 'gacha:rarity-state:v3',
  userInventories: 'gacha:user-inventories:v3',
  userProfiles: 'gacha:user-profiles:v3',
  hitCounts: 'gacha:hit-counts:v3',
  riaguState: 'gacha:riagu-state:v3',
  ptSettings: 'gacha:pt-settings:v3',
  uiPreferences: 'gacha:ui-preferences:v3',
  receiveHistory: 'gacha:receive:history:v3',
  receivePrefs: 'gacha:receive:prefs:v3',
  pullHistory: 'gacha:pull-history:v1'
} as const;

type StorageKey = keyof typeof STORAGE_KEYS;

const STORAGE_KEY_LABELS: Partial<Record<StorageKey, string>> = {
  userInventories: 'ユーザー在庫',
  userProfiles: 'ユーザープロフィール',
  pullHistory: 'ガチャ履歴'
};

const SAVE_OPTIONS_STORAGE_KEY = 'gacha:save-options:last-upload:v3';

export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AppPersistenceOptions {
  storage?: StorageLike | null;
  eventTarget?: EventTarget | null;
  debounceMs?: number;
}

export type SaveOptionsPartial = Record<string, SaveOptionsSnapshotV3 | null | undefined>;

export interface PersistPartialSnapshot
  extends Partial<Omit<GachaLocalStorageSnapshot, 'saveOptions'>> {
  saveOptions?: SaveOptionsPartial | null;
}

export class AppPersistence {
  private storage: StorageLike | null;

  private eventTarget: EventTarget | null;

  private readonly debounceMs: number;

  private pending: PersistPartialSnapshot | null = null;

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: AppPersistenceOptions = {}) {
    const fallbackStorage =
      typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
        ? window.localStorage
        : null;
    this.storage = options.storage ?? fallbackStorage;

    const fallbackEventTarget = typeof window !== 'undefined' ? window : null;
    this.eventTarget = options.eventTarget ?? fallbackEventTarget;

    this.debounceMs = typeof options.debounceMs === 'number' ? options.debounceMs : 250;
  }

  loadSnapshot(): GachaLocalStorageSnapshot {
    return {
      appState: this.readJson<GachaAppStateV3>('appState'),
      catalogState: this.readJson<GachaCatalogStateV3>('catalogState'),
      rarityState: this.readJson<GachaRarityStateV3>('rarityState'),
      userInventories: this.readJson<UserInventoriesStateV3>('userInventories'),
      userProfiles: this.readJson<UserProfilesStateV3>('userProfiles'),
      hitCounts: this.readJson<HitCountsStateV3>('hitCounts'),
      riaguState: this.readJson<RiaguStateV3>('riaguState'),
      ptSettings: this.readJson<PtSettingsStateV3>('ptSettings'),
      uiPreferences: this.readJson<UiPreferencesStateV3>('uiPreferences'),
      receiveHistory: this.readJson<ReceiveHistoryStateV3>('receiveHistory'),
      receivePrefs: this.readJson<ReceivePrefsStateV3>('receivePrefs'),
      pullHistory: this.readJson<PullHistoryStateV1>('pullHistory'),
      saveOptions: this.collectSaveOptions()
    };
  }

  saveSnapshot(snapshot: GachaLocalStorageSnapshot): void {
    if (!this.ensureStorage()) {
      return;
    }

    this.persistValue('appState', snapshot.appState);
    this.persistValue('catalogState', snapshot.catalogState);
    this.persistValue('rarityState', snapshot.rarityState);
    this.persistValue('userInventories', snapshot.userInventories);
    this.persistValue('userProfiles', snapshot.userProfiles);
    this.persistValue('hitCounts', snapshot.hitCounts);
    this.persistValue('riaguState', snapshot.riaguState);
    this.persistValue('ptSettings', snapshot.ptSettings);
    this.persistValue('uiPreferences', snapshot.uiPreferences);
    this.persistValue('receiveHistory', snapshot.receiveHistory);
    this.persistValue('receivePrefs', snapshot.receivePrefs);
    this.persistValue('pullHistory', snapshot.pullHistory);

    this.replaceSaveOptions(snapshot.saveOptions ?? null);

    this.emitUpdated();
  }

  savePartial(partial: PersistPartialSnapshot): void {
    if (!this.ensureStorage()) {
      this.pending = this.mergePending(this.pending, partial);
      this.scheduleRetry();
      return;
    }

    let touched = false;

    if (Object.prototype.hasOwnProperty.call(partial, 'appState')) {
      this.persistValue('appState', partial.appState as GachaAppStateV3 | undefined);
      touched = true;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'catalogState')) {
      this.persistValue('catalogState', partial.catalogState as GachaCatalogStateV3 | undefined);
      touched = true;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'rarityState')) {
      this.persistValue('rarityState', partial.rarityState as GachaRarityStateV3 | undefined);
      touched = true;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'userInventories')) {
      this.persistValue('userInventories', partial.userInventories as UserInventoriesStateV3 | undefined);
      touched = true;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'userProfiles')) {
      this.persistValue('userProfiles', partial.userProfiles as UserProfilesStateV3 | undefined);
      touched = true;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'hitCounts')) {
      this.persistValue('hitCounts', partial.hitCounts as HitCountsStateV3 | undefined);
      touched = true;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'riaguState')) {
      this.persistValue('riaguState', partial.riaguState as RiaguStateV3 | undefined);
      touched = true;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'ptSettings')) {
      this.persistValue('ptSettings', partial.ptSettings as PtSettingsStateV3 | undefined);
      touched = true;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'uiPreferences')) {
      this.persistValue('uiPreferences', partial.uiPreferences as UiPreferencesStateV3 | undefined);
      touched = true;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'receiveHistory')) {
      this.persistValue('receiveHistory', partial.receiveHistory as ReceiveHistoryStateV3 | undefined);
      touched = true;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'receivePrefs')) {
      this.persistValue('receivePrefs', partial.receivePrefs as ReceivePrefsStateV3 | undefined);
      touched = true;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'pullHistory')) {
      this.persistValue('pullHistory', partial.pullHistory as PullHistoryStateV1 | undefined);
      touched = true;
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'saveOptions')) {
      this.mergeSaveOptions(partial.saveOptions);
      touched = true;
    }

    if (touched) {
      this.emitUpdated();
    }
  }

  saveAppState(state: GachaAppStateV3 | undefined): void {
    this.savePartial({ appState: state });
  }

  saveAppStateDebounced(state: GachaAppStateV3 | undefined): void {
    this.saveDebounced({ appState: state });
  }

  saveCatalogState(state: GachaCatalogStateV3 | undefined): void {
    this.savePartial({ catalogState: state });
  }

  saveCatalogStateDebounced(state: GachaCatalogStateV3 | undefined): void {
    this.saveDebounced({ catalogState: state });
  }

  saveRarityState(state: GachaRarityStateV3 | undefined): void {
    this.savePartial({ rarityState: state });
  }

  saveRarityStateDebounced(state: GachaRarityStateV3 | undefined): void {
    this.saveDebounced({ rarityState: state });
  }

  saveUserInventories(state: UserInventoriesStateV3 | undefined): void {
    this.savePartial({ userInventories: state });
  }

  saveUserInventoriesDebounced(state: UserInventoriesStateV3 | undefined): void {
    this.saveDebounced({ userInventories: state });
  }

  saveUserProfiles(state: UserProfilesStateV3 | undefined): void {
    this.savePartial({ userProfiles: state });
  }

  saveUserProfilesDebounced(state: UserProfilesStateV3 | undefined): void {
    this.saveDebounced({ userProfiles: state });
  }

  saveHitCounts(state: HitCountsStateV3 | undefined): void {
    this.savePartial({ hitCounts: state });
  }

  saveHitCountsDebounced(state: HitCountsStateV3 | undefined): void {
    this.saveDebounced({ hitCounts: state });
  }

  saveRiaguState(state: RiaguStateV3 | undefined): void {
    this.savePartial({ riaguState: state });
  }

  saveRiaguStateDebounced(state: RiaguStateV3 | undefined): void {
    this.saveDebounced({ riaguState: state });
  }

  savePtSettings(state: PtSettingsStateV3 | undefined): void {
    this.savePartial({ ptSettings: state });
  }

  savePtSettingsDebounced(state: PtSettingsStateV3 | undefined): void {
    this.saveDebounced({ ptSettings: state });
  }

  saveUiPreferences(state: UiPreferencesStateV3 | undefined): void {
    this.savePartial({ uiPreferences: state });
  }

  saveUiPreferencesDebounced(state: UiPreferencesStateV3 | undefined): void {
    this.saveDebounced({ uiPreferences: state });
  }

  saveReceiveHistory(state: ReceiveHistoryStateV3 | undefined): void {
    this.savePartial({ receiveHistory: state });
  }

  saveReceiveHistoryDebounced(state: ReceiveHistoryStateV3 | undefined): void {
    this.saveDebounced({ receiveHistory: state });
  }

  saveReceivePrefs(state: ReceivePrefsStateV3 | undefined): void {
    this.savePartial({ receivePrefs: state });
  }

  saveReceivePrefsDebounced(state: ReceivePrefsStateV3 | undefined): void {
    this.saveDebounced({ receivePrefs: state });
  }

  savePullHistory(state: PullHistoryStateV1 | undefined): void {
    this.savePartial({ pullHistory: state });
  }

  savePullHistoryDebounced(state: PullHistoryStateV1 | undefined): void {
    this.saveDebounced({ pullHistory: state });
  }

  clearAllData(): void {
    this.pending = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const storage = this.ensureStorage();
    if (!storage) {
      throw new Error('Local storage is unavailable');
    }

    try {
      Object.values(STORAGE_KEYS).forEach((key) => {
        storage.removeItem(key);
      });
      storage.removeItem(SAVE_OPTIONS_STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear application storage', error);
      throw error instanceof Error
        ? error
        : new Error('Failed to clear application storage');
    }

    this.emitUpdated();
  }

  saveDebounced(partial: PersistPartialSnapshot = {}): void {
    this.pending = this.mergePending(this.pending, partial);

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      const payload = this.pending;
      this.pending = null;
      if (payload) {
        this.savePartial(payload);
      }
    }, this.debounceMs);
  }

  flushPending(): void {
    if (!this.pending) {
      return;
    }

    const payload = this.pending;
    this.pending = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.savePartial(payload);
  }

  updateCatalogItem(params: {
    gachaId: string;
    itemId: string;
    patch: Partial<GachaCatalogItemV3>;
    updatedAt?: string;
  }): void {
    if (!this.ensureStorage()) {
      throw new Error('Storage is not available');
    }

    const { gachaId, itemId, patch, updatedAt } = params;
    if (!gachaId || !itemId) {
      throw new Error('gachaId and itemId are required');
    }

    const snapshot = this.loadSnapshot();
    const catalogState = snapshot.catalogState;
    if (!catalogState) {
      throw new Error('Catalog state is not available');
    }

    const gachaCatalog = catalogState.byGacha?.[gachaId];
    if (!gachaCatalog) {
      throw new Error(`Catalog for gacha ${gachaId} was not found`);
    }

    const currentItem = gachaCatalog.items?.[itemId];
    if (!currentItem) {
      throw new Error(`Item ${itemId} was not found in catalog ${gachaId}`);
    }

    const timestamp = updatedAt ?? new Date().toISOString();

    const nextItem: GachaCatalogItemV3 = {
      ...currentItem,
      ...patch,
      itemId: currentItem.itemId,
      rarityId: patch.rarityId ?? currentItem.rarityId,
      name: patch.name ?? currentItem.name,
      updatedAt: timestamp
    };

    const nextCatalogState: GachaCatalogStateV3 = {
      ...catalogState,
      updatedAt: timestamp,
      byGacha: {
        ...catalogState.byGacha,
        [gachaId]: {
          ...gachaCatalog,
          items: {
            ...gachaCatalog.items,
            [itemId]: nextItem
          }
        }
      }
    };

    this.savePartial({ catalogState: nextCatalogState });
  }

  private readJson<T>(key: StorageKey): T | undefined {
    const storage = this.ensureStorage();
    if (!storage) {
      return undefined;
    }

    const storageKey = STORAGE_KEYS[key];
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return undefined;
    }

    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      console.warn(`Failed to parse localStorage value for ${storageKey}`, error);
      return undefined;
    }
  }

  private persistValue(key: StorageKey, value: unknown): void {
    const storage = this.ensureStorage();
    if (!storage) {
      return;
    }

    const storageKey = STORAGE_KEYS[key];
    const hasValue = typeof value !== 'undefined';
    if (!hasValue) {
      storage.removeItem(storageKey);
    } else {
      storage.setItem(storageKey, JSON.stringify(value));
    }

    const label = STORAGE_KEY_LABELS[key];
    if (label) {
      console.info(`【デバッグ】${label}をローカルストレージに${hasValue ? '保存しました' : '削除しました'}`, {
        ストレージキー: storageKey,
        永続化状態: hasValue ? '保存済み' : '未保存'
      });
    }
  }

  private collectSaveOptions(): Record<string, SaveOptionsSnapshotV3> {
    const storage = this.ensureStorage();
    if (!storage) {
      return {};
    }

    return this.readSaveOptionsMap(storage);
  }

  private replaceSaveOptions(map: Record<string, SaveOptionsSnapshotV3> | null): void {
    const storage = this.ensureStorage();
    if (!storage) {
      return;
    }

    if (!map) {
      this.clearSaveOptions();
      return;
    }

    const next: Record<string, SaveOptionsSnapshotV3> = {};
    Object.entries(map).forEach(([userId, value]) => {
      if (!userId || value === null || typeof value === 'undefined') {
        return;
      }

      next[userId] = value;
    });

    this.persistSaveOptionsMap(storage, next);
  }

  private mergeSaveOptions(map: SaveOptionsPartial | null | undefined): void {
    const storage = this.ensureStorage();
    if (!storage) {
      return;
    }

    if (map === null) {
      this.clearSaveOptions();
      return;
    }

    if (typeof map === 'undefined') {
      return;
    }

    const current = this.readSaveOptionsMap(storage);
    const next: Record<string, SaveOptionsSnapshotV3> = { ...current };

    Object.entries(map).forEach(([userId, value]) => {
      if (!userId) {
        return;
      }

      if (value === null) {
        delete next[userId];
      } else if (typeof value !== 'undefined') {
        next[userId] = value;
      }
    });

    this.persistSaveOptionsMap(storage, next);
  }

  private clearSaveOptions(): void {
    const storage = this.ensureStorage();
    if (!storage) {
      return;
    }

    storage.removeItem(SAVE_OPTIONS_STORAGE_KEY);
  }

  private readSaveOptionsMap(storage: StorageLike): Record<string, SaveOptionsSnapshotV3> {
    const raw = storage.getItem(SAVE_OPTIONS_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, SaveOptionsSnapshotV3>;
      }
    } catch (error) {
      console.warn(`Failed to parse save options for key ${SAVE_OPTIONS_STORAGE_KEY}`, error);
    }

    return {};
  }

  private persistSaveOptionsMap(
    storage: StorageLike,
    map: Record<string, SaveOptionsSnapshotV3>
  ): void {
    if (Object.keys(map).length === 0) {
      storage.removeItem(SAVE_OPTIONS_STORAGE_KEY);
      return;
    }

    storage.setItem(SAVE_OPTIONS_STORAGE_KEY, JSON.stringify(map));
  }

  private emitUpdated(): void {
    const target = this.ensureEventTarget();
    if (!target) {
      return;
    }

    if (typeof Event === 'function') {
      target.dispatchEvent(new Event(GACHA_STORAGE_UPDATED_EVENT));
    }
  }

  private ensureStorage(): StorageLike | null {
    if (this.storage) {
      return this.storage;
    }

    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      this.storage = window.localStorage;
    }

    return this.storage;
  }

  private ensureEventTarget(): EventTarget | null {
    if (this.eventTarget) {
      return this.eventTarget;
    }

    if (typeof window !== 'undefined') {
      this.eventTarget = window;
    }

    return this.eventTarget;
  }

  private scheduleRetry(): void {
    if (!this.pending) {
      return;
    }

    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      const payload = this.pending;
      this.pending = null;
      if (payload) {
        this.savePartial(payload);
      }
    }, this.debounceMs);
  }

  private mergePending(
    current: PersistPartialSnapshot | null,
    next: PersistPartialSnapshot
  ): PersistPartialSnapshot {
    if (!current) {
      return { ...next };
    }

    const merged: PersistPartialSnapshot = { ...current };

    const assign = <K extends keyof PersistPartialSnapshot>(key: K, value: PersistPartialSnapshot[K]) => {
      merged[key] = value;
    };

    (Object.keys(next) as Array<keyof PersistPartialSnapshot>).forEach((key) => {
      if (key === 'saveOptions') {
        const previous = merged.saveOptions ?? undefined;
        const addition = next.saveOptions;
        if (addition === null) {
          merged.saveOptions = null;
        } else if (typeof addition === 'undefined') {
          return;
        } else if (Array.isArray(addition)) {
          merged.saveOptions = addition;
        } else if (addition) {
          const base = previous && previous !== null ? { ...previous } : {};
          merged.saveOptions = { ...base, ...addition };
        }
      } else {
        assign(key, next[key]);
      }
    });

    return merged;
  }
}
