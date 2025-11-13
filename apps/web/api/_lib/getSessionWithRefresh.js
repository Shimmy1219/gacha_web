// /api/_lib/getSessionWithRefresh.js
// APIごとに呼び出して、必要なら自動でDiscordトークンをリフレッシュ
import { kv } from './kv.js';
import { getSession, saveSession, touchSession } from './sessionStore.js';

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForSessionUpdate(sid, previous, { maxWaitMs = 1500 } = {}) {
  const start = Date.now();
  let attempt = 0;
  let last = previous;
  while (Date.now() - start < maxWaitMs) {
    const current = await getSession(sid);
    if (!current) return null;

    const verChanged = (current.ver || 0) !== (previous?.ver || 0);
    const expiresChanged =
      (current.access_expires_at || 0) !== (previous?.access_expires_at || 0);

    if (verChanged || expiresChanged) {
      return current;
    }

    last = current;
    attempt += 1;
    const waitMs = Math.min(50 * 2 ** attempt, 200);
    await sleep(waitMs);
  }
  return last;
}

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
  let sessionToReturn = sess;
  if (now > (sess.access_expires_at || 0) - 30_000) {
    const lockKey = `lock:sess:${sid}`;
    const got = await kv.set(lockKey, '1', { nx: true, ex: 5 });
    let shouldRefetch = false;
    try {
      const latest = (await getSession(sid)) || sess;
      if (now > (latest.access_expires_at || 0) - 30_000) {
        if (got) {
          const r = await discordRefresh(latest.refresh_token);
          latest.access_token = r.access_token;
          latest.refresh_token = r.refresh_token;
          latest.access_expires_at = now + (r.expires_in || 3600) * 1000;
          latest.ver = (latest.ver || 0) + 1;
          await saveSession(sid, latest);
          sessionToReturn = latest;
        } else {
          shouldRefetch = true;
        }
      } else {
        sessionToReturn = latest;
      }
    } finally {
      if (got) await kv.del(lockKey);
    }

    if (shouldRefetch) {
      const refreshed = await waitForSessionUpdate(sid, sess);
      if (refreshed) {
        sessionToReturn = refreshed;
      }
    }
  }
  await touchSession(sid);
  return sessionToReturn;
}

