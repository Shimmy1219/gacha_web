// /api/_lib/sessionStore.js
// 長期ログインセッション (sid) を Upstash もしくは暗号化Cookieに保存
import crypto from 'crypto';
import { createSessionCookieCodec } from './sessionCookie.js';
import { getKvClient, hasKvConfig } from './kv.js';

export const SESSION_TTL_SEC = 60 * 60 * 24 * 30; // 30日

const requestedStore = (process.env.SESSION_STORE || process.env.SESSION_BACKEND || '')
  .toLowerCase()
  .trim();
const kvAvailable = hasKvConfig();

let mode = 'kv';
if (requestedStore === 'cookie') {
  mode = 'cookie';
} else if (requestedStore === 'kv' || requestedStore === 'upstash') {
  mode = 'kv';
  if (!kvAvailable) {
    throw new Error('[SessionStore] SESSION_STORE=kv が指定されていますが Upstash が設定されていません。');
  }
} else if (!kvAvailable) {
  mode = 'cookie';
}

const kv = mode === 'kv' ? getKvClient() : null;
let cookieCodec = null;

if (mode === 'kv' && !kv) {
  throw new Error('[SessionStore] Upstash Redis クライアントを初期化できませんでした。');
}

if (mode === 'cookie') {
  cookieCodec = createSessionCookieCodec(process.env.SESSION_SECRET || '');
}

export const SESSION_STORE_MODE = mode;

function randomSid() {
  return crypto.randomBytes(24).toString('base64url');
}

export async function saveSession(sid, payload) {
  // payload: { uid, name, avatar, access_token, refresh_token, access_expires_at, ... }
  if (SESSION_STORE_MODE === 'cookie') {
    const cookieValue = cookieCodec.encode(payload);
    return { sid: cookieValue, cookieValue, changed: true };
  }
  const sessionId = sid || randomSid();
  await kv.set(`sess:${sessionId}`, payload, { ex: SESSION_TTL_SEC });
  if (payload?.uid) {
    await kv.sadd(`user:${payload.uid}:sessions`, sessionId);
  }
  return { sid: sessionId, cookieValue: sessionId, changed: !sid };
}

export async function getSession(sid) {
  if (!sid) return null;
  if (SESSION_STORE_MODE === 'cookie') {
    return cookieCodec.decode(sid);
  }
  return (await kv.get(`sess:${sid}`)) || null;
}

export async function touchSession(sid) {
  if (SESSION_STORE_MODE === 'cookie' || !sid) return;
  await kv.expire(`sess:${sid}`, SESSION_TTL_SEC);
}

export async function deleteSession(sid, uid = null) {
  if (SESSION_STORE_MODE === 'cookie' || !sid) return;
  await kv.del(`sess:${sid}`);
  if (uid) await kv.srem(`user:${uid}:sessions`, sid);
}

export async function deleteAllSessions(uid) {
  if (SESSION_STORE_MODE === 'cookie' || !uid) return;
  const sids = await kv.smembers(`user:${uid}:sessions`);
  if (Array.isArray(sids) && sids.length) {
    await Promise.all(sids.map((s) => kv.del(`sess:${s}`)));
  }
  await kv.del(`user:${uid}:sessions`);
}

