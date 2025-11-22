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

vi.mock('../../../api/_lib/logger.js', () => ({
  createRequestLogger: () => ({
    info() {},
    warn() {},
    error() {},
  }),
}));

vi.mock('../../../api/_lib/getSessionWithRefresh.js', () => ({
  getSessionWithRefresh: vi.fn(async (sid?: string) =>
    sid === 'valid-sid' ? { uid: 'user-42' } : null
  ),
}));

const { default: handler } = await import('../../../api/discord/user-state.js');

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  } as const;
}

function createRequest(method: string, body?: unknown, sid?: string) {
  return {
    method,
    body,
    headers: sid ? { cookie: `sid=${sid}` } : {},
  } as const;
}

beforeEach(() => {
  kvStore.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('api/discord/user-state handler', () => {
  it('denies requests without valid session', async () => {
    const req = createRequest('GET');
    const res = createResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false });
  });

  it('saves and returns state for authenticated user', async () => {
    const reqSave = createRequest(
      'PUT',
      { selection: { guild: 'g1' }, memberCache: { g1: { members: 2 } } },
      'valid-sid'
    );
    const resSave = createResponse();
    await handler(reqSave as any, resSave as any);

    expect(resSave.statusCode).toBe(200);
    expect(resSave.body).toMatchObject({ ok: true });

    const reqFetch = createRequest('GET', undefined, 'valid-sid');
    const resFetch = createResponse();
    await handler(reqFetch as any, resFetch as any);

    expect(resFetch.statusCode).toBe(200);
    expect(resFetch.body).toEqual({
      ok: true,
      state: {
        selection: { guild: 'g1' },
        memberCache: { g1: { members: 2 } },
        updatedAt: expect.any(Number),
      },
    });
  });

  it('clears state on DELETE', async () => {
    const reqSave = createRequest('PUT', { selection: { guild: 'g1' } }, 'valid-sid');
    const resSave = createResponse();
    await handler(reqSave as any, resSave as any);

    const reqDelete = createRequest('DELETE', undefined, 'valid-sid');
    const resDelete = createResponse();
    await handler(reqDelete as any, resDelete as any);

    expect(resDelete.statusCode).toBe(200);
    expect(resDelete.body).toEqual({ ok: true });

    const reqFetch = createRequest('GET', undefined, 'valid-sid');
    const resFetch = createResponse();
    await handler(reqFetch as any, resFetch as any);

    expect(resFetch.body).toEqual({ ok: true, state: null });
  });

  it('validates payload and rejects invalid memberCache', async () => {
    const req = createRequest('POST', { memberCache: 'invalid' }, 'valid-sid');
    const res = createResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false });
  });
});
