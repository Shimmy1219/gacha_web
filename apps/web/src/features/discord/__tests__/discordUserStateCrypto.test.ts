import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  decryptDiscordUserState,
  encryptDiscordUserState,
  resetCachedDiscordUserStateKey,
} from '../discordUserStateCrypto';

vi.stubGlobal('crypto', require('crypto').webcrypto);

const base64Key = Buffer.alloc(32, 1).toString('base64');

function mockFetch(ok: boolean, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok,
    json: async () => body,
  })) as any);
}

afterEach(() => {
  resetCachedDiscordUserStateKey();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('discordUserStateCrypto', () => {
  it('round-trips payloads with AES-GCM encryption', async () => {
    mockFetch(true, { ok: true, key: base64Key });

    const payload = { selection: { guild: 'g1' }, memberCache: { g1: { updatedAt: 'now' } } };

    const encrypted = await encryptDiscordUserState(payload);
    expect(typeof encrypted).toBe('string');
    expect(encrypted).toMatch(/:/);

    const decrypted = await decryptDiscordUserState(encrypted);
    expect(decrypted).toEqual(payload);
  });

  it('throws when key retrieval fails', async () => {
    mockFetch(false, { ok: false, error: 'failed' });

    await expect(encryptDiscordUserState({ foo: 'bar' })).rejects.toThrow();
  });
});
