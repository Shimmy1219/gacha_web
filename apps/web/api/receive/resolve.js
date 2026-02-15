// /api/receive/resolve.js
import { withApiGuards } from '../_lib/apiGuards.js';
import { createRequestLogger } from '../_lib/logger.js';
import { ReceiveTokenError, resolveReceivePayload } from '../_lib/receiveToken.js';

export default withApiGuards({
  route: '/api/receive/resolve',
  health: { enabled: true },
  methods: ['GET'],
  origin: true,
  rateLimit: { name: 'receive:resolve', limit: 120, windowSec: 60 },
})(async function handler(req, res) {
  const log = createRequestLogger('api/receive/resolve', req);
  log.info('request received', { query: req.query });

  try {
    const { t, redirect } = req.query || {};
    const { payload } = await resolveReceivePayload(typeof t === 'string' ? t : '');
    const { url, name, purpose, exp } = payload;

    if (redirect === '1') {
      log.info('redirecting to download', { urlHost: new URL(url).host });
      return res.writeHead(302, { Location: url }).end();
    }

    log.info('token resolved', { urlHost: new URL(url).host, name, purpose });
    return res.status(200).json({ ok: true, url, name, exp, purpose });
  } catch (error) {
    if (error instanceof ReceiveTokenError) {
      const status = error.statusCode ?? 400;
      const payload = { ok: false, error: error.message, code: error.code };
      if (typeof error.exp !== 'undefined') {
        payload.exp = error.exp;
      }
      log.warn('resolve failed', { status, code: error.code, message: error.message });
      return res.status(status).json(payload);
    }
    const msg = error?.message || String(error);
    console.error(
      '[receive/resolve error]',
      msg,
      process.env.VERBOSE_RECEIVE_LOG === '1' ? { stack: error?.stack } : ''
    );
    log.error('resolve failed', { error });
    return res.status(500).json({ ok: false, error: msg });
  }
});
