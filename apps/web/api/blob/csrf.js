// /api/blob/csrf.js
// 目的: CSRFトークンを安全属性付きクッキーに設定し、同じ値をJSONでも返す（Double Submit Cookie）
import { issueCsrfToken } from '../_lib/csrf.js';
import { createRequestLogger } from '../_lib/logger.js';

export default async function handler(req, res) {
  const log = createRequestLogger('api/blob/csrf', req);
  log.info('request received');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    log.warn('method not allowed', { method: req.method });
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const token = issueCsrfToken(res);

  log.info('csrf token issued');
  return res.status(200).json({ ok: true, token });
}
