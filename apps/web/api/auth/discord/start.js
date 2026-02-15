// /api/auth/discord/start.js
// PKCE + state を発行して Discord 認可画面へ 302
import crypto from 'crypto';
import { setCookie } from '../../_lib/cookies.js';
import {
  saveDiscordAuthState,
  digestDiscordPwaClaimToken,
} from '../../_lib/discordAuthStore.js';
import { createRequestLogger } from '../../_lib/logger.js';
import { resolveDiscordRedirectUri } from '../../_lib/discordAuthConfig.js';
import { sanitizeReturnTo } from '../../_lib/returnTo.js';

function createStatePreview(value) {
  if (typeof value !== 'string') {
    return null;
  }
  return value.length > 8 ? `${value.slice(0, 4)}...` : value;
}

export default async function handler(req, res) {
  const log = createRequestLogger('api/auth/discord/start', req);
  log.info('Discordログインstartを受け取りました', {
    query: req.query,
  });

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    log.warn('許可されていないHTTPメソッドです', { method: req.method });
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const state = crypto.randomBytes(16).toString('base64url');
  const statePreview = createStatePreview(state);
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

  const contextParam = Array.isArray(req.query.context) ? req.query.context[0] : req.query.context;
  const normalizedContext =
    typeof contextParam === 'string' && contextParam.toLowerCase() === 'pwa' ? 'pwa' : 'browser';
  setCookie(res, 'd_login_context', normalizedContext, { maxAge: 600 });
  log.info('ログインコンテキストを判定しました', {
    normalizedContext,
  });

  const returnToParam = Array.isArray(req.query.returnTo) ? req.query.returnTo[0] : req.query.returnTo;
  const returnTo = sanitizeReturnTo(returnToParam);
  if (returnTo) {
    log.info('ログイン開始時のreturnToを受領しました', {
      returnTo,
    });
  }

  let claimTokenDigest;
  if (normalizedContext === 'pwa') {
    const claimToken = crypto.randomBytes(32).toString('base64url');
    const claimTokenPreview = `${claimToken.slice(0, 4)}...`;
    setCookie(res, 'd_pwa_bridge', claimToken, { maxAge: 600 });
    claimTokenDigest = digestDiscordPwaClaimToken(claimToken);
    log.info('PWAブリッジ用クレームトークンを発行しました', { claimTokenPreview });
    log.info('issued discord pwa claim token', { claimTokenPreview });
  } else {
    // 過去のPWAログイン用クッキーが残っている場合はクリアしておく
    setCookie(res, 'd_pwa_bridge', '', { maxAge: 0 });
  }

  await saveDiscordAuthState(state, {
    verifier,
    loginContext: normalizedContext,
    claimTokenDigest,
    returnTo,
  });
  log.info('kvにDiscord認証stateレコードを保存しました', {
    statePreview: `${state.slice(0, 4)}...`,
    hasClaimTokenDigest: Boolean(claimTokenDigest),
    loginContext: normalizedContext,
  });

  log.info('Upstash KV に認証状態を保存しました', {
    statePreview,
    loginContext: normalizedContext,
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
    return res.status(500).json({ ok: false, error: 'Discord redirect_uri is not configured' });
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'identify guilds',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'consent', // 再承認を促したい時は維持、不要なら削除可
  });

  log.info('DiscordへリダイレクトするURLを組み立てました', {
    statePreview: `${state.slice(0, 4)}...`,
    hasVerifier: Boolean(verifier),
    loginContext: normalizedContext,
  });

  const authorizeQuery = params.toString();
  const webAuthorizeUrl = `https://discord.com/oauth2/authorize?${authorizeQuery}`;
  // Discordモバイルアプリに直接遷移するためのディープリンク。
  // スキームだけではなくホスト名(discord.com)を含めないと、アプリ側で認可画面が表示されない。
  const appAuthorizeUrl = `discord://discord.com/oauth2/authorize?${authorizeQuery}`;

  res.setHeader('Cache-Control', 'no-store');

  const formatParam = Array.isArray(req.query.format) ? req.query.format[0] : req.query.format;
  const acceptsJson =
    formatParam === 'json' ||
    (req.headers.accept || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .some((value) => value === 'application/json' || value.endsWith('+json'));

  if (acceptsJson) {
    log.info('クライアントにDiscord認証URL(JSON)を返却しました', {
      statePreview: `${state.slice(0, 4)}...`,
      loginContext: normalizedContext,
    });
    return res.status(200).json({
      ok: true,
      authorizeUrl: webAuthorizeUrl,
      appAuthorizeUrl,
      state,
    });
  }

  res.writeHead(302, { Location: webAuthorizeUrl });
  log.info('クライアントをDiscord認証画面へリダイレクトしました', {
    location: webAuthorizeUrl,
    loginContext: normalizedContext,
  });
  return res.end();
}
