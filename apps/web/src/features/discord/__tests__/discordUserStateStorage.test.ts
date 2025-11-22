import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../discordUserStateCrypto', () => ({
  encryptDiscordUserState: vi.fn(async (payload: unknown) => JSON.stringify(payload)),
  decryptDiscordUserState: vi.fn(async (serialized: string) => JSON.parse(serialized)),
  resetCachedDiscordUserStateKey: vi.fn(),
  DiscordUserStateCryptoError: class MockCryptoError extends Error {
    constructor(message: string, public readonly recovery?: string) {
      super(message);
      this.name = 'DiscordUserStateCryptoError';
    }
  },
}));

import { initializeDiscordUserState, loadDiscordUserState, updateDiscordUserState } from '../discordUserStateStorage';

const sessionStore = new Map<string, string>();
const mockSessionStorage = {
  get length() {
    return sessionStore.size;
  },
  clear: () => sessionStore.clear(),
  getItem: (key: string) => sessionStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    sessionStore.set(key, value);
  },
  removeItem: (key: string) => {
    sessionStore.delete(key);
  },
  key: (index: number) => Array.from(sessionStore.keys())[index] ?? null,
};

const localStore = new Map<string, string>();
const mockLocalStorage = {
  get length() {
    return localStore.size;
  },
  clear: () => localStore.clear(),
  getItem: (key: string) => localStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    localStore.set(key, value);
  },
  removeItem: (key: string) => {
    localStore.delete(key);
  },
  key: (index: number) => Array.from(localStore.keys())[index] ?? null,
};

beforeEach(() => {
  sessionStore.clear();
  localStore.clear();
  (globalThis as any).fetch = vi.fn();
  Object.assign(globalThis, {
    window: {
      sessionStorage: mockSessionStorage,
      localStorage: mockLocalStorage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      clearTimeout,
      setTimeout,
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('discordUserStateStorage', () => {
  it('migrates legacy localStorage state to server and clears the legacy key', async () => {
    localStore.set('discord.userState', JSON.stringify({ selection: { guildId: 'legacy' } }));

    (fetch as unknown as vi.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, state: { selection: { guildId: 'legacy' } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, state: { selection: { guildId: 'server' } } }),
      });

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const state = await initializeDiscordUserState('legacy-user', { maxRetries: 0 });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/discord/user-state',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/discord/user-state',
      expect.objectContaining({ method: 'GET' })
    );
    expect(localStore.has('discord.userState')).toBe(false);
    expect(state).toEqual({ selection: { guildId: 'server' } });
    expect(infoSpy).toHaveBeenCalledWith(
      'Migrated legacy Discord user state from localStorage to server storage.'
    );
  });

  it('drops invalid legacy localStorage state and continues initialization', async () => {
    localStore.set('discord.userState', '{invalid-json');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    (fetch as unknown as vi.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, state: { selection: { guildId: 'from-server' } } }),
    });

    const state = await initializeDiscordUserState('user-invalid', { maxRetries: 0 });

    expect(localStore.has('discord.userState')).toBe(false);
    expect(state).toEqual({ selection: { guildId: 'from-server' } });
    expect(warnSpy).toHaveBeenCalled();
  });

  it('initializes state from server and stores encrypted snapshot', async () => {
    (fetch as unknown as vi.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, state: { selection: { guildId: 'g1' } } }),
    });

    const setItemSpy = vi.spyOn(mockSessionStorage, 'setItem');
    const state = await initializeDiscordUserState('user-1', { maxRetries: 0 });

    expect(state).toEqual({ selection: { guildId: 'g1' } });
    expect(setItemSpy).toHaveBeenCalledWith(
      'discord.userState::user-1',
      expect.stringContaining('guildId')
    );

    const loaded = await loadDiscordUserState('user-1');
    expect(loaded).toEqual({ selection: { guildId: 'g1' } });
  });

  it('persists updates to server before caching locally', async () => {
    (fetch as unknown as vi.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, state: { selection: { guildId: 'next' } } }),
    });

    const { encryptDiscordUserState } = await import('../discordUserStateCrypto');
    (encryptDiscordUserState as vi.Mock).mockResolvedValue('encrypted-next');
    const setItemSpy = vi.spyOn(mockSessionStorage, 'setItem');
    const result = await updateDiscordUserState('user-2', (snapshot) => {
      snapshot.selection = { guildId: 'next' };
      return snapshot;
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/discord/user-state',
      expect.objectContaining({ method: 'PUT' })
    );
    const lastCall = (fetch as unknown as vi.Mock).mock.calls.at(-1)?.[1]?.body as string;
    expect(lastCall).toContain('next');
    expect(result).toEqual({ selection: { guildId: 'next' } });
    expect(setItemSpy).toHaveBeenCalledWith(
      'discord.userState::user-2',
      expect.stringContaining('next')
    );
    expect(sessionStore.get('discord.userState::user-2')).toContain('next');
  });

  it('retries initialization before surfacing failures', async () => {
    vi.useFakeTimers();

    let callCount = 0;
    (fetch as unknown as vi.Mock).mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error('network down');
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, state: { selection: { guildId: 'g2' } } }),
      };
    });

    const promise = initializeDiscordUserState('user-3', { maxRetries: 1, retryDelayMs: 50 });

    await vi.advanceTimersByTimeAsync(60);
    const state = await promise;

    expect(callCount).toBe(2);
    expect(state).toEqual({ selection: { guildId: 'g2' } });
  });
});
