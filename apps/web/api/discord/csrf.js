// /api/discord/csrf.js
// Discord連携用のCSRFトークンをDouble Submit Cookieで発行する
import { createRequestLogger } from '../_lib/logger.js';
import { setCookie } from '../_lib/cookies.js';

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

  const token = require('crypto').randomBytes(CSRF_TOKEN_BYTES).toString('base64url');

  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');

  setCookie(res, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    domain: '.shimmy3.com',
  });

  log.info('csrf token issued');
  return res.status(200).json({ ok: true, token });
}
