// /api/discord/guilds.js
// 旧エンドポイント。Edge Runtime版の /api/discord/bot-guilds へリダイレクトする。
import { withApiGuards } from '../_lib/apiGuards.js';
import { createRequestLogger } from '../_lib/logger.js';

const NEXT_ENDPOINT = '/api/discord/bot-guilds';

export default withApiGuards({
  route: '/api/discord/guilds',
  health: { enabled: true },
  methods: ['GET'],
  origin: true,
  rateLimit: { name: 'discord:guilds-redirect', limit: 120, windowSec: 60 },
})(async function handler(req, res) {
  const log = createRequestLogger('api/discord/guilds', req);
  log.warn('deprecated endpoint invoked, redirecting to edge handler');

  res.setHeader('Location', NEXT_ENDPOINT);
  return res
    .status(308)
    .json({ ok: false, error: 'use /api/discord/bot-guilds', redirect: NEXT_ENDPOINT });
});
