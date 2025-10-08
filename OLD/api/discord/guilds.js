// /api/discord/guilds.js
// ユーザーアクセストークンで /users/@me/guilds → owner=true だけ返す
import { getCookies } from '../_lib/cookies.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }
  const { sid } = getCookies(req);
  if (!sid) return res.status(401).json({ ok: false, error: 'no session' });

  const sess = await getSessionWithRefresh(sid);
  if (!sess) return res.status(401).json({ ok: false, error: 'invalid session' });

  const r = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${sess.access_token}` },
  });

  if (!r.ok) {
    const t = await r.text();
    return res.status(502).json({ ok: false, error: `discord: ${t}` });
  }
  const arr = await r.json();
  const owners = (Array.isArray(arr) ? arr : [])
    .filter((g) => g.owner === true)
    .map((g) => ({ id: g.id, name: g.name, icon: g.icon }));

  return res.status(200).json({ ok: true, guilds: owners });
}
