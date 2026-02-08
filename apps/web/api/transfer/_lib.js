// /api/transfer/_lib.js
import crypto from 'crypto';

export const TRANSFER_TTL_SEC = 60 * 60 * 24; // 24 hours
export const TRANSFER_UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const TRANSFER_CODE_PREFIX = 'transfer:code:';
export const TRANSFER_RATE_LIMIT_PREFIX = 'transfer:rl:';

export function parseCookies(header) {
  const out = {};
  (header || '')
    .split(';')
    .map((v) => v.trim())
    .filter(Boolean)
    .forEach((kv) => {
      const i = kv.indexOf('=');
      if (i > -1) out[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    });
  return out;
}

export function parseBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return {};
  }
}

export function normalizeTransferCode(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[0-9]{5}$/.test(trimmed)) return null;
  return trimmed;
}

export function readIp(req) {
  const xf = typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : '';
  const ip = xf.split(',')[0].trim() || req.socket?.remoteAddress || '0.0.0.0';
  return ip || '0.0.0.0';
}

export function hashIp(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

export function transferKey(code) {
  if (!code) {
    throw new Error('transfer code is required');
  }
  return `${TRANSFER_CODE_PREFIX}${code}`;
}

export function rateLimitKey(ipHash, windowId) {
  return `${TRANSFER_RATE_LIMIT_PREFIX}${ipHash}:${windowId}`;
}

export async function assertCsrfDoubleSubmit(req, body) {
  const cookies = parseCookies(req.headers.cookie);
  const csrfFromCookie = cookies['csrf'] || '';
  const csrfFromPayload = typeof body?.csrf === 'string' ? body.csrf : '';
  if (!csrfFromCookie || !csrfFromPayload || csrfFromCookie !== csrfFromPayload) {
    const err = new Error('Forbidden: invalid CSRF token');
    err.statusCode = 403;
    throw err;
  }
}

export function randomTransferCode() {
  return crypto.randomInt(0, 100000).toString(10).padStart(5, '0');
}

export function randomObjectSuffix() {
  return crypto.randomBytes(9).toString('base64url');
}

export function ensureAllowedBlobUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    const err = new Error('Invalid blob url');
    err.statusCode = 400;
    throw err;
  }

  const suffixes = (process.env.ALLOWED_DOWNLOAD_HOST_SUFFIXES ||
    'public.blob.vercel-storage.com,blob.vercel-storage.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const ok = suffixes.some((sfx) => parsed.host === sfx || parsed.host.endsWith(`.${sfx}`));
  if (!ok) {
    const err = new Error('Invalid blob host');
    err.statusCode = 400;
    throw err;
  }
}

