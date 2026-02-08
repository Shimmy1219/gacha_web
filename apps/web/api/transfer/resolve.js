// /api/transfer/resolve.js
import { isAllowedOrigin } from '../_lib/origin.js';
import { createRequestLogger } from '../_lib/logger.js';
import { kv } from '../_lib/kv.js';
import {
  assertCsrfDoubleSubmit,
  hashIp,
  normalizeTransferCode,
  parseBody,
  rateLimitKey,
  readIp,
  transferKey,
} from './_lib.js';

function nowWindowId() {
  return Math.floor(Date.now() / 60_000);
}

async function assertRateLimit(req) {
  const limitPerMinute = Number(process.env.TRANSFER_RESOLVE_LIMIT_PER_MINUTE || 30);
  if (!Number.isFinite(limitPerMinute) || limitPerMinute <= 0) {
    return;
  }
  const ip = readIp(req);
  const ipHash = hashIp(ip);
  const windowId = nowWindowId();
  const key = rateLimitKey(ipHash, windowId);
  const next = await kv.incr(key);
  if (next === 1) {
    await kv.expire(key, 70);
  }
  if (typeof next === 'number' && next > limitPerMinute) {
    const err = new Error('Too Many Requests');
    err.statusCode = 429;
    throw err;
  }
}

export default async function handler(req, res) {
  const log = createRequestLogger('api/transfer/resolve', req);
  log.info('request received', { method: req.method });

  if (req.method === 'GET' && 'health' in (req.query || {})) {
    log.info('health check ok');
    return res.status(200).json({ ok: true, route: '/api/transfer/resolve' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, GET');
    log.warn('method not allowed', { method: req.method });
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const originCheck = isAllowedOrigin(req);
  if (!originCheck.ok) {
    log.warn('origin check failed', { origin: originCheck.candidate, allowed: originCheck.allowed });
    return res.status(403).json({ ok: false, error: 'Forbidden: origin not allowed' });
  }

  const body = parseBody(req);
  try {
    await assertCsrfDoubleSubmit(req, body);
  } catch (error) {
    const status = error?.statusCode || 403;
    log.warn('csrf check failed', { status, message: error?.message });
    return res.status(status).json({ ok: false, error: error?.message || 'Forbidden' });
  }

  try {
    await assertRateLimit(req);
  } catch (error) {
    const status = error?.statusCode || 429;
    log.warn('rate limited', { status, message: error?.message });
    return res.status(status).json({ ok: false, error: error?.message || 'Too Many Requests' });
  }

  const code = normalizeTransferCode(body?.code);
  if (!code) {
    return res.status(400).json({ ok: false, error: 'Bad Request' });
  }

  const record = await kv.get(transferKey(code));
  if (!record || typeof record !== 'object') {
    log.warn('transfer code not found', { code });
    return res.status(404).json({ ok: false, error: 'Transfer code not found' });
  }

  const status = typeof record.status === 'string' ? record.status : '';
  if (status !== 'ready') {
    log.warn('transfer code not ready', { code, status });
    return res.status(409).json({ ok: false, error: 'Transfer code is not ready' });
  }

  const downloadUrl =
    typeof record.downloadUrl === 'string' && record.downloadUrl
      ? record.downloadUrl
      : typeof record.url === 'string'
        ? record.url
        : '';
  if (!downloadUrl) {
    log.error('transfer record missing blob url', { code });
    return res.status(500).json({ ok: false, error: 'Transfer payload is invalid' });
  }

  const expiresAt = typeof record.expiresAt === 'string' ? record.expiresAt : undefined;
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : undefined;

  log.info('transfer resolved', { code, urlHost: new URL(downloadUrl).host });
  return res.status(200).json({
    ok: true,
    downloadUrl,
    createdAt,
    expiresAt,
  });
}
