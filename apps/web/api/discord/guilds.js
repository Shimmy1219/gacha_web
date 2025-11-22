// /api/discord/guilds.js
// 旧エンドポイント。Edge Runtime版の /api/discord/bot-guilds へリダイレクトする。
import { createRequestLogger } from '../_lib/logger.js';

const NEXT_ENDPOINT = '/api/discord/bot-guilds';

export default async function handler(req, res) {
  const log = createRequestLogger('api/discord/guilds', req);
  log.warn('deprecated endpoint invoked, redirecting to edge handler');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  res.setHeader('Location', NEXT_ENDPOINT);
  return res
    .status(308)
    .json({ ok: false, error: 'use /api/discord/bot-guilds', redirect: NEXT_ENDPOINT });
}
