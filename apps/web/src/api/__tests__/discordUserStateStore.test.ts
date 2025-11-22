import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const kvStore = new Map<string, unknown>();

vi.mock('../../../api/_lib/kv.js', () => ({
  kv: {
    get: vi.fn(async (key: string) => kvStore.get(key)),
    set: vi.fn(async (key: string, value: unknown) => {
      kvStore.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      kvStore.delete(key);
    }),
  },
}));

const {
  normalizeDiscordUserStateInput,
  saveDiscordUserState,
  getDiscordUserState,
  deleteDiscordUserState,
} = await import('../../../api/_lib/discordUserStateStore.js');

beforeEach(() => {
  kvStore.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('normalizeDiscordUserStateInput', () => {
  it('accepts selection and memberCache when serializable', () => {
    const result = normalizeDiscordUserStateInput({
      selection: { guild: '123' },
      memberCache: { '123': { name: 'guild' }, empty: undefined },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        selection: { guild: '123' },
        memberCache: { '123': { name: 'guild' } },
      },
    });
  });

  it('rejects invalid memberCache types', () => {
    const result = normalizeDiscordUserStateInput({
      selection: null,
      // @ts-expect-error intentionally wrong type for validation
      memberCache: 'not-object',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('memberCache');
    }
  });
});

describe('saveDiscordUserState / getDiscordUserState', () => {
  it('persists normalized state without ttl', async () => {
    const stored = await saveDiscordUserState('user-1', {
      selection: { guild: 'g1' },
      memberCache: { g1: { members: 2 } },
    });

    expect(stored.updatedAt).toBeTypeOf('number');

    const fetched = await getDiscordUserState('user-1');
    expect(fetched).not.toBeNull();
    expect(fetched?.selection).toEqual({ guild: 'g1' });
    expect(fetched?.memberCache).toEqual({ g1: { members: 2 } });

    await deleteDiscordUserState('user-1');
    expect(await getDiscordUserState('user-1')).toBeNull();
  });
});
