// /api/auth/discord/callback.js
// 認可コードをアクセストークンに交換 → /users/@me 取得 → sid を発行してKVへ保存
import { getCookies, setCookie } from '../../_lib/cookies.js';
import { ensureVisitorIdCookie, setVisitorIdOverride } from '../../_lib/actorContext.js';
import { setDiscordActorCookies } from '../../_lib/actorCookies.js';
import {
  consumeDiscordAuthState,
  deleteDiscordAuthState,
  getDiscordAuthState,
  saveDiscordPwaSession,
  digestDiscordPwaClaimToken,
} from '../../_lib/discordAuthStore.js';
import { setDiscordSessionHintCookie } from '../../_lib/discordSessionHintCookie.js';
import { newSid, saveSession } from '../../_lib/sessionStore.js';
import { createRequestLogger } from '../../_lib/logger.js';
import { resolveDiscordRedirectUri } from '../../_lib/discordAuthConfig.js';
import { buildRedirectTarget, sanitizeReturnTo } from '../../_lib/returnTo.js';

function normalizeLoginContext(value) {
  if (value === 'pwa') return 'pwa';
  if (value === 'browser') return 'browser';
  return null;
}

function normalizeDiscordProfileText(value, maxLength = 80) {
  if (typeof value !== 'string') {
    return '';
  }
  const normalized = value.normalize('NFKC').trim();
  if (!normalized) {
    return '';
  }
  return normalized.slice(0, maxLength);
}

/**
 * Discordプロフィールから表示名を解決する。
 * まず global_name を優先し、未設定時は username へフォールバックする。
 * どちらも使えない場合のみ空文字を返す。
 */
function resolveDiscordDisplayName(profile) {
  const globalName = normalizeDiscordProfileText(profile?.global_name, 80);
  if (globalName) {
    return globalName;
  }
  return normalizeDiscordProfileText(profile?.username, 80);
}

export default async function handler(req, res) {
  const visitorId = ensureVisitorIdCookie(res, req);
  setVisitorIdOverride(req, visitorId);
  const log = createRequestLogger('api/auth/discord/callback', req);
  log.info('Discordログインcallbackを受信しました', {
    hasCode: Boolean(req.query?.code),
    hasState: Boolean(req.query?.state),
    url: req.url,
  });

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    log.warn('許可されていないHTTPメソッドです', { method: req.method });
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const { code, state, error, error_description } = req.query || {};
  const codeParam = Array.isArray(code) ? code[0] : code;
  const stateParam = Array.isArray(state) ? state[0] : state;
  const errorParam = Array.isArray(error) ? error[0] : error;
  const errorDescriptionParam = Array.isArray(error_description)
    ? error_description[0]
    : error_description;
  const statePreview =
    typeof stateParam === 'string' && stateParam.length > 8
      ? `${stateParam.slice(0, 4)}...`
      : stateParam;
  const cookies = getCookies(req);
  const expectedState = cookies['d_state'];
  const cookieVerifier = cookies['d_verifier'];
  const loginContextCookie = cookies['d_login_context'];
  const pwaClaimTokenCookie = cookies['d_pwa_bridge'];
  log.info('受信したクッキー情報を確認しました', {
    hasExpectedState: Boolean(expectedState),
    hasVerifier: Boolean(cookieVerifier),
    loginContextCookie,
    hasPwaClaimTokenCookie: Boolean(pwaClaimTokenCookie),
  });

  let loginContext = normalizeLoginContext(loginContextCookie);
  let verifierToUse = typeof cookieVerifier === 'string' ? cookieVerifier : null;
  let shouldCleanupState = Boolean(stateParam);
  let stateRecordConsumed = false;
  let storedState = null;

  if (typeof errorParam === 'string' && errorParam.length > 0) {
    const logMethod = errorParam === 'access_denied' ? log.info.bind(log) : log.warn.bind(log);
    logMethod('DiscordからOAuthエラーが報告されました', {
      error: errorParam,
      errorDescription: typeof errorDescriptionParam === 'string' ? errorDescriptionParam : undefined,
      statePreview,
    });

    if (typeof stateParam === 'string' && stateParam.length > 0) {
      try {
        storedState = await consumeDiscordAuthState(stateParam);
        stateRecordConsumed = Boolean(storedState);
      } catch (consumeError) {
        log.error('Discord認証stateのKV消費に失敗しました', {
          error: consumeError instanceof Error ? consumeError.message : String(consumeError),
          statePreview,
        });
      }
    }

    const returnTo = sanitizeReturnTo(storedState?.returnTo);
    const redirectTarget = buildRedirectTarget(returnTo, {
      discord_oauth_error: errorParam,
    });

    // 後続リクエストで誤検知しないようにクッキーを破棄
    setCookie(res, 'd_state', '', { maxAge: 0 });
    setCookie(res, 'd_verifier', '', { maxAge: 0 });
    setCookie(res, 'd_login_context', '', { maxAge: 0 });
    setCookie(res, 'd_pwa_bridge', '', { maxAge: 0 });

    // 念のため、KVに残っている場合は削除する
    if (typeof stateParam === 'string' && stateParam.length > 0 && !stateRecordConsumed) {
      try {
        await deleteDiscordAuthState(stateParam);
      } catch (cleanupError) {
        log.error('kvからDiscord認証stateの削除に失敗しました', {
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          statePreview,
        });
      }
    }

    const formatParam = Array.isArray(req.query?.format) ? req.query?.format[0] : req.query?.format;
    const acceptsJson =
      formatParam === 'json' ||
      (req.headers.accept || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .some((value) => value === 'application/json' || value.endsWith('+json'));

    res.setHeader('Cache-Control', 'no-store');

    if (acceptsJson) {
      return res.status(400).json({
        ok: false,
        error: 'OAuth error',
        oauthError: errorParam,
        redirectTo: redirectTarget,
      });
    }

    // Service Worker が 3xx を App Shell に置き換える実装になっているため、
    // ここでは 200 + HTML リダイレクトにする（結果として元画面でモーダルを出せる）。
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
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
    <title>認証をキャンセルしました</title>
  </head>
  <body>
    <script>${redirectScript}</script>
    <noscript>
      <p>自動で移動しない場合は、<a href="${redirectTarget}">こちら</a>をクリックしてください。</p>
    </noscript>
  </body>
</html>`;
    return res.status(200).send(html);
  }

  try {
    if (!codeParam || !stateParam) {
      log.warn('state または verifier が不足しています', {
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
      const fallbackLogContext = {
        hasCode: Boolean(codeParam),
        hasState: Boolean(stateParam),
        hasExpectedState: Boolean(expectedState),
        hasVerifier: Boolean(cookieVerifier),
        loginContextCookie,
        statePreview,
      };
      storedState = await consumeDiscordAuthState(stateParam);
      if (!storedState?.verifier) {
        log.warn('state または verifier の検証に失敗しましたがKVに対応するレコードがありません', {
          ...fallbackLogContext,
          hasStoredState: Boolean(storedState),
        });
        log.warn('kvに該当するDiscord認証stateが存在しません', {
          hasStoredState: Boolean(storedState),
          statePreview,
        });
        return res.status(400).send('Invalid state or verifier');
      }
      stateRecordConsumed = true;
      verifierToUse = storedState.verifier;
      const loginContextFromState = normalizeLoginContext(storedState.loginContext);
      if (!loginContext) {
        loginContext = loginContextFromState;
      }
      const expectedPwaContext =
        loginContextFromState === 'pwa' ||
        loginContextCookie === 'pwa' ||
        Boolean(storedState.claimTokenDigest);
      const restoredStatePreview =
        statePreview ?? (typeof stateParam === 'string' ? stateParam : null);
      const logMethod = expectedPwaContext ? log.info.bind(log) : log.warn.bind(log);
      logMethod('state または verifier の検証に失敗したためKVから認証情報を復元しました', {
        ...fallbackLogContext,
        expectedPwaContext,
        loginContextFromState,
      });
      log.info('KV から認証状態を復元しました', {
        statePreview: restoredStatePreview,
        hasLoginContext: Boolean(loginContext),
        hasVerifier: typeof verifierToUse === 'string' && verifierToUse.length > 0,
      });
    } else {
      storedState = await getDiscordAuthState(stateParam);
      if (storedState) {
        log.info('kvからDiscord認証stateを参照しました', {
          statePreview,
          hasLoginContext: Boolean(storedState.loginContext),
          hasClaimTokenDigest: Boolean(storedState.claimTokenDigest),
        });
      }
      if (!loginContext && storedState?.loginContext) {
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

    const redirectUri = resolveDiscordRedirectUri(req);
    if (!redirectUri) {
      log.error('Discord redirect_uri が設定されていません', {
        envKeys: {
          VITE_DISCORD_REDIRECT_URI: Boolean(process.env.VITE_DISCORD_REDIRECT_URI),
          NEXT_PUBLIC_SITE_ORIGIN: Boolean(process.env.NEXT_PUBLIC_SITE_ORIGIN),
          VERCEL_URL: Boolean(process.env.VERCEL_URL),
        },
      });
      return res.status(500).send('Discord redirect_uri is not configured');
    }

    // トークン交換
    const body = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: codeParam,
      redirect_uri: redirectUri,
      code_verifier: verifierToUse,
    });

    log.info('Discordにアクセストークン交換リクエストを送信します', {
      statePreview,
      loginContext,
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
    log.info('Discordからアクセストークンレスポンスを受領しました', {
      statePreview,
      scope: token.scope,
      expiresIn: token.expires_in,
    });

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
    log.info('Discordにユーザープロフィール取得リクエストを送信します', {
      statePreview,
      loginContext,
    });
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
    const discordDisplayName = resolveDiscordDisplayName(me);
    const discordUsername = normalizeDiscordProfileText(me?.username, 80);
    const resolvedSessionName = discordDisplayName || discordUsername || String(me?.id || '');

    log.info('Discordからユーザープロフィールを受領しました', {
      userId: me.id,
      username: discordUsername || null,
      displayName: discordDisplayName || null,
      loginContext,
      statePreview,
    });

    log.info('Discordからユーザープロフィールを取得しました', {
      userId: me.id,
      username: discordUsername || null,
      displayName: discordDisplayName || null,
      loginContext,
      statePreview,
    });

    const now = Date.now();
    const payload = {
      uid: me.id,
      name: resolvedSessionName,
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
    // actor追跡ログで利用するDiscord情報をサーバ発行Cookieに同期する。
    setDiscordActorCookies(res, {
      id: me.id,
      name: resolvedSessionName,
      maxAgeSec: 60 * 60 * 24 * 30
    });
    // クライアント側の /api/discord/me 自動取得可否を判断するヒントも同時に付与する
    setDiscordSessionHintCookie(res);

    const formatParam = Array.isArray(req.query?.format)
      ? req.query?.format[0]
      : req.query?.format;
    const acceptsJson =
      formatParam === 'json' ||
      (req.headers.accept || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .some((value) => value === 'application/json' || value.endsWith('+json'));

    // UX: ルートへ返す（必要なら /?loggedin=1 など）
    res.setHeader('Cache-Control', 'no-store');
    const redirectTarget = buildRedirectTarget(storedState?.returnTo);
    const sessionIdPreview = sid.length > 8 ? `${sid.slice(0, 4)}...${sid.slice(-4)}` : sid;
    log.info('ログインセッションを発行しSIDクッキーを設定しました', {
      userId: me.id,
      sessionIdPreview,
      loginContext,
    });

    if (loginContext === 'pwa') {
      let claimTokenDigest = digestDiscordPwaClaimToken(pwaClaimTokenCookie);
      if (!claimTokenDigest && storedState?.claimTokenDigest) {
        claimTokenDigest = storedState.claimTokenDigest;
        log.info('kvに保存されたクレームトークンダイジェストを利用します', {
          statePreview,
        });
      }
      if (!claimTokenDigest) {
        log.warn('PWAクレームトークンを検証できなかったためブリッジ保存をスキップします', {
          statePreview,
        });
      } else {
        try {
          await saveDiscordPwaSession(stateParam, {
            sid,
            userId: me.id,
            loginContext,
            issuedAt: now,
            metadata: {
              stateRestoredFromKv: stateRecordConsumed,
            },
            claimTokenDigest,
          });
          log.info('kvにPWAセッションブリッジレコードを保存しました', {
            statePreview,
            sessionIdPreview,
          });
        } catch (error) {
          log.error('kvへのPWAセッションブリッジ保存に失敗しました', {
            statePreview,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // 後続リクエストで誤検知しないようにクッキーを破棄
    setCookie(res, 'd_state', '', { maxAge: 0 });
    setCookie(res, 'd_verifier', '', { maxAge: 0 });
    setCookie(res, 'd_login_context', '', { maxAge: 0 });

    if (acceptsJson) {
      log.info('クライアントにログイン完了(JSON)を返却しました', { loginContext });
      return res.status(200).json({ ok: true, redirectTo: redirectTarget, loginContext });
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');

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

      log.info('クライアントにブラウザ向けリダイレクトHTMLを返却しました', {
        redirectTarget,
      });
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
	      <p><a href="${redirectTarget}">元の画面に戻る</a></p>
	    </main>
    <noscript>
      <p>自動で移動しない場合は、上のリンクをタップしてください。</p>
    </noscript>
  </body>
</html>`;

    log.info('クライアントにPWA向け案内HTMLを返却しました', {
      redirectTarget,
    });
    return res.status(200).send(html);
  } finally {
    if (stateRecordConsumed) {
      shouldCleanupState = false;
    }
    if (shouldCleanupState) {
      try {
        await deleteDiscordAuthState(stateParam);
      } catch (error) {
        log.error('kvからDiscord認証stateの削除に失敗しました', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
