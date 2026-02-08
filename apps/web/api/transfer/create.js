// /api/transfer/create.js
import { isAllowedOrigin } from '../_lib/origin.js';
import { createRequestLogger } from '../_lib/logger.js';
import { kv } from '../_lib/kv.js';
import {
  TRANSFER_TTL_SEC,
  TRANSFER_UPLOAD_TOKEN_TTL_MS,
  assertCsrfDoubleSubmit,
  parseBody,
  randomObjectSuffix,
  randomTransferCode,
  transferKey,
} from './_lib.js';

function toIso(ms) {
  return new Date(ms).toISOString();
}

export default async function handler(req, res) {
  const log = createRequestLogger('api/transfer/create', req);
  log.info('request received', { method: req.method });

  if (req.method === 'GET' && 'health' in (req.query || {})) {
    log.info('health check ok');
    return res.status(200).json({ ok: true, route: '/api/transfer/create' });
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

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    log.error('blob token missing');
    return res.status(500).json({ ok: false, error: 'Server configuration error' });
  }

  const now = Date.now();
  const expiresAtMs = now + TRANSFER_TTL_SEC * 1000;
  const uploadTokenExpiresAtMs = now + TRANSFER_UPLOAD_TOKEN_TTL_MS;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = randomTransferCode();
    const suffix = randomObjectSuffix();
    const pathname = `transfer/${code}/transfer-${code}-${suffix}.shimmy`;

    const record = {
      version: 1,
      status: 'reserved',
      code,
      pathname,
      createdAt: toIso(now),
      expiresAt: toIso(expiresAtMs),
      uploadTokenExpiresAt: toIso(uploadTokenExpiresAtMs),
    };

    try {
      const stored = await kv.set(transferKey(code), record, { ex: TRANSFER_TTL_SEC, nx: true });
      if (stored !== 'OK') {
        continue;
      }

      const { generateClientTokenFromReadWriteToken } = await import('@vercel/blob/client');
      const token = await generateClientTokenFromReadWriteToken({
        pathname,
        access: 'public',
        addRandomSuffix: false,
        allowedContentTypes: ['application/octet-stream', 'application/x-shimmy'],
        maximumSizeInBytes: 100 * 1024 * 1024,
        validUntil: uploadTokenExpiresAtMs,
        token: blobToken,
      });

      log.info('transfer code reserved', { code, pathname, expiresAt: record.expiresAt });
      return res.status(200).json({
        ok: true,
        code,
        token,
        pathname,
        uploadTokenExpiresAt: record.uploadTokenExpiresAt,
        expiresAt: record.expiresAt,
      });
    } catch (error) {
      log.error('failed to allocate transfer code', { error });
      break;
    }
  }

  log.error('transfer code allocation exhausted');
  return res.status(503).json({ ok: false, error: 'Failed to allocate transfer code' });
}
