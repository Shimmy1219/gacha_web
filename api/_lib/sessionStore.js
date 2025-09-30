// /api/_lib/sessionStore.js
// 長期ログインセッション (sid) を Upstash に保存
import crypto from 'crypto';
import { kv } from './kv.js';

const SESSION_TTL_SEC = 60 * 60 * 24 * 30; // 30日

export function newSid() {
  return crypto.randomBytes(24).toString('base64url');
}

export async function saveSession(sid, payload) {
  // payload: { uid, name, avatar, access_token, refresh_token, access_expires_at, ... }
  await kv.set(`sess:${sid}`, payload, { ex: SESSION_TTL_SEC });
  if (payload?.uid) {
    await kv.sadd(`user:${payload.uid}:sessions`, sid);
  }
  return sid;
}

export async function getSession(sid) {
  if (!sid) return null;
  return (await kv.get(`sess:${sid}`)) || null;
}

export async function touchSession(sid) {
  await kv.expire(`sess:${sid}`, SESSION_TTL_SEC);
}

export async function deleteSession(sid, uid = null) {
  await kv.del(`sess:${sid}`);
  if (uid) await kv.srem(`user:${uid}:sessions`, sid);
}

export async function deleteAllSessions(uid) {
  const sids = await kv.smembers(`user:${uid}:sessions`);
  if (Array.isArray(sids) && sids.length) {
    await Promise.all(sids.map((s) => kv.del(`sess:${s}`)));
  }
  await kv.del(`user:${uid}:sessions`);
}
