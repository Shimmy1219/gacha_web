// /api/transfer/consume.js
import { del } from '@vercel/blob';
import { withApiGuards } from '../_lib/apiGuards.js';
import { createRequestLogger } from '../_lib/logger.js';
import { kv } from '../_lib/kv.js';
import {
  ensureAllowedBlobUrl,
  normalizeTransferCode,
  transferKey,
} from './_lib.js';

const guarded = withApiGuards({
  route: '/api/transfer/consume',
  health: { enabled: true },
  methods: ['POST'],
  origin: true,
  csrf: { cookieName: 'csrf', source: 'body', field: 'csrf' },
  rateLimit: { name: 'transfer:consume', limit: 30, windowSec: 60 },
})(async (req, res) => {
  const log = createRequestLogger('api/transfer/consume', req);
  log.info('request received', { method: req.method });

  const body = req.body ?? {};
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
});

export default guarded;
