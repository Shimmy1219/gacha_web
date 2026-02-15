// /api/receive/delete.js
import { del } from '@vercel/blob';
import { withApiGuards } from '../_lib/apiGuards.js';
import { createRequestLogger } from '../_lib/logger.js';
import { ReceiveTokenError, resolveReceivePayload } from '../_lib/receiveToken.js';

const guarded = withApiGuards({
  route: '/api/receive/delete',
  health: { enabled: true },
  methods: ['POST'],
  origin: true,
  csrf: { cookieName: 'csrf', source: 'body', field: 'csrf' },
  rateLimit: { name: 'receive:delete', limit: 10, windowSec: 60 },
})(async function handler(req, res) {
  const log = createRequestLogger('api/receive/delete', req);
  log.info('request received', { method: req.method });

  const body = req.body ?? {};
  const token = typeof body.token === 'string' ? body.token : typeof req.query?.t === 'string' ? req.query.t : '';

  try {
    const { payload } = await resolveReceivePayload(token);
    const { url, name } = payload;

    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) {
      log.error('blob token missing');
      return res.status(500).json({ ok: false, error: 'Server configuration error' });
    }

    try {
      await del(url, { token: blobToken });
    } catch (error) {
      const status = error?.statusCode || error?.status;
      if (status === 404) {
        log.info('blob already missing', { urlHost: new URL(url).host });
      } else {
        log.error('failed to delete blob', { error });
        const message = error?.message || 'Failed to delete blob';
        return res.status(typeof status === 'number' ? status : 500).json({ ok: false, error: message });
      }
    }

    log.info('blob deleted', { urlHost: new URL(url).host, name });
    return res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof ReceiveTokenError) {
      const status = error.statusCode ?? 400;
      const payload = { ok: false, error: error.message, code: error.code };
      if (typeof error.exp !== 'undefined') {
        payload.exp = error.exp;
      }
      log.warn('token validation failed', { status, code: error.code, message: error.message });
      return res.status(status).json(payload);
    }
    const message = error?.message || 'Internal Server Error';
    log.error('unexpected delete error', { error });
    return res.status(500).json({ ok: false, error: message });
  }
});

export default guarded;
