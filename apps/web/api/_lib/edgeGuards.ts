import { getCookies } from './cookies.js';
import { isAllowedOrigin } from './origin.js';

type RateLimitConfig = {
  name: string;
  limit: number;
  windowSec?: number;
  identity?: (request: Request) => Promise<string> | string;
};

type CsrfConfig = {
  cookieName?: string;
  headerName?: string;
};

export type EdgeGuardConfig = {
  route?: string;
  methods?: string[];
  origin?: boolean;
  csrf?: CsrfConfig;
  rateLimit?: RateLimitConfig;
};

function jsonResponse(status: number, body: Record<string, unknown>, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers ?? undefined);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  return new Response(JSON.stringify(body), { ...init, status, headers });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function readIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const first = forwardedFor.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip') || request.headers.get('cf-connecting-ip') || '0.0.0.0';
}

async function enforceRateLimit(request: Request, config: RateLimitConfig): Promise<void> {
  const name = typeof config.name === 'string' ? config.name : '';
  const limit = Number(config.limit);
  const windowSec = Number.isFinite(config.windowSec) && (config.windowSec as number) > 0 ? Number(config.windowSec) : 60;
  if (!name || !Number.isFinite(limit) || limit <= 0) {
    return;
  }

  let identity = '';
  if (typeof config.identity === 'function') {
    identity = String((await config.identity(request)) ?? '');
  }
  if (!identity) {
    const ipHash = (await sha256Hex(readIp(request))).slice(0, 16);
    identity = ipHash;
  }

  const windowId = Math.floor(Date.now() / (windowSec * 1000));
  const key = `rl:${name}:${windowId}:${identity.replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 80)}`;

  try {
    const { kv } = await import('./kv.js');
    const next = await kv.incr(key);
    if (next === 1) {
      await kv.expire(key, Math.max(1, windowSec + 10));
    }
    if (typeof next === 'number' && next > limit) {
      const err = new Error('Too Many Requests');
      (err as Error & { statusCode?: number }).statusCode = 429;
      throw err;
    }
  } catch (error) {
    if (error && typeof error === 'object' && ((error as any).statusCode === 429 || (error as any).status === 429)) {
      throw error;
    }
    console.warn('[edgeRateLimit] failed to enforce', {
      name,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function enforceCsrf(request: Request, config: CsrfConfig): Error | null {
  const cookieName = typeof config.cookieName === 'string' && config.cookieName ? config.cookieName : 'csrf';
  const headerName = typeof config.headerName === 'string' && config.headerName ? config.headerName : 'x-csrf-token';

  const cookies = getCookies(request);
  const cookieValue = typeof (cookies as any)?.[cookieName] === 'string' ? (cookies as any)[cookieName] : '';
  const headerValue = request.headers.get(headerName) || request.headers.get(headerName.toLowerCase()) || '';

  if (!cookieValue || !headerValue || cookieValue !== headerValue) {
    const err = new Error('Forbidden: invalid CSRF token');
    (err as Error & { statusCode?: number }).statusCode = 403;
    return err;
  }
  return null;
}

export function withEdgeGuards(config: EdgeGuardConfig) {
  return (handler: (request: Request) => Promise<Response>) =>
    async (request: Request): Promise<Response> => {
      const allowedMethods = Array.isArray(config.methods) ? config.methods.filter(Boolean) : null;
      if (allowedMethods && allowedMethods.length > 0 && !allowedMethods.includes(request.method)) {
        const allow = allowedMethods.join(', ');
        return jsonResponse(405, { ok: false, error: 'Method Not Allowed' }, { headers: { Allow: allow } });
      }

      if (config.origin === true) {
        const check = isAllowedOrigin(request as unknown as any);
        if (!check.ok) {
          return jsonResponse(403, { ok: false, error: 'Forbidden: origin not allowed' });
        }
      }

      if (config.csrf) {
        const err = enforceCsrf(request, config.csrf);
        if (err) {
          return jsonResponse((err as any).statusCode || 403, { ok: false, error: err.message });
        }
      }

      if (config.rateLimit) {
        try {
          await enforceRateLimit(request, config.rateLimit);
        } catch (error) {
          const status = (error as any)?.statusCode || (error as any)?.status || 429;
          return jsonResponse(status, { ok: false, error: (error as any)?.message || 'Too Many Requests' });
        }
      }

      return handler(request);
    };
}

