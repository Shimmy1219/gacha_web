// /api/discord/guilds.js
// ユーザーアクセストークンで /users/@me/guilds → owner=true だけ返す
import { getCookies } from '../_lib/cookies.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import { createRequestLogger } from '../_lib/logger.js';

export default async function handler(req, res) {
  const log = createRequestLogger('api/discord/guilds', req);
  log.info('request received');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    log.warn('method not allowed', { method: req.method });
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }
  const { sid } = getCookies(req);
  if (!sid) {
    log.info('no session cookie found');
    return res.status(401).json({ ok: false, error: 'no session' });
  }

  const sess = await getSessionWithRefresh(sid);
  if (!sess) {
    log.info('session missing or invalid');
    return res.status(401).json({ ok: false, error: 'invalid session' });
  }

  const r = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${sess.access_token}` },
  });

  if (!r.ok) {
    const t = await r.text();
    log.error('failed to fetch guilds', { status: r.status, body: t });
    return res.status(502).json({ ok: false, error: `discord: ${t}` });
  }
  const arr = await r.json();
  const owners = (Array.isArray(arr) ? arr : [])
    .filter((g) => g.owner === true)
    .map((g) => ({ id: g.id, name: g.name, icon: g.icon }));

  log.info('guilds retrieved', { guildCount: owners.length });
  return res.status(200).json({ ok: true, guilds: owners });
}
