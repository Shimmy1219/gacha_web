// /api/_lib/apiGuards.js
// Node.js runtime向けの「デコレーター風」ガード群（高階関数）。
// - Originチェック
// - CSRF (Double Submit Cookie)
// - Rate Limit (Upstash Redis)
//
// 使い方:
// export default withApiGuards({
//   route: '/api/example',
//   methods: ['POST'],
//   origin: true,
//   csrf: { cookieName: 'csrf', source: 'body', field: 'csrf' },
//   rateLimit: { name: 'example', limit: 30, windowSec: 60 },
// })(async (req, res, ctx) => { ... });

import crypto from 'crypto';
import { getCookies } from './cookies.js';
import { isAllowedOrigin } from './origin.js';

function normalizeHeaderValue(value) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

function getHeader(req, name) {
  if (!req?.headers || typeof name !== 'string' || !name) {
    return '';
  }
  const lower = name.toLowerCase();
  const direct = req.headers[lower] ?? req.headers[name];
  return normalizeHeaderValue(direct);
}

export function parseJsonBody(req) {
  if (!req) return {};
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

function json(res, status, payload) {
  if (typeof res?.status === 'function' && typeof res?.json === 'function') {
    return res.status(status).json(payload);
  }
  if (typeof res?.writeHead === 'function' && typeof res?.end === 'function') {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
    return;
  }
  throw new Error('Unsupported response object');
}

function respondMethodNotAllowed(res, methods) {
  const allow = Array.isArray(methods) && methods.length > 0 ? methods.join(', ') : 'GET, POST';
  if (typeof res?.setHeader === 'function') {
    res.setHeader('Allow', allow);
  }
  return json(res, 405, { ok: false, error: 'Method Not Allowed' });
}

function readIp(req) {
  const xf = getHeader(req, 'x-forwarded-for');
  const ip = xf.split(',')[0].trim() || req.socket?.remoteAddress || '0.0.0.0';
  return ip || '0.0.0.0';
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

async function enforceRateLimit(req, res, ctx, config) {
  if (!config) {
    return;
  }

  const name = typeof config.name === 'string' ? config.name : '';
  const limit = Number(config.limit);
  const windowSec = Number.isFinite(config.windowSec) && config.windowSec > 0 ? Number(config.windowSec) : 60;
  if (!name || !Number.isFinite(limit) || limit <= 0) {
    return;
  }

  let identity = '';
  if (typeof config.identity === 'function') {
    identity = String(config.identity(req, ctx) ?? '');
  }
  if (!identity) {
    identity = hashIp(readIp(req));
  }

  // 固定ウィンドウ: windowSec ごとにキーを切り替える
  const windowId = Math.floor(Date.now() / (windowSec * 1000));
  const key = `rl:${name}:${windowId}:${identity.replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 80)}`;

  try {
    const { kv } = await import('./kv.js');
    const next = await kv.incr(key);
    if (next === 1) {
      await kv.expire(key, Math.max(1, windowSec + 10));
    }
    if (typeof next === 'number' && next > limit) {
      const retryAfter = windowSec;
      if (typeof res?.setHeader === 'function') {
        res.setHeader('Retry-After', String(retryAfter));
      }
      const err = new Error('Too Many Requests');
      err.statusCode = 429;
      throw err;
    }
  } catch (error) {
    // レート制限のためにサービス全体が落ちるのは避けたいので fail-open。
    // ただし 429 を投げているケースはそのまま上位へ伝播する。
    if (error && typeof error === 'object' && (error.statusCode === 429 || error.status === 429)) {
      throw error;
    }
    console.warn('[rateLimit] failed to enforce', { name, error: error instanceof Error ? error.message : String(error) });
  }
}

function enforceOrigin(req, config) {
  if (!config) {
    return null;
  }
  const check = isAllowedOrigin(req);
  if (check.ok) {
    return null;
  }
  const err = new Error('Forbidden: origin not allowed');
  err.statusCode = 403;
  return err;
}

function enforceCsrf(req, ctx, config) {
  if (!config) {
    return null;
  }

  const cookieName = typeof config.cookieName === 'string' && config.cookieName ? config.cookieName : 'csrf';
  const cookies = getCookies(req);
  const cookieValue = typeof cookies?.[cookieName] === 'string' ? cookies[cookieName] : '';

  const source = config.source === 'header' ? 'header' : 'body';
  const field = typeof config.field === 'string' && config.field ? config.field : 'csrf';
  const headerName = typeof config.headerName === 'string' && config.headerName ? config.headerName : 'x-csrf-token';

  const provided =
    source === 'header'
      ? getHeader(req, headerName)
      : typeof ctx?.body?.[field] === 'string'
        ? ctx.body[field]
        : '';

  if (!cookieValue || !provided || cookieValue !== provided) {
    const err = new Error('Forbidden: invalid CSRF token');
    err.statusCode = 403;
    err.errorCode = 'csrf_token_mismatch';
    return err;
  }

  return null;
}

export function withApiGuards(config) {
  return (handler) =>
    async (req, res) => {
      const route = typeof config?.route === 'string' ? config.route : undefined;
      const healthQueryKey =
        typeof config?.health?.queryKey === 'string' ? config.health.queryKey : 'health';
      const healthEnabled = Boolean(config?.health?.enabled);

      if (healthEnabled && req?.method === 'GET' && healthQueryKey in (req.query || {})) {
        return json(res, 200, { ok: true, route: route || 'unknown' });
      }

      const allowedMethods = Array.isArray(config?.methods) ? config.methods.filter(Boolean) : null;
      if (allowedMethods && allowedMethods.length > 0 && !allowedMethods.includes(req?.method || '')) {
        return respondMethodNotAllowed(res, allowedMethods);
      }

      const ctx = { body: parseJsonBody(req) };
      if (req && (!req.body || typeof req.body === 'string')) {
        req.body = ctx.body;
      }

      const originErr = enforceOrigin(req, config?.origin === true);
      if (originErr) {
        return json(res, originErr.statusCode || 403, { ok: false, error: originErr.message });
      }

      const csrfErr = enforceCsrf(req, ctx, config?.csrf);
      if (csrfErr) {
        if (csrfErr.errorCode === 'csrf_token_mismatch') {
          const routeLabel = route ? route.replace(/^\/+/u, '') : 'api';
          console.warn(`[${routeLabel}] 【既知のエラー】csrf mismatch`, {
            method: req?.method,
            url: req?.url,
          });
        }
        return json(res, csrfErr.statusCode || 403, {
          ok: false,
          error: csrfErr.message,
          errorCode: typeof csrfErr.errorCode === 'string' ? csrfErr.errorCode : undefined,
        });
      }

      try {
        await enforceRateLimit(req, res, ctx, config?.rateLimit);
      } catch (error) {
        const status = error?.statusCode || error?.status || 429;
        return json(res, status, { ok: false, error: error?.message || 'Too Many Requests' });
      }

      return handler(req, res, ctx);
    };
}
