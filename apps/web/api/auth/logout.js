// /api/auth/logout.js
// 現在の端末のセッションだけ無効化
import { getCookies, setCookie } from '../_lib/cookies.js';
import { deleteSession } from '../_lib/sessionStore.js';
import { createRequestLogger } from '../_lib/logger.js';

export default async function handler(req, res) {
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
  log.info('logout completed');
  return res.status(200).json({ ok: true });
}
