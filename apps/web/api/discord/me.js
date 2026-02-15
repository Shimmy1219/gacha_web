// /api/discord/me.js
import { withApiGuards } from '../_lib/apiGuards.js';
import { getCookies } from '../_lib/cookies.js';
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

  const { sid } = getCookies(req);
  if (!sid) {
    log.info('セッション用クッキーが見つかりませんでした。');
    if (soft) return res.status(200).json({ ok:false, loggedIn:false });
    return res.status(401).json({ ok:false, error:'no session' });
  }

  const sidPreview = createSidPreview(sid);
  log.info('kvを参照します。', { sidPreview });

  const sess = await getSessionWithRefresh(sid);
  if (!sess) {
    log.info('kvからセッションデータが見つかりませんでした。', { sidPreview });
    if (soft) return res.status(200).json({ ok:false, loggedIn:false });
    return res.status(401).json({ ok:false, error:'invalid session' });
  }

  log.info('kvからセッションデータを復元しました。', { sidPreview, userId: sess.uid });

  return res.status(200).json({
    ok: true,
    loggedIn: true,
    user: { id: sess.uid, name: sess.name, avatar: sess.avatar },
  });
});
