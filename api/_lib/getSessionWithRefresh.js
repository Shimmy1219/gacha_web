// /api/_lib/getSessionWithRefresh.js
// APIごとに呼び出して、必要なら自動でDiscordトークンをリフレッシュ
import { kv } from './kv.js';
import { getSession, saveSession, touchSession } from './sessionStore.js';

async function discordRefresh(refreshToken) {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const r = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Discord refresh failed: ${r.status} ${t}`);
  }
  return r.json();
}

export async function getSessionWithRefresh(sid) {
  const sess = await getSession(sid);
  if (!sess) return null;

  const now = Date.now();
  if (now > (sess.access_expires_at || 0) - 30_000) {
    const lockKey = `lock:sess:${sid}`;
    const got = await kv.set(lockKey, '1', { nx: true, ex: 5 });
    try {
      const latest = (await getSession(sid)) || sess;
      if (got && now > (latest.access_expires_at || 0) - 30_000) {
        const r = await discordRefresh(latest.refresh_token);
        latest.access_token = r.access_token;
        latest.refresh_token = r.refresh_token;
        latest.access_expires_at = now + (r.expires_in || 3600) * 1000;
        latest.ver = (latest.ver || 0) + 1;
        await saveSession(sid, latest);
        return latest;
      }
    } finally {
      if (got) await kv.del(lockKey);
    }
  }
  await touchSession(sid);
  return sess;
}

