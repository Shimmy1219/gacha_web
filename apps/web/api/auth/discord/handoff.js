// /api/auth/discord/handoff.js
// Discord コールバックで発行されたセッションを PWA に引き渡す
import { setCookie } from '../../_lib/cookies.js';
import { consumeDiscordHandoff } from '../../_lib/discordHandoffStore.js';
import { getSession, touchSession } from '../../_lib/sessionStore.js';
import { createRequestLogger } from '../../_lib/logger.js';

export default async function handler(req, res) {
  const log = createRequestLogger('api/auth/discord/handoff', req);
  log.info('request received');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    log.warn('method not allowed', { method: req.method });
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const token = extractHandoffToken(req);

  if (!token) {
    log.warn('handoff token missing in request');
    return res.status(400).json({ ok: false, error: 'Missing handoff token' });
  }

  try {
    const record = await consumeDiscordHandoff(token);
    if (!record) {
      log.info('handoff record not ready', { tokenPreview: token.slice(0, 6) });
      return res.status(404).json({ ok: false, error: 'Handoff not ready' });
    }

    const sessionIdPreview = record.sid.length > 8 ? `${record.sid.slice(0, 4)}...${record.sid.slice(-4)}` : record.sid;

    const session = await getSession(record.sid);
    if (!session) {
      log.warn('session not found for handoff token', { tokenPreview: token.slice(0, 6), sessionIdPreview });
      return res.status(410).json({ ok: false, error: 'Session expired' });
    }

    await touchSession(record.sid);
    setCookie(res, 'sid', record.sid, { maxAge: 60 * 60 * 24 * 30 });

    log.info('handoff session issued', {
      tokenPreview: token.slice(0, 6),
      sessionIdPreview,
      userId: session.uid,
    });

    return res.status(200).json({
      ok: true,
      user: {
        id: session.uid,
        name: session.name,
        avatar: session.avatar,
      },
    });
  } catch (error) {
    log.error('handoff processing failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: 'Failed to process handoff' });
  }
}

function extractHandoffToken(req) {
  if (req.body && typeof req.body === 'object' && req.body !== null) {
    const tokenFromBody = req.body.token;
    if (typeof tokenFromBody === 'string' && tokenFromBody) {
      return tokenFromBody;
    }
  }

  const tokenFromQuery = Array.isArray(req.query?.token) ? req.query.token[0] : req.query?.token;
  if (typeof tokenFromQuery === 'string' && tokenFromQuery) {
    return tokenFromQuery;
  }

  return null;
}

