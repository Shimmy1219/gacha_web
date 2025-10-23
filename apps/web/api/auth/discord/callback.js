// /api/auth/discord/callback.js
// 認可コードをアクセストークンに交換 → /users/@me 取得 → sid を発行してKVへ保存
import { getCookies, setCookie } from '../../_lib/cookies.js';
import { saveSession, SESSION_TTL_SEC } from '../../_lib/sessionStore.js';
import { createRequestLogger } from '../../_lib/logger.js';

export default async function handler(req, res) {
  const log = createRequestLogger('api/auth/discord/callback', req);
  log.info('request received', { hasCode: Boolean(req.query?.code), hasState: Boolean(req.query?.state) });

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    log.warn('method not allowed', { method: req.method });
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const { code, state, error } = req.query || {};
  if (error) {
    log.warn('oauth error reported', { error });
    return res.status(400).send(`OAuth error: ${error}`);
  }
  const cookies = getCookies(req);
  const expectedState = cookies['d_state'];
  const verifier = cookies['d_verifier'];

  if (!code || !state || !expectedState || !verifier || state !== expectedState) {
    log.warn('state or verifier mismatch', {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      hasExpectedState: Boolean(expectedState),
      hasVerifier: Boolean(verifier),
    });
    return res.status(400).send('Invalid state or verifier');
  }

  // トークン交換
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    code_verifier: verifier,
  });

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    log.error('token exchange failed', { status: tokenRes.status, body: t });
    return res.status(401).send(`Token exchange failed: ${t}`);
  }

  const token = await tokenRes.json();

  // プロフィール
  const meRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) {
    const t = await meRes.text();
    log.error('fetch /users/@me failed', { status: meRes.status, body: t });
    return res.status(401).send(`Fetch /users/@me failed: ${t}`);
  }
  const me = await meRes.json();

  const now = Date.now();
  const payload = {
    uid: me.id,
    name: me.username,
    avatar: me.avatar,
    access_token: token.access_token,
    refresh_token: token.refresh_token, // 長期ログインの要
    scope: token.scope,
    token_type: token.token_type,
    access_expires_at: now + (token.expires_in || 3600) * 1000,
    created_at: now,
    last_seen_at: now,
    ver: 1,
  };

  const { cookieValue: sessionCookie, sid } = await saveSession(null, payload);

  // sid をクッキーへ（30日）
  setCookie(res, 'sid', sessionCookie, { maxAge: SESSION_TTL_SEC });

  // UX: ルートへ返す（必要なら /?loggedin=1 など）
  res.setHeader('Cache-Control', 'no-store');
  const previewSource = sid || sessionCookie;
  const sessionIdPreview =
    previewSource && previewSource.length > 8
      ? `${previewSource.slice(0, 4)}...${previewSource.slice(-4)}`
      : previewSource;
  log.info('login session issued', { userId: me.id, sessionIdPreview });
  return res.redirect('/');
}
