// /api/transfer/complete.js
import { withApiGuards } from '../_lib/apiGuards.js';
import { createRequestLogger } from '../_lib/logger.js';
import { kv } from '../_lib/kv.js';
import {
  TRANSFER_TTL_SEC,
  ensureAllowedBlobUrl,
  normalizeTransferCode,
  transferKey,
} from './_lib.js';

function clampTtlSec(expiresAtIso) {
  const expiresAt = Date.parse(expiresAtIso);
  if (Number.isNaN(expiresAt)) return TRANSFER_TTL_SEC;
  const ttlMs = expiresAt - Date.now();
  const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
  return ttlSec;
}

const guarded = withApiGuards({
  route: '/api/transfer/complete',
  health: { enabled: true },
  methods: ['POST'],
  origin: true,
  csrf: { cookieName: 'csrf', source: 'body', field: 'csrf' },
  rateLimit: { name: 'transfer:complete', limit: 30, windowSec: 60 },
})(async (req, res) => {
  const log = createRequestLogger('api/transfer/complete', req);
  log.info('request received', { method: req.method });

  const body = req.body ?? {};
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
    const statusCode = error?.statusCode || 400;
    log.warn('invalid blob url', { status: statusCode, message: error?.message });
    return res.status(statusCode).json({ ok: false, error: error?.message || 'Bad Request' });
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
});

export default guarded;
