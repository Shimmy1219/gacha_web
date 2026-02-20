// /api/discord/me.js
import { withApiGuards } from '../_lib/apiGuards.js';
import { getCookies } from '../_lib/cookies.js';
import { clearDiscordSessionHintCookie, setDiscordSessionHintCookie } from '../_lib/discordSessionHintCookie.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import { createRequestLogger } from '../_lib/logger.js';

function createSidPreview(value) {
  if (typeof value !== 'string') {
    return null;
  }
  if (value.length <= 8) {
    return value;
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export default withApiGuards({
  route: '/api/discord/me',
  health: { enabled: true },
  methods: ['GET'],
  origin: true,
  rateLimit: { name: 'discord:me', limit: 120, windowSec: 60 },
})(async function handler(req, res) {
  const log = createRequestLogger('api/discord/me', req);
  const soft = req.query?.soft === '1';
  log.info('リクエストを受信しました', { soft });
  // このエンドポイントはヒントクッキー更新など副作用を伴うため、
  // HTTPキャッシュ(ETag/304)で短絡されないよう毎回実処理を強制する。
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const { sid } = getCookies(req);
  if (!sid) {
    log.info('セッション用クッキーが見つかりませんでした。');
    // sid が消えている場合はヒントクッキーも掃除して、以後の不要な自動アクセスを防ぐ
    clearDiscordSessionHintCookie(res);
    if (soft) return res.status(200).json({ ok:false, loggedIn:false });
    return res.status(401).json({ ok:false, error:'no session' });
  }

  const sidPreview = createSidPreview(sid);
  log.info('kvを参照します。', { sidPreview });

  const sess = await getSessionWithRefresh(sid);
  if (!sess) {
    log.info('kvからセッションデータが見つかりませんでした。', { sidPreview });
    // サーバー側セッションが既に無効化されているためヒントを削除する
    clearDiscordSessionHintCookie(res);
    if (soft) return res.status(200).json({ ok:false, loggedIn:false });
    return res.status(401).json({ ok:false, error:'invalid session' });
  }

  log.info('kvからセッションデータを復元しました。', { sidPreview, userId: sess.uid });
  // 正常セッション時はヒントを延命しておく
  setDiscordSessionHintCookie(res);

  return res.status(200).json({
    ok: true,
    loggedIn: true,
    user: { id: sess.uid, name: sess.name, avatar: sess.avatar },
  });
});
