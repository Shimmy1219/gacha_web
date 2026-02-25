// /api/receive/token.js
import crypto from 'crypto';
import { withApiGuards } from '../_lib/apiGuards.js';
import { hostToOrigin } from '../_lib/origin.js';
import { createRequestLogger } from '../_lib/logger.js';
import { ReceiveTokenError, resolveReceivePayload } from '../_lib/receiveToken.js';
import { kv } from '../_lib/kv.js';

const VERBOSE = process.env.VERBOSE_RECEIVE_LOG === '1';
// ===== Helpers =====
function vLog(...args){ if (VERBOSE) console.log('[receive/token]', ...args); }

class ReceiveTokenIssueError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ReceiveTokenIssueError';
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? 'TOKEN_ISSUE_FAILED';
    this.retryable = options.retryable === true;
  }
}

// base64url <-> Buffer
const b64u = {
  enc: (buf) => Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),
  dec: (str) => {
    const s = str.replace(/-/g,'+').replace(/_/g,'/');
    const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
    return Buffer.from(s + pad, 'base64');
  }
};

const SHORT_TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const SHORT_TOKEN_LENGTH = 10;
const SHORT_TOKEN_PREFIX = 'receive:token:';
const BLOB_CHECK_TIMEOUT_MS = Math.max(500, Number(process.env.RECEIVE_BLOB_CHECK_TIMEOUT_MS || 3000));
const BLOB_CHECK_MAX_ATTEMPTS = Math.max(1, Number(process.env.RECEIVE_BLOB_CHECK_MAX_ATTEMPTS || 2));
const SHORT_TOKEN_STORE_MAX_ATTEMPTS = Math.max(3, Number(process.env.RECEIVE_SHORT_TOKEN_STORE_MAX_ATTEMPTS || 8));
const TOKEN_SELF_CHECK_MAX_ATTEMPTS = Math.max(1, Number(process.env.RECEIVE_TOKEN_SELF_CHECK_MAX_ATTEMPTS || 2));

function randomShortToken(){
  // 10 chars of base64url alphabet => 60 bits entropy
  const bytes = crypto.randomBytes(8); // 64 bits
  let value = BigInt('0x' + bytes.toString('hex')) & ((1n << 60n) - 1n);
  let out = '';
  for (let i = 0; i < SHORT_TOKEN_LENGTH; i += 1){
    const idx = Number(value & 63n);
    out += SHORT_TOKEN_ALPHABET[idx];
    value >>= 6n;
  }
  return out;
}

function shortTokenKey(token){
  return `${SHORT_TOKEN_PREFIX}${token}`;
}

function isSuccessfulStatus(status) {
  return (status >= 200 && status < 300) || (status >= 300 && status < 400);
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

async function waitForRetry(attempt) {
  const delayMs = Math.min(500, 80 * (2 ** attempt));
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ReceiveTokenIssueError(`Service Unavailable: blob check timeout (${timeoutMs}ms)`, {
        statusCode: 503,
        code: 'BLOB_UNREACHABLE',
        retryable: true
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function resolveBlobCheckError(status, method) {
  if (status === 404) {
    return new ReceiveTokenIssueError('Conflict: blob not found', {
      statusCode: 409,
      code: 'BLOB_NOT_FOUND',
      retryable: false
    });
  }
  if (isRetryableStatus(status)) {
    return new ReceiveTokenIssueError(
      `Service Unavailable: blob check temporary failure (${method} status ${status})`,
      {
        statusCode: 503,
        code: 'BLOB_UNREACHABLE',
        retryable: true
      }
    );
  }
  return new ReceiveTokenIssueError(`Bad Gateway: blob check failed (${method} status ${status})`, {
    statusCode: 502,
    code: 'BLOB_CHECK_FAILED',
    retryable: false
  });
}

async function verifyBlobExists(url) {
  // 共有URL払い出し前に、Blob本体が実在するかを確認する。
  // 一時的なネットワーク揺らぎは短いリトライで吸収し、恒久エラーは即時失敗させる。
  for (let attempt = 0; attempt < BLOB_CHECK_MAX_ATTEMPTS; attempt += 1) {
    try {
      const headResponse = await fetchWithTimeout(
        url,
        {
          method: 'HEAD',
          redirect: 'follow',
          cache: 'no-store'
        },
        BLOB_CHECK_TIMEOUT_MS
      );
      if (isSuccessfulStatus(headResponse.status)) {
        return { method: 'HEAD', status: headResponse.status };
      }
      if (headResponse.status === 405 || headResponse.status === 501) {
        const rangeResponse = await fetchWithTimeout(
          url,
          {
            method: 'GET',
            redirect: 'follow',
            cache: 'no-store',
            headers: {
              Range: 'bytes=0-0'
            }
          },
          BLOB_CHECK_TIMEOUT_MS
        );
        if (isSuccessfulStatus(rangeResponse.status) || rangeResponse.status === 206 || rangeResponse.status === 416) {
          return { method: 'GET_RANGE', status: rangeResponse.status };
        }
        throw resolveBlobCheckError(rangeResponse.status, 'GET_RANGE');
      }
      throw resolveBlobCheckError(headResponse.status, 'HEAD');
    } catch (error) {
      if (error instanceof ReceiveTokenIssueError) {
        if (!error.retryable || attempt === BLOB_CHECK_MAX_ATTEMPTS - 1) {
          throw error;
        }
        await waitForRetry(attempt);
        continue;
      }
      if (attempt === BLOB_CHECK_MAX_ATTEMPTS - 1) {
        throw new ReceiveTokenIssueError('Service Unavailable: blob check request failed', {
          statusCode: 503,
          code: 'BLOB_UNREACHABLE',
          retryable: true
        });
      }
      await waitForRetry(attempt);
    }
  }
  throw new ReceiveTokenIssueError('Service Unavailable: blob check retries exhausted', {
    statusCode: 503,
    code: 'BLOB_UNREACHABLE',
    retryable: true
  });
}

async function storeShortToken(longToken, exp, issuedAt){
  const now = typeof issuedAt === 'number' ? issuedAt : Date.now();
  const ttlMs = Math.max(0, Number(exp) - now);
  const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
  for (let attempt = 0; attempt < SHORT_TOKEN_STORE_MAX_ATTEMPTS; attempt += 1){
    try {
      const short = randomShortToken();
      const key = shortTokenKey(short);
      const result = await kv.set(key, longToken, { ex: ttlSec, nx: true });
      if (result !== 'OK') {
        continue;
      }
      // 発行時点で KV の実在を保証するため、書き込み直後に read-after-write を実施する。
      const stored = await kv.get(key);
      if (String(stored) === longToken) {
        return short;
      }
      vLog('kv read-after-write mismatch; cleaning up and retrying', {
        shortToken: short,
        hasStored: Boolean(stored)
      });
      try {
        await kv.del(key);
      } catch (error) {
        vLog('failed to cleanup inconsistent short token', {
          shortToken: short,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } catch (error) {
      vLog('kv store attempt failed', {
        attempt,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    await waitForRetry(attempt);
  }
  throw new ReceiveTokenIssueError('Service Unavailable: failed to persist short token', {
    statusCode: 503,
    code: 'KV_WRITE_FAILED',
    retryable: true
  });
}

function encryptReceivePayload(payload, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([ct, tag]);
  return `v1.${b64u.enc(iv)}.${b64u.enc(packed)}`;
}

async function issueTokenWithSelfCheck(payload, key) {
  for (let attempt = 0; attempt < TOKEN_SELF_CHECK_MAX_ATTEMPTS; attempt += 1) {
    // 自己検証に失敗した場合は、long token/short token を再生成して取り直す。
    const token = encryptReceivePayload(payload, key);
    const shortToken = await storeShortToken(token, payload.exp, payload.iat);
    try {
      await resolveReceivePayload(shortToken);
      return { token, shortToken };
    } catch (error) {
      const errorCode = error instanceof ReceiveTokenError ? error.code : undefined;
      vLog('token self-check failed', {
        attempt: attempt + 1,
        maxAttempts: TOKEN_SELF_CHECK_MAX_ATTEMPTS,
        shortToken,
        errorCode,
        message: error instanceof Error ? error.message : String(error)
      });
      try {
        await kv.del(shortTokenKey(shortToken));
      } catch (cleanupError) {
        vLog('failed to cleanup short token after self-check failure', {
          shortToken,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        });
      }
      if (attempt === TOKEN_SELF_CHECK_MAX_ATTEMPTS - 1) {
        throw new ReceiveTokenIssueError('Service Unavailable: issued token failed resolve self-check', {
          statusCode: 503,
          code: 'TOKEN_SELF_CHECK_FAILED',
          retryable: true
        });
      }
      await waitForRetry(attempt);
    }
  }
  throw new ReceiveTokenIssueError('Service Unavailable: token self-check retries exhausted', {
    statusCode: 503,
    code: 'TOKEN_SELF_CHECK_FAILED',
    retryable: true
  });
}

// filename / segment sanitize
function sanitizeFilename(s, fallback='download.zip'){
  if (typeof s !== 'string') return fallback;
  let t = s.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 128);
  if (!/\.[A-Za-z0-9]+$/.test(t)) t += '.zip';
  return t || fallback;
}
function sanitizeSegment(s, fallback='zips'){
  if (typeof s !== 'string') return fallback;
  const t = s.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return t || fallback;
}

function normalizeDownloadUrl(u){
  const url = new URL(u);
  // 許可ホスト確認用にそのまま host を残す。download=1 を強制
  url.searchParams.set('download', '1');
  return url.toString();
}

function urlHostAllowed(u){
  const url = new URL(u);
  if (url.protocol !== 'https:') return false;
  const suffixes = (process.env.ALLOWED_DOWNLOAD_HOST_SUFFIXES ||
    'public.blob.vercel-storage.com,blob.vercel-storage.com'
  ).split(',').map(s=>s.trim()).filter(Boolean);
  return suffixes.some(sfx => url.host === sfx || url.host.endsWith('.'+sfx));
}

function readKey(){
  const raw = process.env.RECEIVE_TOKEN_KEY;
  if (!raw) throw new Error('RECEIVE_TOKEN_KEY is not set');
  // 32-byte key. Accept base64/base64url/hex/plain32bytes
  let key;
  try { key = b64u.dec(raw); } catch (error) {
    vLog('failed to decode RECEIVE_TOKEN_KEY as base64url', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
  if (!key || key.length !== 32) {
    try { key = Buffer.from(raw, 'base64'); } catch (error) {
      vLog('failed to decode RECEIVE_TOKEN_KEY as base64', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  if (!key || key.length !== 32) {
    try { key = Buffer.from(raw, 'hex'); } catch (error) {
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

const guarded = withApiGuards({
  route: '/api/receive/token',
  health: { enabled: true },
  methods: ['POST'],
  origin: true,
  csrf: { cookieName: 'csrf', source: 'body', field: 'csrf' },
  rateLimit: { name: 'receive:token', limit: 30, windowSec: 60 },
})(async function handler(req, res){
  const log = createRequestLogger('api/receive/token', req);
  log.info('request received');

  try{
    const body = req.body ?? {};
    const { url, name, purpose, validUntil } = body || {};
    log.info('payload received', {
      hasUrl: Boolean(url),
      hasName: Boolean(name),
      purpose: typeof purpose === 'string' ? purpose : undefined,
    });

    if (!url || typeof url !== 'string') {
      log.warn('url missing or invalid');
      return res.status(400).json({ ok:false, error:'Bad Request: url required' });
    }

    const normalizedUrl = normalizeDownloadUrl(url);
    if (!urlHostAllowed(normalizedUrl)) {
      log.warn('download host not allowed', { urlHost: new URL(normalizedUrl).host });
      return res.status(403).json({ ok:false, error:'Forbidden: download host not allowed' });
    }
    const blobCheck = await verifyBlobExists(normalizedUrl);
    log.info('blob verified for token issuance', {
      method: blobCheck.method,
      status: blobCheck.status,
      urlHost: new URL(normalizedUrl).host
    });

    const filename = sanitizeFilename(name || '');
    const purp = sanitizeSegment(purpose || 'zips');

    // 期限
    const now = Date.now();
    const ttlDefaultMs = Number(process.env.TOKEN_TTL_DEFAULT_MS || (7*24*60*60*1000));   // 7日
    const ttlMaxMs     = Number(process.env.TOKEN_TTL_MAX_MS || (14*24*60*60*1000));     // 14日
    let exp = now + ttlDefaultMs;
    if (validUntil) {
      const v = (typeof validUntil === 'number') ? validUntil : Date.parse(validUntil);
      if (!Number.isNaN(v)) exp = Math.min(v, now + ttlMaxMs);
    }

    // ペイロード
    const payload = {
      v: 1,
      u: normalizedUrl,
      n: filename,
      p: purp,
      exp,
      iat: now,
    };

    const key = readKey();
    const { token, shortToken } = await issueTokenWithSelfCheck(payload, key);

    // 共有URL生成
    const site = process.env.NEXT_PUBLIC_SITE_ORIGIN || hostToOrigin(req.headers.host);
    const shareUrl = `${site.replace(/\/+$/,'')}/receive?t=${encodeURIComponent(shortToken)}`;

    vLog('issued', { exp, name: filename, purpose: purp });
    log.info('token issued', {
      purpose: purp,
      exp,
      downloadHost: new URL(normalizedUrl).host,
      shareUrl,
      issuedId: shortToken
    });

    return res.status(200).json({ ok:true, token, shortToken, shareUrl, exp });
  } catch (err){
    if (err instanceof ReceiveTokenIssueError) {
      log.warn('token issuance blocked by preflight check', {
        code: err.code,
        status: err.statusCode,
        retryable: err.retryable,
        message: err.message
      });
      return res.status(err.statusCode).json({
        ok: false,
        error: err.message,
        code: err.code,
        retryable: err.retryable
      });
    }
    const msg = err?.message || String(err);
    console.error('[receive/token error]', msg, VERBOSE ? { stack: err?.stack } : '');
    log.error('token issuance failed', { error: err });
    return res.status(/forbidden/i.test(msg) ? 403 : 500).json({
      ok:false, error: msg
    });
  }
});

export default guarded;
