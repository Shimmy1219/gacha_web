// /api/transfer/consume.js
import { del } from '@vercel/blob';
import { isAllowedOrigin } from '../_lib/origin.js';
import { createRequestLogger } from '../_lib/logger.js';
import { kv } from '../_lib/kv.js';
import {
  assertCsrfDoubleSubmit,
  ensureAllowedBlobUrl,
  normalizeTransferCode,
  parseBody,
  transferKey,
} from './_lib.js';

export default async function handler(req, res) {
  const log = createRequestLogger('api/transfer/consume', req);
  log.info('request received', { method: req.method });

  if (req.method === 'GET' && 'health' in (req.query || {})) {
    log.info('health check ok');
    return res.status(200).json({ ok: true, route: '/api/transfer/consume' });
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
  if (!code) {
    return res.status(400).json({ ok: false, error: 'Bad Request' });
  }

  const key = transferKey(code);
  const record = await kv.get(key);
  if (!record || typeof record !== 'object') {
    return res.status(200).json({ ok: true, deleted: false });
  }

  const url = typeof record.url === 'string' ? record.url : '';
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    log.error('blob token missing');
    return res.status(500).json({ ok: false, error: 'Server configuration error' });
  }

  if (url) {
    try {
      ensureAllowedBlobUrl(url);
      await del(url, { token: blobToken });
      log.info('transfer blob deleted', { code, urlHost: new URL(url).host });
    } catch (error) {
      const status = error?.statusCode || error?.status;
      if (status === 404) {
        log.info('transfer blob already missing', { code });
      } else {
        log.error('failed to delete transfer blob', { code, error });
        const message = error?.message || 'Failed to delete transfer blob';
        return res.status(typeof status === 'number' ? status : 500).json({ ok: false, error: message });
      }
    }
  }

  await kv.del(key);
  log.info('transfer code consumed', { code });
  return res.status(200).json({ ok: true, deleted: Boolean(url) });
}

