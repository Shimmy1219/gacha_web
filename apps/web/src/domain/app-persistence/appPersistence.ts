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
  type UserInventorySnapshotV3,
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

const USER_INVENTORY_INDEX_KEY = 'gacha:user-inventories:index:v3';
const USER_INVENTORY_USER_KEY_PREFIX = 'gacha:user-inventories:user:v3:';

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
      userInventories: this.loadUserInventories(),
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
      this.clearUserInventoryEntries(storage);
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

  private loadUserInventories(): UserInventoriesStateV3 | undefined {
    const storage = this.ensureStorage();
    if (!storage) {
      return undefined;
    }

    const index = this.readUserInventoryIndex(storage);
    if (!index) {
      return this.readJson<UserInventoriesStateV3>('userInventories');
    }

    const inventories: UserInventoriesStateV3['inventories'] = {};
    const byItemId: UserInventoriesStateV3['byItemId'] = {};

    index.users.forEach((userId) => {
      const raw = storage.getItem(this.userInventoryStorageKey(userId));
      if (!raw) {
        return;
      }

      try {
        const parsed = JSON.parse(raw) as {
          version?: number;
          updatedAt?: string;
          inventories?: Record<string, UserInventorySnapshotV3>;
          byItemId?: Record<
            string,
            Array<{
              gachaId: string;
              rarityId: string;
              count: number;
            }>
          >;
        };

        if (parsed.inventories && Object.keys(parsed.inventories).length > 0) {
          inventories[userId] = parsed.inventories;
        }

        if (parsed.byItemId) {
          this.mergeUserByItemEntries(byItemId, parsed.byItemId, userId);
        }
      } catch (error) {
        console.warn(
          `Failed to parse segmented user inventory for ${this.userInventoryStorageKey(userId)}`,
          error
        );
      }
    });

    if (Object.keys(inventories).length === 0 && Object.keys(byItemId).length === 0) {
      console.info(
        '【デバッグ】分割保存されたユーザー在庫が空のため、旧フォーマットの一括保存キーから読み込みます',
        {
          インデックスキー: USER_INVENTORY_INDEX_KEY,
          一括保存キー: STORAGE_KEYS.userInventories
        }
      );
      return this.readJson<UserInventoriesStateV3>('userInventories');
    }

    return {
      version: typeof index.version === 'number' ? index.version : 3,
      updatedAt: typeof index.updatedAt === 'string' ? index.updatedAt : new Date().toISOString(),
      inventories,
      byItemId
    } satisfies UserInventoriesStateV3;
  }

  private persistValue(key: StorageKey, value: unknown): void {
    const storage = this.ensureStorage();
    if (!storage) {
      return;
    }

    if (key === 'userInventories') {
      this.persistUserInventories(value as UserInventoriesStateV3 | undefined);
      return;
    }

    const storageKey = STORAGE_KEYS[key];
    const hasValue = typeof value !== 'undefined';
    if (!hasValue) {
      storage.removeItem(storageKey);
    } else {
      const description = this.describeStorageKey(key);
      const serialized = this.serializeForPersistence(value, description);
      this.writeToStorage(storage, storageKey, serialized, description);
    }

    const label = STORAGE_KEY_LABELS[key];
    if (label) {
      console.info(`【デバッグ】${label}をローカルストレージに${hasValue ? '保存しました' : '削除しました'}`, {
        ストレージキー: storageKey,
        永続化状態: hasValue ? '保存済み' : '未保存'
      });
    }
  }

  private persistUserInventories(state: UserInventoriesStateV3 | undefined): void {
    const storage = this.ensureStorage();
    if (!storage) {
      return;
    }

    const description = this.describeStorageKey('userInventories');
    const previousIndex = this.readUserInventoryIndex(storage);
    const existingUsers = previousIndex?.users ?? [];

    if (!state || !state.inventories || Object.keys(state.inventories).length === 0) {
      this.clearUserInventoryEntries(storage, existingUsers);
      console.info(`【デバッグ】ユーザー在庫をローカルストレージから削除しました`, {
        インデックスキー: USER_INVENTORY_INDEX_KEY,
        削除対象ユーザー数: existingUsers.length
      });
      return;
    }

    const userIds = Object.keys(state.inventories).filter(Boolean);
    const serializedIndex = this.serializeForPersistence(
      {
        version: typeof state.version === 'number' ? state.version : 3,
        updatedAt: state.updatedAt,
        users: userIds
      },
      `${description}のインデックス`
    );

    this.writeToStorage(storage, USER_INVENTORY_INDEX_KEY, serializedIndex, `${description}のインデックス`);

    const staleUsers = existingUsers.filter((userId) => !userIds.includes(userId));
    this.clearUserInventoryEntries(storage, staleUsers, false);

    userIds.forEach((userId) => {
      const perUserPayload = {
        version: typeof state.version === 'number' ? state.version : 3,
        updatedAt: state.updatedAt,
        inventories: state.inventories?.[userId] ?? {},
        byItemId: this.extractUserByItemEntries(state.byItemId, userId)
      };

      const serialized = this.serializeForPersistence(
        perUserPayload,
        `${description}:${userId}`
      );
      this.writeToStorage(
        storage,
        this.userInventoryStorageKey(userId),
        serialized,
        `${description}:${userId}`
      );
    });

    storage.removeItem(STORAGE_KEYS.userInventories);

    console.info(`【デバッグ】ユーザー在庫をローカルストレージに保存しました`, {
      インデックスキー: USER_INVENTORY_INDEX_KEY,
      ユーザー数: userIds.length
    });
  }

  private describeStorageKey(key: StorageKey): string {
    const label = STORAGE_KEY_LABELS[key];
    const storageKey = STORAGE_KEYS[key];
    return label ? `${storageKey}（${label}）` : storageKey;
  }

  private serializeForPersistence(value: unknown, description: string): string {
    try {
      return JSON.stringify(value);
    } catch (error) {
      if (this.isInvalidStringLengthError(error)) {
        throw new Error(
          `保存対象データが大きすぎるため ${description} を文字列化できませんでした。データ量を減らしてから再度お試しください。`
        );
      }
      throw error;
    }
  }

  private writeToStorage(storage: StorageLike, storageKey: string, serialized: string, description: string): void {
    try {
      storage.setItem(storageKey, serialized);
    } catch (error) {
      if (this.isQuotaExceededError(error)) {
        const sizeKb = Math.round(serialized.length / 1024);
        throw new Error(
          `ローカルストレージの容量を超えたため ${description} を保存できませんでした。` +
            ` 保存対象データの概算サイズは約${sizeKb}KBです。不要なデータを削除してから再度お試しください。`
        );
      }
      throw error;
    }
  }

  private readUserInventoryIndex(storage: StorageLike): { version?: number; updatedAt?: string; users: string[] } | null {
    const raw = storage.getItem(USER_INVENTORY_INDEX_KEY);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as Record<string, unknown>).users)
      ) {
        const users = (parsed as { users?: unknown }).users as string[];
        return { ...parsed, users: users.filter(Boolean) };
      }
    } catch (error) {
      console.warn(`Failed to parse user inventory index for key ${USER_INVENTORY_INDEX_KEY}`, error);
    }

    return null;
  }

  private userInventoryStorageKey(userId: string): string {
    return `${USER_INVENTORY_USER_KEY_PREFIX}${encodeURIComponent(userId)}`;
  }

  private extractUserByItemEntries(
    byItemId: UserInventoriesStateV3['byItemId'] | undefined,
    userId: string
  ): Record<string, Array<{ gachaId: string; rarityId: string; count: number }>> {
    if (!byItemId) {
      return {};
    }

    const result: Record<string, Array<{ gachaId: string; rarityId: string; count: number }>> = {};

    Object.entries(byItemId).forEach(([itemId, entries]) => {
      if (!entries) {
        return;
      }

      const userEntries = entries
        .filter((entry) => entry?.userId === userId)
        .map((entry) => ({ gachaId: entry.gachaId, rarityId: entry.rarityId, count: entry.count }));

      if (userEntries.length > 0) {
        result[itemId] = userEntries;
      }
    });

    return result;
  }

  private mergeUserByItemEntries(
    target: UserInventoriesStateV3['byItemId'],
    source: Record<string, Array<{ gachaId: string; rarityId: string; count: number }>>,
    userId: string
  ): void {
    Object.entries(source).forEach(([itemId, entries]) => {
      if (!entries) {
        return;
      }

      const nextEntries = target[itemId] ?? [];
      entries.forEach((entry) => {
        if (entry) {
          nextEntries.push({ ...entry, userId });
        }
      });

      if (nextEntries.length > 0) {
        target[itemId] = nextEntries;
      }
    });
  }

  private clearUserInventoryEntries(
    storage: StorageLike,
    userIds: string[] = [],
    removeIndex = true
  ): void {
    const index = userIds.length > 0 ? { users: userIds } : this.readUserInventoryIndex(storage);
    const users = index?.users ?? [];

    users.forEach((userId) => {
      storage.removeItem(this.userInventoryStorageKey(userId));
    });

    if (removeIndex) {
      storage.removeItem(USER_INVENTORY_INDEX_KEY);
      storage.removeItem(STORAGE_KEYS.userInventories);
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

  private isQuotaExceededError(error: unknown): boolean {
    if (error instanceof DOMException) {
      return error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014;
    }

    if (error && typeof error === 'object' && 'name' in error && typeof error.name === 'string') {
      return error.name === 'QuotaExceededError';
    }

    return false;
  }

  private isInvalidStringLengthError(error: unknown): boolean {
    if (!(error instanceof RangeError)) {
      return false;
    }

    return typeof error.message === 'string' && error.message.includes('Invalid string length');
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
