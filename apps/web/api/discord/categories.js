// /api/discord/categories.js
import { withApiGuards } from '../_lib/apiGuards.js';
import { getCookies } from '../_lib/cookies.js';
import { DEFAULT_CSRF_HEADER_NAME } from '../_lib/csrf.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import {
  dFetch,
  assertGuildOwner,
  DISCORD_API_ERROR_CODE_MISSING_PERMISSIONS,
  DISCORD_MISSING_PERMISSIONS_GUIDE_MESSAGE_JA,
  isDiscordMissingPermissionsError,
  isDiscordUnknownGuildError
} from '../_lib/discordApi.js';
import { createRequestLogger } from '../_lib/logger.js';

function normalizeCategoryResponse(channel) {
  return {
    id: String(channel.id),
    name: String(channel.name || ''),
    position: typeof channel.position === 'number' ? channel.position : 0
  };
}

export default withApiGuards({
  route: '/api/discord/categories',
  health: { enabled: true },
  methods: ['GET', 'POST'],
  origin: true,
  csrf: { cookieName: 'discord_csrf', source: 'header', headerName: DEFAULT_CSRF_HEADER_NAME },
  rateLimit: { name: 'discord:categories', limit: 30, windowSec: 60 },
})(async function handler(req, res) {
  const log = createRequestLogger('api/discord/categories', req);
  log.info('request received', { method: req.method, query: req.query });

  const method = req.method || 'GET';

  const { sid } = getCookies(req);
  const sess = await getSessionWithRefresh(sid);
  if (!sess) {
    log.info('session missing or invalid');
    return res.status(401).json({ ok: false, error: 'not logged in' });
  }

  const guildId =
    method === 'GET'
      ? String(req.query.guild_id || '')
      : String((req.body && req.body.guild_id) || '');

  if (!guildId) {
    log.warn('missing guild id');
    return res.status(400).json({ ok: false, error: 'guild_id required' });
  }

  try {
    await assertGuildOwner(sess.access_token, guildId);
  } catch (error) {
    log.warn('guild ownership assertion failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    return res.status(403).json({ ok: false, error: error.message || 'forbidden' });
  }

  function respondDiscordApiError(error, context) {
    const message = error instanceof Error ? error.message : String(error);
    if (isDiscordUnknownGuildError(error)) {
      log.warn('discord guild is not accessible for bot operations', { context, message });
      return res.status(404).json({
        ok: false,
        error: '選択されたDiscordギルドを操作できません。ボットが参加しているか確認してください。'
      });
    }
    if (isDiscordMissingPermissionsError(error)) {
      log.warn('discord bot is missing permissions', { context, message });
      return res.status(403).json({
        ok: false,
        error: DISCORD_MISSING_PERMISSIONS_GUIDE_MESSAGE_JA,
        errorCode: DISCORD_API_ERROR_CODE_MISSING_PERMISSIONS
      });
    }
    log.error('discord api request failed', { context, message });
    return res.status(502).json({ ok: false, error: 'discord api request failed' });
  }

  if (method === 'GET') {
    try {
      const channels = await dFetch(`/guilds/${guildId}/channels`, {
        token: process.env.DISCORD_BOT_TOKEN,
        isBot: true
      });
      const categories = (Array.isArray(channels) ? channels : [])
        .filter((channel) => channel?.type === 4)
        .map(normalizeCategoryResponse)
        .sort((a, b) => {
          if (a.position !== b.position) {
            return a.position - b.position;
          }
          return a.id.localeCompare(b.id);
        });
      log.info('categories fetched', { count: categories.length });
      return res.json({ ok: true, categories });
    } catch (error) {
      return respondDiscordApiError(error, 'guild-categories-list');
    }
  }

  const name = String((req.body && req.body.name) || '').trim();
  if (!name) {
    log.warn('category name missing');
    return res.status(400).json({ ok: false, error: 'name required' });
  }

  try {
    const created = await dFetch(`/guilds/${guildId}/channels`, {
      token: process.env.DISCORD_BOT_TOKEN,
      isBot: true,
      method: 'POST',
      body: {
        name,
        type: 4
      }
    });
    const category = normalizeCategoryResponse(created);
    log.info('category created', { categoryId: category.id, guildId });
    return res.status(201).json({ ok: true, category });
  } catch (error) {
    return respondDiscordApiError(error, 'guild-category-create');
  }
});
