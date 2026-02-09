// /api/discord/csrf.js
// Discord連携用のCSRFトークンをDouble Submit Cookieで発行する
import { withApiGuards } from '../_lib/apiGuards.js';
import { issueCsrfToken } from '../_lib/csrf.js';
import { createRequestLogger } from '../_lib/logger.js';

const COOKIE_NAME = 'discord_csrf';
const CSRF_TOKEN_BYTES = 32;

export default withApiGuards({
  route: '/api/discord/csrf',
  health: { enabled: true },
  methods: ['GET'],
  origin: true,
  rateLimit: { name: 'discord:csrf', limit: 120, windowSec: 60 },
})(async function handler(req, res) {
  const log = createRequestLogger('api/discord/csrf', req);
  log.info('request received');

  const token = issueCsrfToken(res, { cookieName: COOKIE_NAME, tokenBytes: CSRF_TOKEN_BYTES });

  log.info('csrf token issued');
  return res.status(200).json({ ok: true, token });
});
