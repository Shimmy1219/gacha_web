import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';

import {
  createDiscordEncryptedStorage,
  createMemoryEncryptedStorageBackend
} from '../discordEncryptedStorage';
import {
  createDiscordInfoStore,
  DISCORD_PWA_PENDING_STATE_STORAGE_KEY
} from '../discordInfoStore';

class MemoryLocalStorage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

beforeAll(() => {
  if (!globalThis.crypto) {
    Object.defineProperty(globalThis, 'crypto', {
      value: webcrypto
    });
  }
});

afterEach(() => {
  const globalWithWindow = globalThis as typeof globalThis & { window?: unknown };
  if (globalWithWindow.window) {
    delete globalWithWindow.window;
  }
});

describe('discordInfoStore', () => {
  it('stores and loads discord user state via the store', async () => {
    const storage = createDiscordEncryptedStorage({
      backend: createMemoryEncryptedStorageBackend(),
      crypto: globalThis.crypto
    });
    const store = createDiscordInfoStore({ storage });
    await store.initialize();

    const key = 'discord.userState::user-1';
    const payload = {
      selection: {
        guildId: 'guild-1',
        guildName: 'Test Guild'
      },
      memberCache: {
        'guild-1': {
          members: [
            { id: 'member-1', username: 'test', displayName: 'Test User' }
          ],
          updatedAt: '2026-01-29T00:00:00.000Z'
        }
      }
    };

    await store.saveJson(key, payload);

    const loaded = store.getJson<typeof payload>(key);
    expect(loaded).toEqual(payload);
  });

  it('stores and loads PWA pending state via the store', async () => {
    const storage = createDiscordEncryptedStorage({
      backend: createMemoryEncryptedStorageBackend(),
      crypto: globalThis.crypto
    });
    const store = createDiscordInfoStore({ storage });
    await store.initialize();

    const pending = { state: 'dummy-state', createdAt: 123456 };
    await store.saveJson(DISCORD_PWA_PENDING_STATE_STORAGE_KEY, pending);

    const loaded = store.getJson<typeof pending>(DISCORD_PWA_PENDING_STATE_STORAGE_KEY);
    expect(loaded).toEqual(pending);
  });

  it('migrates legacy localStorage values into encrypted storage', async () => {
    const localStorage = new MemoryLocalStorage();
    localStorage.setItem(
      'discord.userState::legacy-user',
      JSON.stringify({ selection: { guildId: 'legacy-guild', guildName: 'Legacy Guild' } })
    );
    localStorage.setItem(
      DISCORD_PWA_PENDING_STATE_STORAGE_KEY,
      JSON.stringify({ state: 'legacy-state', createdAt: 999 })
    );

    const globalWithWindow = globalThis as typeof globalThis & { window?: { localStorage: MemoryLocalStorage } };
    globalWithWindow.window = { localStorage };

    const storage = createDiscordEncryptedStorage({
      backend: createMemoryEncryptedStorageBackend(),
      crypto: globalThis.crypto
    });
    const store = createDiscordInfoStore({ storage });
    await store.initialize();

    expect(localStorage.length).toBe(0);
    expect(store.getJson('discord.userState::legacy-user')).toEqual({
      selection: { guildId: 'legacy-guild', guildName: 'Legacy Guild' }
    });
    expect(store.getJson(DISCORD_PWA_PENDING_STATE_STORAGE_KEY)).toEqual({ state: 'legacy-state', createdAt: 999 });

    const encrypted = await storage.readAll();
    expect(encrypted.has('discord.userState::legacy-user')).toBe(true);
    expect(encrypted.has(DISCORD_PWA_PENDING_STATE_STORAGE_KEY)).toBe(true);
  });
});
