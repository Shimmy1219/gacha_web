// /api/discord/user-state-key.js
import { getCookies } from '../_lib/cookies.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import { saveSession } from '../_lib/sessionStore.js';
import { createRequestLogger } from '../_lib/logger.js';

function encodeBase64(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  throw new Error('Base64 encoding is not supported in this environment');
}

function generateKeyMaterial() {
  const cryptoApi = globalThis?.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error('crypto.getRandomValues is not available to generate encryption key');
  }
  const keyBytes = new Uint8Array(32);
  cryptoApi.getRandomValues(keyBytes);
  return keyBytes;
}

export default async function handler(req, res) {
  const log = createRequestLogger('api/discord/user-state-key', req);
  log.info('request received', { method: req.method });

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    log.warn('method not allowed', { method: req.method });
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const { sid } = getCookies(req);
  const session = await getSessionWithRefresh(sid);
  if (!session?.uid) {
    log.warn('session not found or invalid');
    return res.status(401).json({ ok: false, error: 'not logged in' });
  }

  if (session.discordUserStateKey && typeof session.discordUserStateKey === 'string') {
    log.info('existing key returned');
    return res.status(200).json({ ok: true, key: session.discordUserStateKey });
  }

  const keyBytes = generateKeyMaterial();
  const key = encodeBase64(keyBytes);

  await saveSession(sid, { ...session, discordUserStateKey: key });
  log.info('new key generated and stored');
  return res.status(200).json({ ok: true, key });
}
