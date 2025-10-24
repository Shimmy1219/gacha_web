// /api/auth/discord/start.js
// PKCE + state を発行して Discord 認可画面へ 302
import crypto from 'crypto';
import { setCookie } from '../../_lib/cookies.js';
import { createRequestLogger } from '../../_lib/logger.js';

export default async function handler(req, res) {
  const log = createRequestLogger('api/auth/discord/start', req);
  log.info('request received');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    log.warn('method not allowed', { method: req.method });
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const state = crypto.randomBytes(16).toString('base64url');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  // 10分だけ有効
  setCookie(res, 'd_state', state, { maxAge: 600 });
  setCookie(res, 'd_verifier', verifier, { maxAge: 600 });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    scope: 'identify guilds',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'consent', // 再承認を促したい時は維持、不要なら削除可
  });

  log.info('issuing discord authorize redirect', {
    statePreview: `${state.slice(0, 4)}...`,
    hasVerifier: Boolean(verifier),
  });

  const authorizeQuery = params.toString();
  const webAuthorizeUrl = `https://discord.com/oauth2/authorize?${authorizeQuery}`;
  // Discord公式ドキュメントで案内されているモバイルアプリ向けのディープリンクスキーム
  const appAuthorizeUrl = `discord://oauth2/authorize?${authorizeQuery}`;

  res.setHeader('Cache-Control', 'no-store');

  const formatParam = Array.isArray(req.query.format) ? req.query.format[0] : req.query.format;
  const acceptsJson =
    formatParam === 'json' ||
    (req.headers.accept || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .some((value) => value === 'application/json' || value.endsWith('+json'));

  if (acceptsJson) {
    log.info('returning authorize urls as json response');
    return res.status(200).json({
      ok: true,
      authorizeUrl: webAuthorizeUrl,
      appAuthorizeUrl,
    });
  }

  res.writeHead(302, { Location: webAuthorizeUrl });
  log.info('redirect response sent', { location: webAuthorizeUrl });
  return res.end();
}
