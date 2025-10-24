// /api/auth/discord/callback.js
// 認可コードをアクセストークンに交換 → /users/@me 取得 → sid を発行してKVへ保存
import { getCookies, setCookie } from '../../_lib/cookies.js';
import { newSid, saveSession } from '../../_lib/sessionStore.js';
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
  const loginContext = cookies['d_login_context'];

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

  const sid = newSid();
  await saveSession(sid, payload);

  // sid をクッキーへ（30日）
  setCookie(res, 'sid', sid, { maxAge: 60 * 60 * 24 * 30 });

  // UX: ルートへ返す（必要なら /?loggedin=1 など）
  res.setHeader('Cache-Control', 'no-store');
  if (loginContext) {
    setCookie(res, 'd_login_context', '', { maxAge: 0 });
  }

  const sessionIdPreview = sid.length > 8 ? `${sid.slice(0, 4)}...${sid.slice(-4)}` : sid;
  log.info('login session issued', { userId: me.id, sessionIdPreview, loginContext: loginContext || null });

  if (loginContext === 'pwa') {
    res.status(200);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(`<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Discordログイン完了</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        margin: 0;
        padding: 24px;
        background: #1f2933;
        color: #f8fafc;
        display: flex;
        min-height: 100vh;
        align-items: center;
        justify-content: center;
      }
      main {
        max-width: 480px;
        width: 100%;
        background: rgba(15, 23, 42, 0.8);
        border-radius: 16px;
        padding: 32px 24px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
        text-align: center;
      }
      h1 {
        font-size: 1.5rem;
        margin-bottom: 16px;
      }
      p {
        line-height: 1.6;
        margin: 0 0 16px;
      }
      button {
        appearance: none;
        border: none;
        border-radius: 999px;
        padding: 12px 24px;
        font-size: 1rem;
        font-weight: 600;
        color: #0f172a;
        background: #38bdf8;
        cursor: pointer;
      }
      button:active {
        transform: translateY(1px);
      }
      .note {
        font-size: 0.85rem;
        color: #cbd5f5;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>認証が完了しました</h1>
      <p>インストール済みのアプリに戻ってご利用を続けてください。</p>
      <button type="button" onclick="window.close()">この画面を閉じる</button>
      <p class="note">自動で閉じない場合は、手動でブラウザを閉じてアプリに戻ってください。</p>
    </main>
  </body>
</html>`);
  }

  return res.redirect('/');
}
