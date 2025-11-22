// /api/receive/resolve.js
import { createRequestLogger } from '../_lib/logger.js';
import { ReceiveTokenError, resolveReceivePayload } from '../_lib/receiveToken.js';

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
    const { payload } = await resolveReceivePayload(typeof t === 'string' ? t : '');
    const { url, name, purpose, exp } = payload;

    if (redirect === '1'){
      log.info('redirecting to download', { urlHost: new URL(url).host });
      return res.writeHead(302, { Location: url }).end();
    }

    log.info('token resolved', { urlHost: new URL(url).host, name, purpose });
    return res.status(200).json({ ok:true, url, name, exp, purpose });
  } catch (err){
    if (err instanceof ReceiveTokenError) {
      const status = err.statusCode ?? 400;
      const payload = { ok: false, error: err.message, code: err.code };
      if (typeof err.exp !== 'undefined') {
        payload.exp = err.exp;
      }
      log.warn('resolve failed', { status, code: err.code, message: err.message });
      return res.status(status).json(payload);
    }
    const msg = err?.message || String(err);
    console.error('[receive/resolve error]', msg, process.env.VERBOSE_RECEIVE_LOG === '1' ? { stack: err?.stack } : '');
    log.error('resolve failed', { error: err });
    return res.status(500).json({ ok:false, error: msg });
  }
}
