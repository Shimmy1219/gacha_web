// /api/auth/discord/claim-session.js
// Discord PWA ブリッジ用 state から sid を再発行する
import crypto from 'crypto';
import { getCookies, setCookie } from '../../_lib/cookies.js';
import {
  getDiscordPwaSession,
  consumeDiscordPwaSession,
  deleteDiscordPwaSession,
  digestDiscordPwaClaimToken,
} from '../../_lib/discordAuthStore.js';
import { getSession, touchSession } from '../../_lib/sessionStore.js';
import { createRequestLogger } from '../../_lib/logger.js';

function parseStateFromBody(body) {
  if (!body) return null;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(body)) {
    return parseStateFromBody(body.toString('utf-8'));
  }
  if (typeof body === 'string') {
    try {
      return parseStateFromBody(JSON.parse(body));
    } catch (error) {
      return null;
    }
  }
  if (typeof body !== 'object') {
    return null;
  }
  const { state } = body;
  if (typeof state !== 'string' || state.length === 0) {
    return null;
  }
  return state;
}

export default async function handler(req, res) {
  const log = createRequestLogger('api/auth/discord/claim-session', req);
  log.info('request received');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    log.warn('method not allowed', { method: req.method });
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  res.setHeader('Cache-Control', 'no-store');

  let rawBody = null;
  try {
    rawBody = req.body ?? null;
    if (rawBody == null && typeof req.on === 'function') {
      // Next.js では bodyParser が有効なため通常は不要だが、互換性のためにフォールバック
      rawBody = await new Promise((resolve, reject) => {
        const chunks = [];
        req
          .on('data', (chunk) => {
            chunks.push(chunk);
          })
          .on('end', () => {
            try {
              const buffer = Buffer.concat(chunks);
              resolve(buffer.length ? buffer.toString('utf-8') : null);
            } catch (error) {
              reject(error);
            }
          })
          .on('error', (error) => {
            reject(error);
          });
      });
    }
  } catch (error) {
    log.error('failed to read request body', {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(400).json({ ok: false, error: 'Invalid request body' });
  }

  const state = parseStateFromBody(rawBody);
  if (!state) {
    log.warn('state missing in request body');
    return res.status(400).json({ ok: false, error: 'State is required' });
  }

  const statePreview = state.length > 8 ? `${state.slice(0, 4)}...` : state;
  const cookies = getCookies(req);
  const claimToken = typeof cookies['d_pwa_bridge'] === 'string' ? cookies['d_pwa_bridge'] : null;
  if (!claimToken) {
    log.warn('pwa claim token cookie missing', { statePreview });
    return res.status(401).json({ ok: false, error: 'Missing claim token' });
  }

  const claimTokenDigest = digestDiscordPwaClaimToken(claimToken);
  if (!claimTokenDigest) {
    log.warn('pwa claim token cookie invalid', { statePreview });
    return res.status(401).json({ ok: false, error: 'Invalid claim token' });
  }

  try {
    const bridgeRecord = await getDiscordPwaSession(state);
    if (!bridgeRecord) {
      log.warn('bridge record not found', { statePreview });
      return res.status(404).json({ ok: false, error: 'Session not found' });
    }

    if (!bridgeRecord.claimTokenDigest) {
      log.error('bridge record missing claim token digest', { statePreview });
      await deleteDiscordPwaSession(state);
      return res.status(410).json({ ok: false, error: 'Session cannot be claimed' });
    }

    if (!constantTimeCompareDigests(bridgeRecord.claimTokenDigest, claimTokenDigest)) {
      log.warn('claim token mismatch', { statePreview });
      return res.status(403).json({ ok: false, error: 'Invalid claim token' });
    }

    const consumedRecord = await consumeDiscordPwaSession(state);
    if (!consumedRecord) {
      log.warn('bridge record vanished while claiming', { statePreview });
      return res.status(409).json({ ok: false, error: 'Session already claimed' });
    }

    if (
      !consumedRecord.claimTokenDigest ||
      !constantTimeCompareDigests(consumedRecord.claimTokenDigest, claimTokenDigest)
    ) {
      log.error('claim token digest mismatch after consumption', { statePreview });
      return res.status(403).json({ ok: false, error: 'Invalid claim token' });
    }

    const sid = consumedRecord.sid;
    const session = await getSession(sid);
    if (!session) {
      log.warn('session missing for claimed sid', {
        statePreview,
        sidPreview: sid.length > 8 ? `${sid.slice(0, 4)}...${sid.slice(-4)}` : sid,
      });
      await deleteDiscordPwaSession(state);
      return res.status(410).json({ ok: false, error: 'Session expired' });
    }

    await touchSession(sid);

    setCookie(res, 'sid', sid, { maxAge: 60 * 60 * 24 * 30 });
    setCookie(res, 'd_pwa_bridge', '', { maxAge: 0 });
    log.info('pwa session claimed', {
      statePreview,
      sidPreview: sid.length > 8 ? `${sid.slice(0, 4)}...${sid.slice(-4)}` : sid,
      userId: consumedRecord.userId,
    });

    return res.status(200).json({ ok: true, claimed: true });
  } catch (error) {
    log.error('unexpected error while claiming pwa session', {
      statePreview,
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
}

function constantTimeCompareDigests(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) {
    return false;
  }
  try {
    const aBuf = Buffer.from(a, 'base64');
    const bBuf = Buffer.from(b, 'base64');
    if (aBuf.length === 0 || bBuf.length === 0 || aBuf.length !== bBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch (error) {
    return false;
  }
}
