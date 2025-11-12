// /api/auth/discord/callback.js
// 認可コードをアクセストークンに交換 → /users/@me 取得 → sid を発行してKVへ保存
import { getCookies, setCookie } from '../../_lib/cookies.js';
import {
  consumeDiscordAuthState,
  deleteDiscordAuthState,
  getDiscordAuthState,
} from '../../_lib/discordAuthStore.js';
import { newSid, saveSession } from '../../_lib/sessionStore.js';
import { createRequestLogger } from '../../_lib/logger.js';

function normalizeLoginContext(value) {
  if (value === 'pwa') return 'pwa';
  if (value === 'browser') return 'browser';
  return null;
}

export default async function handler(req, res) {
  const log = createRequestLogger('api/auth/discord/callback', req);
  log.info('Discordログインコールバックを受信しました', {
    hasCode: Boolean(req.query?.code),
    hasState: Boolean(req.query?.state),
  });

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    log.warn('許可されていないHTTPメソッドです', { method: req.method });
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const { code, state, error } = req.query || {};
  const codeParam = Array.isArray(code) ? code[0] : code;
  const stateParam = Array.isArray(state) ? state[0] : state;
  const statePreview =
    typeof stateParam === 'string'
      ? stateParam.length > 8
        ? `${stateParam.slice(0, 4)}...`
        : stateParam
      : null;
  if (error) {
    log.warn('Discordからエラーが返却されました', { error });
    return res.status(400).send(`OAuth error: ${error}`);
  }
  const cookies = getCookies(req);
  const expectedState = cookies['d_state'];
  const cookieVerifier = cookies['d_verifier'];
  const loginContextCookie = cookies['d_login_context'];

  let loginContext = normalizeLoginContext(loginContextCookie);
  let verifierToUse = typeof cookieVerifier === 'string' ? cookieVerifier : null;
  let shouldCleanupState = Boolean(stateParam);
  let stateRecordConsumed = false;

  try {
    if (!codeParam || !stateParam) {
      log.warn('state または verifier の検証に失敗しました', {
        hasCode: Boolean(codeParam),
        hasState: Boolean(stateParam),
        hasExpectedState: Boolean(expectedState),
        hasVerifier: Boolean(cookieVerifier),
        statePreview,
      });
      return res.status(400).send('Invalid state or verifier');
    }

    const cookieStateMatches = Boolean(expectedState) && stateParam === expectedState;
    const cookieHasVerifier = typeof cookieVerifier === 'string' && cookieVerifier.length > 0;
    const cookieValid = cookieStateMatches && cookieHasVerifier;

    if (!cookieValid) {
      log.warn('state または verifier の検証に失敗しました', {
        hasCode: Boolean(codeParam),
        hasState: Boolean(stateParam),
        hasExpectedState: Boolean(expectedState),
        hasVerifier: Boolean(cookieVerifier),
        statePreview,
      });
      const storedState = await consumeDiscordAuthState(stateParam);
      if (!storedState?.verifier) {
        log.warn('KV に保存された認証状態が見つかりませんでした', {
          hasStoredState: Boolean(storedState),
          statePreview,
        });
        return res.status(400).send('Invalid state or verifier');
      }
      stateRecordConsumed = true;
      verifierToUse = storedState.verifier;
      if (!loginContext) {
        loginContext = normalizeLoginContext(storedState.loginContext);
      }
      const restoredStatePreview =
        statePreview ?? (typeof stateParam === 'string' ? stateParam : null);
      log.info('KV から認証状態を復元しました', {
        statePreview: restoredStatePreview,
        hasLoginContext: Boolean(loginContext),
        hasVerifier: typeof verifierToUse === 'string' && verifierToUse.length > 0,
      });
    } else if (!loginContext) {
      const storedState = await getDiscordAuthState(stateParam);
      if (storedState?.loginContext) {
        loginContext = normalizeLoginContext(storedState.loginContext) || loginContext;
      }
    }

    if (!verifierToUse) {
      log.warn('検証後に有効な verifier が見つかりませんでした', {
        hasCookieVerifier: Boolean(cookieVerifier),
        statePreview,
      });
      return res.status(400).send('Invalid state or verifier');
    }

    if (!loginContext) {
      loginContext = 'browser';
    }

    log.info('Discordへアクセストークン交換リクエストを送信します', {
      loginContext,
      statePreview,
    });

    // トークン交換
    const body = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: codeParam,
      redirect_uri: process.env.DISCORD_REDIRECT_URI,
      code_verifier: verifierToUse,
    });

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      log.error('Discordへのトークン交換リクエストが失敗しました', {
        status: tokenRes.status,
        body: t,
        statePreview,
      });
      return res.status(401).send(`Token exchange failed: ${t}`);
    }

    const token = await tokenRes.json();

    log.info('Discordからアクセストークンレスポンスを受信しました', {
      scope: token.scope,
      expiresIn: token.expires_in,
      statePreview,
    });

    log.info('Discordへユーザープロフィール取得リクエストを送信します', {
      loginContext,
      statePreview,
    });

    // プロフィール
    const meRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!meRes.ok) {
      const t = await meRes.text();
      log.error('Discordからユーザープロフィールの取得に失敗しました', {
        status: meRes.status,
        body: t,
        statePreview,
      });
      return res.status(401).send(`Fetch /users/@me failed: ${t}`);
    }
    const me = await meRes.json();

    log.info('Discordからユーザープロフィールを取得しました', {
      userId: me.id,
      username: me.username,
      loginContext,
      statePreview,
    });

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

    const formatParam = Array.isArray(req.query?.format) ? req.query?.format[0] : req.query?.format;
    const acceptsJson =
      formatParam === 'json' ||
      (req.headers.accept || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .some((value) => value === 'application/json' || value.endsWith('+json'));

    // UX: ルートへ返す（必要なら /?loggedin=1 など）
    res.setHeader('Cache-Control', 'no-store');
    const sessionIdPreview = sid.length > 8 ? `${sid.slice(0, 4)}...${sid.slice(-4)}` : sid;
    log.info('ログインセッションを発行しSIDクッキーを設定しました', {
      userId: me.id,
      sessionIdPreview,
      loginContext,
    });

    // 後続リクエストで誤検知しないようにクッキーを破棄
    setCookie(res, 'd_state', '', { maxAge: 0 });
    setCookie(res, 'd_verifier', '', { maxAge: 0 });
    setCookie(res, 'd_login_context', '', { maxAge: 0 });

    if (acceptsJson) {
      log.info('ログイン完了情報をJSONレスポンスとして返却します', { loginContext });
      return res.status(200).json({ ok: true, redirectTo: '/', loginContext });
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    const redirectTarget = '/';

    if (loginContext === 'browser') {
      const redirectScript = `
        (function () {
          var target = ${JSON.stringify(redirectTarget)};
          var navigate = function () {
            try {
              window.location.replace(target);
            } catch (error) {
              window.location.href = target;
            }
          };
          if (document.readyState === 'complete' || document.readyState === 'interactive') {
            navigate();
          } else {
            document.addEventListener('DOMContentLoaded', navigate, { once: true });
          }
          window.setTimeout(function () {
            try {
              window.location.href = target;
            } catch (error) {
              // no-op
            }
          }, 4000);
        })();
      `;
      const html = `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ログイン処理中...</title>
  </head>
  <body>
    <script>${redirectScript}</script>
    <noscript>
      <p>自動で移動しない場合は、<a href="${redirectTarget}">こちら</a>をクリックしてください。</p>
    </noscript>
  </body>
</html>`;

      log.info('ブラウザ向けのリダイレクトHTMLを返却しました', { loginContext });

      return res.status(200).send(html);
    }

    const guidanceMessage =
      'ログインが完了しました。画面が切り替わらない場合は、このページを閉じてアプリを再読み込みしてください。';

    const html = `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ログイン処理中...</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #050813; color: #f9fafb; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
      main { max-width: 480px; text-align: center; background: rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 32px 28px; box-shadow: 0 18px 38px rgba(0, 0, 0, 0.3); backdrop-filter: blur(10px); }
      h1 { font-size: 1.5rem; margin-bottom: 1rem; }
      p { line-height: 1.6; margin-bottom: 1rem; }
      a { color: #60a5fa; }
      @media (max-width: 480px) {
        main { padding: 24px 20px; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>ログインしました</h1>
      <p>${guidanceMessage}</p>
      <p><a href="${redirectTarget}">トップページに移動する</a></p>
    </main>
    <noscript>
      <p>自動で移動しない場合は、上のリンクをタップしてください。</p>
    </noscript>
  </body>
</html>`;

    log.info('PWA向けの案内HTMLを返却しました', { loginContext });

    return res.status(200).send(html);
  } finally {
    if (stateRecordConsumed) {
      shouldCleanupState = false;
    }
    if (shouldCleanupState) {
      try {
        await deleteDiscordAuthState(stateParam);
      } catch (error) {
        log.error('Discord認証状態の削除に失敗しました', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
