// /api/discord/me.js
import { getCookies } from '../_lib/cookies.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });
  }
  const { sid } = getCookies(req);
  if (!sid) return res.status(401).json({ ok:false, error:'no session' });

  const sess = await getSessionWithRefresh(sid);
  if (!sess) return res.status(401).json({ ok:false, error:'invalid session' });

  return res.status(200).json({
    ok: true,
    user: { id: sess.uid, name: sess.name, avatar: sess.avatar },
  });
}
