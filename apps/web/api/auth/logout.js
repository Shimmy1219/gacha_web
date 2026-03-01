// /api/auth/logout.js
// 現在の端末のセッションだけ無効化
import { withApiGuards } from '../_lib/apiGuards.js';
import { clearDiscordActorCookies } from '../_lib/actorCookies.js';
import { getCookies, setCookie } from '../_lib/cookies.js';
import { clearDiscordSessionHintCookie } from '../_lib/discordSessionHintCookie.js';
import { deleteSession } from '../_lib/sessionStore.js';
import { createRequestLogger } from '../_lib/logger.js';

export default withApiGuards({
  route: '/api/auth/logout',
  health: { enabled: true },
  methods: ['POST'],
  origin: true,
  csrf: { cookieName: 'csrf', source: 'body', field: 'csrf' },
  rateLimit: { name: 'auth:logout', limit: 30, windowSec: 60 },
})(async function handler(req, res) {
  const log = createRequestLogger('api/auth/logout', req);
  log.info('request received');

  const { sid } = getCookies(req);
  if (sid) {
    const sidPreview = sid.length > 8 ? `${sid.slice(0, 4)}...${sid.slice(-4)}` : sid;
    log.info('session found, deleting', { sidPreview });
    await deleteSession(sid);
    // sid クッキーを消す
    setCookie(res, 'sid', '', { maxAge: 0 });
  } else {
    log.info('no session cookie present');
  }
  // 未ログイン状態に戻るため、/api/discord/me 自動取得ヒントも必ず削除する
  clearDiscordSessionHintCookie(res);
  // actor追跡ログが古いユーザーに固定されないようDiscord cookieも削除する
  clearDiscordActorCookies(res);
  log.info('logout completed');
  return res.status(200).json({ ok: true });
});
