// /api/blob/csrf.js
// 目的: CSRFトークンを安全属性付きクッキーに設定し、同じ値をJSONでも返す（Double Submit Cookie）
import { withApiGuards } from '../_lib/apiGuards.js';
import { issueCsrfToken } from '../_lib/csrf.js';
import { createRequestLogger } from '../_lib/logger.js';

export default withApiGuards({
  route: '/api/blob/csrf',
  health: { enabled: true },
  methods: ['GET'],
  origin: true,
  rateLimit: { name: 'blob:csrf', limit: 120, windowSec: 60 },
})(async function handler(req, res) {
  const log = createRequestLogger('api/blob/csrf', req);
  log.info('request received');

  const token = issueCsrfToken(res);

  log.info('csrf token issued');
  return res.status(200).json({ ok: true, token });
});
