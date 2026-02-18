import { getCookies } from './cookies.js';
import { isAllowedOrigin } from './origin.js';

const CSRF_ERROR_CODE = 'csrf_token_mismatch';
const CSRF_REASON_COOKIE_MISSING = 'cookie_missing';
const CSRF_REASON_PROVIDED_MISSING = 'provided_missing';
const CSRF_REASON_TOKEN_MISMATCH = 'token_mismatch';

type RateLimitConfig = {
  name: string;
  limit: number;
  windowSec?: number;
  identity?: (request: Request) => Promise<string> | string;
};

type CsrfFailureReason =
  | typeof CSRF_REASON_COOKIE_MISSING
  | typeof CSRF_REASON_PROVIDED_MISSING
  | typeof CSRF_REASON_TOKEN_MISMATCH;

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

type CsrfValidationError = Error & {
  statusCode?: number;
  errorCode?: string;
  csrfReason?: CsrfFailureReason;
  csrfSource?: 'header';
  csrfRetryable?: boolean;
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

function enforceCsrf(request: Request, config: CsrfConfig): CsrfValidationError | null {
  const cookieName = typeof config.cookieName === 'string' && config.cookieName ? config.cookieName : 'csrf';
  const headerName = typeof config.headerName === 'string' && config.headerName ? config.headerName : 'x-csrf-token';

  const cookies = getCookies(request);
  const cookieValue = typeof (cookies as any)?.[cookieName] === 'string' ? (cookies as any)[cookieName] : '';
  const headerValue = request.headers.get(headerName) || request.headers.get(headerName.toLowerCase()) || '';

  const csrfReason: CsrfFailureReason | '' =
    !cookieValue
      ? CSRF_REASON_COOKIE_MISSING
      : !headerValue
        ? CSRF_REASON_PROVIDED_MISSING
        : cookieValue !== headerValue
          ? CSRF_REASON_TOKEN_MISMATCH
          : '';

  if (csrfReason) {
    const err = new Error('Forbidden: invalid CSRF token');
    const out = err as CsrfValidationError;
    out.statusCode = 403;
    out.errorCode = CSRF_ERROR_CODE;
    out.csrfReason = csrfReason;
    out.csrfSource = 'header';
    out.csrfRetryable = csrfReason !== CSRF_REASON_PROVIDED_MISSING;
    return out;
  }
  return null;
}

function logCsrfMismatch(route: string | undefined, request: Request, error: CsrfValidationError): void {
  const routeLabel = typeof route === 'string' && route.length > 0 ? route.replace(/^\/+/u, '') : 'api';
  console.warn(`[${routeLabel}] 【既知のエラー】csrf mismatch`, {
    method: request.method,
    url: request.url,
    csrfReason: error.csrfReason,
    csrfSource: error.csrfSource,
  });
}

function toCsrfResponse(error: CsrfValidationError): Record<string, unknown> {
  return {
    ok: false,
    error: error.message,
    errorCode: typeof error.errorCode === 'string' ? error.errorCode : undefined,
    csrfReason: typeof error.csrfReason === 'string' ? error.csrfReason : undefined,
    csrfSource: typeof error.csrfSource === 'string' ? error.csrfSource : undefined,
    csrfRetryable: typeof error.csrfRetryable === 'boolean' ? error.csrfRetryable : undefined,
  };
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
          if (err.errorCode === CSRF_ERROR_CODE) {
            logCsrfMismatch(config.route, request, err);
          }
          return jsonResponse(err.statusCode || 403, toCsrfResponse(err));
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
