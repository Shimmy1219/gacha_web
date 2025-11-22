import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sessions = new Map<string, any>();

vi.stubGlobal('crypto', require('crypto').webcrypto);

vi.mock('../../../api/_lib/kv.js', () => ({
  kv: {
    get: vi.fn(async (key: string) => key && null),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => {}),
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
  getSessionWithRefresh: vi.fn(async (sid?: string) => {
    if (!sid) return null;
    return sessions.get(sid) ?? (sid === 'valid-sid' ? { uid: 'user-42' } : null);
  }),
}));

vi.mock('../../../api/_lib/sessionStore.js', () => ({
  saveSession: vi.fn(async (sid: string, payload: any) => {
    sessions.set(sid, payload);
    return sid;
  }),
}));

const { default: handler } = await import('../../../api/discord/user-state-key.js');

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined as any,
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

function createRequest(method: string, sid?: string) {
  return {
    method,
    headers: sid ? { cookie: `sid=${sid}` } : {},
  } as const;
}

beforeEach(() => {
  sessions.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('api/discord/user-state-key handler', () => {
  it('rejects unauthenticated requests', async () => {
    const req = createRequest('GET');
    const res = createResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false });
  });

  it('issues a new key for authenticated user and persists it', async () => {
    const req = createRequest('GET', 'valid-sid');
    const res = createResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body?.ok).toBe(true);
    expect(typeof res.body?.key).toBe('string');
    expect(res.body.key.length).toBeGreaterThan(10);
  });

  it('returns the same key when it already exists in session', async () => {
    const req = createRequest('GET', 'valid-sid');
    const res1 = createResponse();
    await handler(req as any, res1 as any);

    const res2 = createResponse();
    await handler(req as any, res2 as any);

    expect(res2.statusCode).toBe(200);
    expect(res2.body?.key).toBe(res1.body?.key);
  });
});
