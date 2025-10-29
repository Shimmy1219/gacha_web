// /api/receive/resolve.js
import crypto from 'crypto';
import { createRequestLogger } from '../_lib/logger.js';
import { kv } from '../_lib/kv.js';

const VERBOSE = process.env.VERBOSE_RECEIVE_LOG === '1';
function vLog(...args){ if (VERBOSE) console.log('[receive/resolve]', ...args); }

const b64u = {
  enc: (buf) => Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),
  dec: (str) => {
    const s = str.replace(/-/g,'+').replace(/_/g,'/');
    const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
    return Buffer.from(s + pad, 'base64');
  }
};

const SHORT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{10}$/;
const SHORT_TOKEN_PREFIX = 'receive:token:';

function shortTokenKey(token){
  return `${SHORT_TOKEN_PREFIX}${token}`;
}

function readKey(){
  const raw = process.env.RECEIVE_TOKEN_KEY;
  if (!raw) throw new Error('RECEIVE_TOKEN_KEY is not set');
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

function urlHostAllowed(u){
  const url = new URL(u);
  const suffixes = (process.env.ALLOWED_DOWNLOAD_HOST_SUFFIXES ||
    'public.blob.vercel-storage.com,blob.vercel-storage.com'
  ).split(',').map(s=>s.trim()).filter(Boolean);
  return suffixes.some(sfx => url.host === sfx || url.host.endsWith('.'+sfx));
}

export default async function handler(req, res){
  const log = createRequestLogger('api/receive/resolve', req);
  log.info('request received', { query: req.query });

  // health
  if (req.method === 'GET' && 'health' in (req.query||{})){
    log.info('health check ok');
    return res.status(200).json({ ok:true, route:'/api/receive/resolve' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    log.warn('method not allowed', { method: req.method });
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });
  }

  try{
    const { t, redirect } = req.query || {};
    if (!t || typeof t !== 'string'){
      log.warn('token missing or invalid');
      return res.status(400).json({ ok:false, error:'Bad Request: token required', code:'TOKEN_REQUIRED' });
    }

    let token = t;
    if (SHORT_TOKEN_PATTERN.test(token)){
      const redisKey = shortTokenKey(token);
      const stored = await kv.get(redisKey);
      if (!stored){
        log.warn('short token not found', { token });
        return res.status(404).json({ ok:false, error:'Not Found: token not found', code:'TOKEN_NOT_FOUND' });
      }
      const resolvedToken = String(stored);
      vLog('short token resolved', { shortToken: token });
      token = resolvedToken;
    }

    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1'){
      log.warn('token format invalid');
      return res.status(400).json({ ok:false, error:'Bad Request: invalid token format', code:'INVALID_FORMAT' });
    }
    const iv = b64u.dec(parts[1]);
    const packed = b64u.dec(parts[2]);
    if (iv.length !== 12 || packed.length < 17){
      log.warn('token bytes invalid');
      return res.status(400).json({ ok:false, error:'Bad Request: invalid token bytes', code:'INVALID_BYTES' });
    }

    const key = readKey();
    const tag = packed.slice(-16);
    const ct  = packed.slice(0, -16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    const payload = JSON.parse(pt.toString('utf8'));

    const { v, u, n, p, exp } = payload || {};
    if (v !== 1 || !u || !exp){
      log.warn('token payload invalid');
      return res.status(400).json({ ok:false, error:'Bad Request: invalid payload', code:'INVALID_PAYLOAD' });
    }

    // 期限
    const now = Date.now();
    if (now > Number(exp)){
      vLog('expired', { exp });
      log.info('token expired', { exp });
      return res.status(410).json({ ok:false, error:'Link expired', code:'EXPIRED', exp });
    }

    // ホスト制限
    if (!urlHostAllowed(u)){
      log.warn('download host not allowed', { urlHost: new URL(u).host });
      return res.status(403).json({ ok:false, error:'Forbidden: download host not allowed', code:'HOST_NOT_ALLOWED' });
    }

    // redirect=1 → 302
    if (redirect === '1'){
      log.info('redirecting to download', { urlHost: new URL(u).host });
      return res.writeHead(302, { Location: u }).end();
    }

    // JSON返却
    log.info('token resolved', { urlHost: new URL(u).host, name: n, purpose: p });
    return res.status(200).json({ ok:true, url: u, name: n, exp, purpose: p });
  } catch (err){
    const msg = err?.message || String(err);
    console.error('[receive/resolve error]', msg, VERBOSE ? { stack: err?.stack } : '');
    log.error('resolve failed', { error: err });
    return res.status(500).json({ ok:false, error: msg });
  }
}
