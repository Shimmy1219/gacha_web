// /api/_lib/getSessionWithRefresh.js
// APIごとに呼び出して、必要なら自動でDiscordトークンをリフレッシュ
import { getKvClient } from './kv.js';
import { SESSION_STORE_MODE, getSession, saveSession, touchSession } from './sessionStore.js';

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

const kv = SESSION_STORE_MODE === 'kv' ? getKvClient() : null;

export async function getSessionWithRefresh(sid) {
  const sess = await getSession(sid);
  if (!sess) {
    return { session: null, cookieValue: null, cookieUpdated: false };
  }

  const now = Date.now();
  let currentSession = sess;
  let cookieValue = sid || null;
  let cookieUpdated = false;

  const needsRefresh = now > (sess.access_expires_at || 0) - 30_000;
  if (needsRefresh) {
    let lockKey = null;
    let lockAcquired = false;
    if (SESSION_STORE_MODE === 'kv' && sid) {
      lockKey = `lock:sess:${sid}`;
      const got = await kv.set(lockKey, '1', { nx: true, ex: 5 });
      lockAcquired = Boolean(got);
    }
    try {
      const latest = (await getSession(sid)) || sess;
      const stillNeedsRefresh = now > (latest.access_expires_at || 0) - 30_000;
      if (stillNeedsRefresh && (SESSION_STORE_MODE !== 'kv' || lockAcquired)) {
        const r = await discordRefresh(latest.refresh_token);
        latest.access_token = r.access_token;
        latest.refresh_token = r.refresh_token;
        latest.access_expires_at = now + (r.expires_in || 3600) * 1000;
        latest.ver = (latest.ver || 0) + 1;
        const saveResult = await saveSession(sid, latest);
        currentSession = latest;
        cookieValue = saveResult.cookieValue;
        cookieUpdated = saveResult.changed || cookieValue !== sid;
      } else {
        currentSession = latest;
      }
    } finally {
      if (SESSION_STORE_MODE === 'kv' && lockAcquired && lockKey) {
        await kv.del(lockKey);
      }
    }
  }

  await touchSession(cookieValue || sid);
  return { session: currentSession, cookieValue: cookieValue || sid || null, cookieUpdated };
}

