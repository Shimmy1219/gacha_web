// /api/discord/guilds.js
// ユーザーアクセストークンで /users/@me/guilds → owner=true だけ返す
import { getCookies } from '../_lib/cookies.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import { createRequestLogger } from '../_lib/logger.js';

const CSRF_COOKIE_NAME = 'discord_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';

export default async function handler(req, res) {
  const log = createRequestLogger('api/discord/guilds', req);
  log.info('request received');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    log.warn('method not allowed', { method: req.method });
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }
  const cookies = getCookies(req);
  const { sid } = cookies;
  if (!sid) {
    log.info('no session cookie found');
    return res.status(401).json({ ok: false, error: 'no session' });
  }

  const csrfCookie = cookies[CSRF_COOKIE_NAME];
  const csrfHeader = typeof req.headers[CSRF_HEADER_NAME] === 'string' ? req.headers[CSRF_HEADER_NAME] : undefined;

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    log.warn('csrf mismatch', { hasCookie: Boolean(csrfCookie), hasHeader: Boolean(csrfHeader) });
    return res.status(403).json({ ok: false, error: 'csrf mismatch' });
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
