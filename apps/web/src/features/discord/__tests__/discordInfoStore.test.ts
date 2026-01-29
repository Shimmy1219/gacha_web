import { beforeAll, describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';

import {
  createDiscordEncryptedStorage,
  createMemoryEncryptedStorageBackend
} from '../discordEncryptedStorage';
import {
  createDiscordInfoStore,
  DISCORD_PWA_PENDING_STATE_STORAGE_KEY
} from '../discordInfoStore';

beforeAll(() => {
  if (!globalThis.crypto) {
    Object.defineProperty(globalThis, 'crypto', {
      value: webcrypto
    });
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
});
