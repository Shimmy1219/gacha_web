// /api/discord/csrf.js
// Discord連携用のCSRFトークンをDouble Submit Cookieで発行する
import { issueCsrfToken } from '../_lib/csrf.js';
import { createRequestLogger } from '../_lib/logger.js';

const COOKIE_NAME = 'discord_csrf';
const CSRF_TOKEN_BYTES = 32;

export default async function handler(req, res) {
  const log = createRequestLogger('api/discord/csrf', req);
  log.info('request received');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    log.warn('method not allowed', { method: req.method });
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const token = issueCsrfToken(res, { cookieName: COOKIE_NAME, tokenBytes: CSRF_TOKEN_BYTES });

  log.info('csrf token issued');
  return res.status(200).json({ ok: true, token });
}
