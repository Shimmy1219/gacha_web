import {
  createDiscordEncryptedStorage,
  createMemoryEncryptedStorageBackend,
  type DecryptFailureEvent,
  type DiscordEncryptedStorage
} from './discordEncryptedStorage';

export const DISCORD_PWA_PENDING_STATE_STORAGE_KEY = 'discord:pwa:pending_state';
export const DISCORD_USER_STATE_STORAGE_PREFIX = 'discord.userState';
export const DISCORD_LEGACY_GUILD_SELECTION_PREFIX = 'discord.guildSelection';
export const DISCORD_LEGACY_MEMBER_CACHE_PREFIX = 'discord.memberCache';

const STORAGE_PREFIXES = [DISCORD_USER_STATE_STORAGE_PREFIX, DISCORD_LEGACY_GUILD_SELECTION_PREFIX, DISCORD_LEGACY_MEMBER_CACHE_PREFIX];
const STORAGE_COLON_PREFIX = 'discord:';

const shouldMigrateKey = (key: string): boolean =>
  STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)) || key.startsWith(STORAGE_COLON_PREFIX);

export interface DiscordInfoStore {
  initialize(): Promise<void>;
  whenReady(): Promise<void>;
  isReady(): boolean;
  getRaw(key: string): string | null;
  getJson<T>(key: string): T | null;
  saveJson<T>(key: string, value: T | null | undefined): Promise<void>;
  remove(key: string): Promise<void>;
  removeByPrefix(prefix: string): Promise<void>;
  clearAll(): Promise<void>;
  onDecryptFailure(listener: (event: DecryptFailureEvent) => void): () => void;
}

class DiscordInfoStoreImpl implements DiscordInfoStore {
  private cache = new Map<string, string>();
  private ready = false;
  private initialization: Promise<void> | null = null;
  private readonly listeners = new Set<(event: DecryptFailureEvent) => void>();

  constructor(private readonly storage: DiscordEncryptedStorage, private readonly logger: Console) {
    storage.onDecryptFailure((event) => {
      this.listeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          this.logger.warn('DiscordInfoStore decrypt listener error', error);
        }
      });
    });
  }

  initialize(): Promise<void> {
    if (this.initialization) {
      return this.initialization;
    }

    this.initialization = (async () => {
      await this.storage.initialize();
      const entries = await this.storage.readAll();
      entries.forEach((value, key) => {
        this.cache.set(key, value);
      });

      await this.migrateLegacyLocalStorage();

      this.ready = true;
    })();

    return this.initialization;
  }

  whenReady(): Promise<void> {
    return this.initialize();
  }

  isReady(): boolean {
    return this.ready;
  }

  getRaw(key: string): string | null {
    return this.cache.get(key) ?? null;
  }

  getJson<T>(key: string): T | null {
    const raw = this.getRaw(key);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn('DiscordInfoStore failed to parse cached value', error);
      return null;
    }
  }

  async saveJson<T>(key: string, value: T | null | undefined): Promise<void> {
    if (value === null || typeof value === 'undefined') {
      await this.remove(key);
      return;
    }

    const raw = JSON.stringify(value);
    this.cache.set(key, raw);
    try {
      await this.storage.save(key, raw);
    } catch (error) {
      this.logger.warn('DiscordInfoStore failed to persist value', error);
    }
  }

  async remove(key: string): Promise<void> {
    this.cache.delete(key);
    try {
      await this.storage.remove(key);
    } catch (error) {
      this.logger.warn('DiscordInfoStore failed to remove value', error);
    }
  }

  async removeByPrefix(prefix: string): Promise<void> {
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }

    try {
      await this.storage.removeByPrefix(prefix);
    } catch (error) {
      this.logger.warn('DiscordInfoStore failed to remove values by prefix', error);
    }
  }

  async clearAll(): Promise<void> {
    this.cache.clear();
    try {
      await this.storage.clearAll();
    } catch (error) {
      this.logger.warn('DiscordInfoStore failed to clear storage', error);
    }
  }

  onDecryptFailure(listener: (event: DecryptFailureEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async migrateLegacyLocalStorage(): Promise<void> {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }

    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && shouldMigrateKey(key)) {
        keys.push(key);
      }
    }

    for (const key of keys) {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        continue;
      }

      try {
        JSON.parse(raw);
      } catch (error) {
        this.logger.warn('DiscordInfoStore skipped invalid legacy localStorage value', error);
        continue;
      }

      if (!this.cache.has(key)) {
        try {
          await this.storage.save(key, raw);
          this.cache.set(key, raw);
        } catch (error) {
          this.logger.warn('DiscordInfoStore failed to migrate localStorage value', error);
          continue;
        }
      }

      try {
        window.localStorage.removeItem(key);
      } catch (error) {
        this.logger.warn('DiscordInfoStore failed to remove legacy localStorage value', error);
      }
    }
  }
}

export const createDiscordInfoStore = (options?: {
  storage?: DiscordEncryptedStorage;
  logger?: Console;
}): DiscordInfoStore =>
  new DiscordInfoStoreImpl(
    options?.storage ??
      createDiscordEncryptedStorage({
        backend: typeof indexedDB === 'undefined' ? createMemoryEncryptedStorageBackend() : undefined
      }),
    options?.logger ?? console
  );

let storeSingleton: DiscordInfoStore | null = null;

export const getDiscordInfoStore = (): DiscordInfoStore => {
  if (!storeSingleton) {
    storeSingleton = createDiscordInfoStore();
  }
  return storeSingleton;
};

export const initializeDiscordInfoStore = (): Promise<void> => getDiscordInfoStore().initialize();

export const onDiscordInfoStoreDecryptFailure = (
  listener: (event: DecryptFailureEvent) => void
): (() => void) => getDiscordInfoStore().onDecryptFailure(listener);
