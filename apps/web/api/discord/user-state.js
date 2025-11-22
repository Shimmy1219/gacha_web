// /api/discord/user-state.js
import { getCookies } from '../_lib/cookies.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import { createRequestLogger } from '../_lib/logger.js';
import {
  deleteDiscordUserState,
  getDiscordUserState,
  normalizeDiscordUserStateInput,
  saveDiscordUserState,
} from '../_lib/discordUserStateStore.js';

function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string') {
    return JSON.parse(req.body || '{}');
  }
  return {};
}

export default async function handler(req, res) {
  const log = createRequestLogger('api/discord/user-state', req);
  log.info('request received', { method: req.method });

  const { sid } = getCookies(req);
  const session = await getSessionWithRefresh(sid);
  if (!session?.uid) {
    log.warn('session not found or invalid');
    return res.status(401).json({ ok: false, error: 'not logged in' });
  }

  const discordUserId = String(session.uid);

  if (req.method === 'GET') {
    const state = await getDiscordUserState(discordUserId);
    log.info('state retrieved', { hasState: Boolean(state) });
    return res.status(200).json({ ok: true, state });
  }

  if (req.method === 'DELETE') {
    await deleteDiscordUserState(discordUserId);
    log.info('state deleted');
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    let body;
    try {
      body = parseJsonBody(req);
    } catch (error) {
      log.warn('failed to parse json body', {
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(400).json({ ok: false, error: 'invalid json body' });
    }

    const validation = normalizeDiscordUserStateInput(body);
    if (!validation.ok) {
      log.warn('validation failed', { reason: validation.error });
      return res.status(400).json({ ok: false, error: validation.error });
    }

    const state = await saveDiscordUserState(discordUserId, validation.value);
    log.info('state saved', { hasSelection: 'selection' in state, hasMemberCache: 'memberCache' in state });
    return res.status(200).json({ ok: true, state });
  }

  res.setHeader('Allow', 'GET, PUT, POST, DELETE');
  log.warn('method not allowed', { method: req.method });
  return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
}
