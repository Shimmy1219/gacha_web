// /api/receive/token.js
import crypto from 'crypto';
import { createRequestLogger } from '../_lib/logger.js';
import { kv } from '../_lib/kv.js';

const VERBOSE = process.env.VERBOSE_RECEIVE_LOG === '1';

// ===== Helpers =====
function vLog(...args){ if (VERBOSE) console.log('[receive/token]', ...args); }

function uniq(arr){ return [...new Set(arr.filter(Boolean))]; }

function hostToOrigin(host){
  if (!host) return '';
  const proto = process.env.VERCEL_ENV ? 'https' : 'https';
  return `${proto}://${host}`;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i === -1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
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

async function storeShortToken(longToken, exp, issuedAt){
  const now = typeof issuedAt === 'number' ? issuedAt : Date.now();
  const ttlMs = Math.max(0, Number(exp) - now);
  const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
  for (let attempt = 0; attempt < 5; attempt += 1){
    const short = randomShortToken();
    const key = shortTokenKey(short);
    const result = await kv.set(key, longToken, { ex: ttlSec, nx: true });
    if (result === 'OK') return short;
  }
  throw new Error('failed to allocate short token');
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

function isAllowedOrigin(req){
  const envOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN; // e.g. https://shimmy3.com
  const vercelUrl = process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`;
  const self = hostToOrigin(req.headers.host);
  const allowed = uniq([envOrigin, envOrigin && envOrigin.replace('://','://www.'), vercelUrl, self]);

  const originHdr = req.headers.origin || '';
  const referer = req.headers.referer || '';
  let derived = '';
  try {
    derived = referer ? new URL(referer).origin : '';
  } catch (error) {
    vLog('failed to parse referer URL', {
      referer,
      error: error instanceof Error ? error.message : String(error)
    });
  }
  const candidate = originHdr || derived || '';

  const ok = (!!candidate && allowed.includes(candidate)) || (!candidate && allowed.includes(self));
  vLog('allowList:', allowed, 'origin:', originHdr, 'referer:', referer, 'derived:', derived, 'self:', self, 'ok:', ok);
  return ok;
}

function urlHostAllowed(u){
  const url = new URL(u);
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

export default async function handler(req, res){
  const log = createRequestLogger('api/receive/token', req);
  log.info('request received');

  // health
  if (req.method === 'GET' && 'health' in (req.query||{})) {
    log.info('health check ok');
    return res.status(200).json({ ok: true, route: '/api/receive/token' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, GET');
    log.warn('method not allowed', { method: req.method });
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });
  }

  try{
    // 同一オリジン検証
    if (!isAllowedOrigin(req)) {
      log.warn('origin check failed');
      return res.status(403).json({ ok:false, error:'Forbidden: origin not allowed' });
    }

    const body = (req.body && typeof req.body === 'object') ? req.body
                : JSON.parse(req.body || '{}');

    const { url, name, purpose, validUntil, csrf } = body || {};
    log.info('payload received', {
      hasUrl: Boolean(url),
      hasName: Boolean(name),
      purpose: typeof purpose === 'string' ? purpose : undefined,
    });

    // CSRF（二重送信: Cookie + body）
    const cookies = parseCookies(req.headers.cookie || '');
    if (!csrf || !cookies.csrf || cookies.csrf !== csrf) {
      log.warn('csrf mismatch');
      return res.status(403).json({ ok:false, error:'Forbidden: CSRF token mismatch' });
    }

    if (!url || typeof url !== 'string') {
      log.warn('url missing or invalid');
      return res.status(400).json({ ok:false, error:'Bad Request: url required' });
    }

    const normalizedUrl = normalizeDownloadUrl(url);
    if (!urlHostAllowed(normalizedUrl)) {
      log.warn('download host not allowed', { urlHost: new URL(normalizedUrl).host });
      return res.status(403).json({ ok:false, error:'Forbidden: download host not allowed' });
    }

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

    // 暗号化 AES-256-GCM
    const key = readKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const packed = Buffer.concat([ct, tag]);

    const token = `v1.${b64u.enc(iv)}.${b64u.enc(packed)}`;
    const shortToken = await storeShortToken(token, exp, now);

    // 共有URL生成
    const site = process.env.NEXT_PUBLIC_SITE_ORIGIN || hostToOrigin(req.headers.host);
    const shareUrl = `${site.replace(/\/+$/,'')}/receive?t=${encodeURIComponent(shortToken)}`;

    vLog('issued', { exp, name: filename, purpose: purp });
    log.info('token issued', { purpose: purp, exp, downloadHost: new URL(normalizedUrl).host });

    return res.status(200).json({ ok:true, token, shortToken, shareUrl, exp });
  } catch (err){
    const msg = err?.message || String(err);
    console.error('[receive/token error]', msg, VERBOSE ? { stack: err?.stack } : '');
    log.error('token issuance failed', { error: err });
    return res.status(/forbidden/i.test(msg) ? 403 : 500).json({
      ok:false, error: msg
    });
  }
}
