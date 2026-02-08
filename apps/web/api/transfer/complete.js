// /api/transfer/complete.js
import { isAllowedOrigin } from '../_lib/origin.js';
import { createRequestLogger } from '../_lib/logger.js';
import { kv } from '../_lib/kv.js';
import {
  TRANSFER_TTL_SEC,
  assertCsrfDoubleSubmit,
  ensureAllowedBlobUrl,
  normalizeTransferCode,
  parseBody,
  transferKey,
} from './_lib.js';

function clampTtlSec(expiresAtIso) {
  const expiresAt = Date.parse(expiresAtIso);
  if (Number.isNaN(expiresAt)) return TRANSFER_TTL_SEC;
  const ttlMs = expiresAt - Date.now();
  const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
  return ttlSec;
}

export default async function handler(req, res) {
  const log = createRequestLogger('api/transfer/complete', req);
  log.info('request received', { method: req.method });

  if (req.method === 'GET' && 'health' in (req.query || {})) {
    log.info('health check ok');
    return res.status(200).json({ ok: true, route: '/api/transfer/complete' });
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

  const code = normalizeTransferCode(body?.code);
  const pathname = typeof body?.pathname === 'string' ? body.pathname : '';
  const url = typeof body?.url === 'string' ? body.url : '';
  const downloadUrl = typeof body?.downloadUrl === 'string' ? body.downloadUrl : '';

  if (!code || !pathname || !url) {
    return res.status(400).json({ ok: false, error: 'Bad Request' });
  }

  try {
    ensureAllowedBlobUrl(url);
    if (downloadUrl) ensureAllowedBlobUrl(downloadUrl);
  } catch (error) {
    const status = error?.statusCode || 400;
    log.warn('invalid blob url', { status, message: error?.message });
    return res.status(status).json({ ok: false, error: error?.message || 'Bad Request' });
  }

  const key = transferKey(code);
  const existing = await kv.get(key);
  if (!existing || typeof existing !== 'object') {
    log.warn('transfer code not found', { code });
    return res.status(404).json({ ok: false, error: 'Transfer code not found' });
  }

  const expectedPathname = typeof existing.pathname === 'string' ? existing.pathname : '';
  const status = typeof existing.status === 'string' ? existing.status : '';
  if (status !== 'reserved' || expectedPathname !== pathname) {
    log.warn('transfer code mismatch', { code, status, expectedPathname, pathname });
    return res.status(409).json({ ok: false, error: 'Transfer code is not in a valid state' });
  }

  const expiresAt = typeof existing.expiresAt === 'string' ? existing.expiresAt : '';
  const ttlSec = expiresAt ? clampTtlSec(expiresAt) : TRANSFER_TTL_SEC;

  const record = {
    ...existing,
    status: 'ready',
    url,
    downloadUrl: downloadUrl || url,
    completedAt: new Date().toISOString(),
  };

  await kv.set(key, record, { ex: ttlSec });

  log.info('transfer completed', { code, pathname });
  return res.status(200).json({ ok: true, expiresAt: record.expiresAt });
}

