// /api/discord/me.js
import { getCookies } from '../_lib/cookies.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import { createRequestLogger } from '../_lib/logger.js';

export default async function handler(req, res) {
  const log = createRequestLogger('api/discord/me', req);
  const soft = req.query?.soft === '1';
  log.info('request received', { soft });

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    log.warn('method not allowed', { method: req.method });
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });
  }
  const { sid } = getCookies(req);
  if (!sid) {
    log.info('no session cookie found');
    if (soft) return res.status(200).json({ ok:false, loggedIn:false });
    return res.status(401).json({ ok:false, error:'no session' });
  }

  const sess = await getSessionWithRefresh(sid);
  if (!sess) {
    log.info('session not found or invalid');
    if (soft) return res.status(200).json({ ok:false, loggedIn:false });
    return res.status(401).json({ ok:false, error:'invalid session' });
  }

  log.info('session resolved', { userId: sess.uid });

  return res.status(200).json({
    ok: true,
    loggedIn: true,
    user: { id: sess.uid, name: sess.name, avatar: sess.avatar },
  });
}
