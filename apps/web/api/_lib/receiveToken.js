import crypto from 'crypto';
import { kv } from './kv.js';

const VERBOSE = process.env.VERBOSE_RECEIVE_LOG === '1';
function vLog(...args) {
  if (VERBOSE) console.log('[receive/token-lib]', ...args);
}

const b64u = {
  enc: (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (str) => {
    const s = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
    return Buffer.from(s + pad, 'base64');
  }
};

export const SHORT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{10}$/;
const SHORT_TOKEN_PREFIX = 'receive:token:';

export function shortTokenKey(token) {
  return `${SHORT_TOKEN_PREFIX}${token}`;
}

export class ReceiveTokenError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ReceiveTokenError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.exp = options.exp;
  }
}

export function readKey() {
  const raw = process.env.RECEIVE_TOKEN_KEY;
  if (!raw) throw new Error('RECEIVE_TOKEN_KEY is not set');
  let key;
  try {
    key = b64u.dec(raw);
  } catch (error) {
    vLog('failed to decode RECEIVE_TOKEN_KEY as base64url', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
  if (!key || key.length !== 32) {
    try {
      key = Buffer.from(raw, 'base64');
    } catch (error) {
      vLog('failed to decode RECEIVE_TOKEN_KEY as base64', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  if (!key || key.length !== 32) {
    try {
      key = Buffer.from(raw, 'hex');
    } catch (error) {
      vLog('failed to decode RECEIVE_TOKEN_KEY as hex', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  if (!key || key.length !== 32) {
    if (Buffer.from(raw).length === 32) key = Buffer.from(raw);
  }
  if (!key || key.length !== 32) throw new Error('RECEIVE_TOKEN_KEY must be 32 bytes (AES-256-GCM)');
  return key;
}

export function urlHostAllowed(u) {
  const url = new URL(u);
  const suffixes = (process.env.ALLOWED_DOWNLOAD_HOST_SUFFIXES ||
    'public.blob.vercel-storage.com,blob.vercel-storage.com'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return suffixes.some((sfx) => url.host === sfx || url.host.endsWith(`.${sfx}`));
}

export async function resolveReceivePayload(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new ReceiveTokenError('Bad Request: token required', { statusCode: 400, code: 'TOKEN_REQUIRED' });
  }

  let token = rawToken;
  if (SHORT_TOKEN_PATTERN.test(token)) {
    const redisKey = shortTokenKey(token);
    const stored = await kv.get(redisKey);
    if (!stored) {
      throw new ReceiveTokenError('Not Found: token not found', { statusCode: 404, code: 'TOKEN_NOT_FOUND' });
    }
    token = String(stored);
    vLog('short token resolved', { shortToken: rawToken });
  }

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') {
    throw new ReceiveTokenError('Bad Request: invalid token format', { statusCode: 400, code: 'INVALID_FORMAT' });
  }

  const iv = b64u.dec(parts[1]);
  const packed = b64u.dec(parts[2]);
  if (iv.length !== 12 || packed.length < 17) {
    throw new ReceiveTokenError('Bad Request: invalid token bytes', { statusCode: 400, code: 'INVALID_BYTES' });
  }

  const key = readKey();
  let payload;
  try {
    const tag = packed.slice(-16);
    const ct = packed.slice(0, -16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    payload = JSON.parse(pt.toString('utf8'));
  } catch (error) {
    vLog('failed to decrypt token', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw new ReceiveTokenError('Bad Request: invalid payload', { statusCode: 400, code: 'INVALID_PAYLOAD' });
  }

  const { v, u, n, p, exp } = payload || {};
  if (v !== 1 || !u || !exp) {
    throw new ReceiveTokenError('Bad Request: invalid payload', { statusCode: 400, code: 'INVALID_PAYLOAD' });
  }

  const now = Date.now();
  if (now > Number(exp)) {
    vLog('token expired', { exp });
    throw new ReceiveTokenError('Link expired', { statusCode: 410, code: 'EXPIRED', exp });
  }

  if (!urlHostAllowed(u)) {
    throw new ReceiveTokenError('Forbidden: download host not allowed', { statusCode: 403, code: 'HOST_NOT_ALLOWED' });
  }

  return {
    payload: { url: u, name: n, purpose: p, exp },
    resolvedToken: token
  };
}
