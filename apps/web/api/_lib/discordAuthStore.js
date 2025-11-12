// /api/_lib/discordAuthStore.js
// Discord OAuth state を Upstash Redis (kv) に保存・取得・削除するヘルパー
import crypto from 'crypto';
import { kv } from './kv.js';

const DISCORD_AUTH_TTL_SEC = 60 * 10; // 10 minutes
const DISCORD_PWA_SESSION_TTL_SEC = 60 * 10; // 10 minutes

function getKey(state) {
  if (!state) {
    throw new Error('Discord auth state key is required');
  }
  return `discord:auth:${state}`;
}

function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const verifier = typeof raw.verifier === 'string' ? raw.verifier : null;
  if (!verifier) {
    return null;
  }
  return {
    verifier,
    loginContext: typeof raw.loginContext === 'string' ? raw.loginContext : undefined,
  };
}

function getPwaSessionKey(state) {
  if (!state) {
    throw new Error('Discord PWA session state key is required');
  }
  return `discord:pwa-session:${state}`;
}

function normalizePwaSessionRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sid = typeof raw.sid === 'string' ? raw.sid : null;
  if (!sid) {
    return null;
  }
  const claimTokenDigest =
    typeof raw.claimTokenDigest === 'string' && raw.claimTokenDigest.length > 0
      ? raw.claimTokenDigest
      : undefined;
  return {
    sid,
    userId: typeof raw.userId === 'string' ? raw.userId : undefined,
    loginContext: typeof raw.loginContext === 'string' ? raw.loginContext : undefined,
    issuedAt: typeof raw.issuedAt === 'number' ? raw.issuedAt : undefined,
    metadata:
      raw.metadata && typeof raw.metadata === 'object'
        ? raw.metadata
        : undefined,
    claimTokenDigest,
  };
}

export function digestDiscordPwaClaimToken(token) {
  if (typeof token !== 'string' || token.length === 0) {
    return null;
  }
  return crypto.createHash('sha256').update(token).digest('base64');
}

export async function saveDiscordAuthState(state, payload) {
  if (!payload || typeof payload.verifier !== 'string' || !payload.verifier) {
    throw new Error('Discord auth verifier is required to store state');
  }
  const record = {
    verifier: payload.verifier,
    loginContext: typeof payload.loginContext === 'string' ? payload.loginContext : undefined,
  };
  await kv.set(getKey(state), record, { ex: DISCORD_AUTH_TTL_SEC });
  return record;
}

export async function getDiscordAuthState(state) {
  if (!state) return null;
  const value = await kv.get(getKey(state));
  if (value == null) {
    return null;
  }
  if (typeof value === 'object') {
    return normalizeRecord(value);
  }
  if (typeof value === 'string') {
    try {
      return normalizeRecord(JSON.parse(value));
    } catch (error) {
      throw new Error('Failed to parse discord auth state from kv', {
        cause: error instanceof Error ? error : undefined
      });
    }
  }
  return null;
}

export async function consumeDiscordAuthState(state) {
  if (!state) return null;
  const value = await kv.getdel(getKey(state));
  if (value == null) {
    return null;
  }
  if (typeof value === 'object') {
    return normalizeRecord(value);
  }
  if (typeof value === 'string') {
    try {
      return normalizeRecord(JSON.parse(value));
    } catch (error) {
      throw new Error('Failed to parse discord auth state from kv', {
        cause: error instanceof Error ? error : undefined
      });
    }
  }
  return null;
}

export async function deleteDiscordAuthState(state) {
  if (!state) return;
  await kv.del(getKey(state));
}

export async function saveDiscordPwaSession(state, payload) {
  if (!state) {
    throw new Error('Discord PWA session state key is required to store record');
  }
  if (!payload || typeof payload.sid !== 'string' || !payload.sid) {
    throw new Error('Discord PWA session sid is required to store record');
  }

  const record = {
    sid: payload.sid,
    userId: typeof payload.userId === 'string' ? payload.userId : undefined,
    loginContext: typeof payload.loginContext === 'string' ? payload.loginContext : undefined,
    issuedAt: typeof payload.issuedAt === 'number' ? payload.issuedAt : Date.now(),
    metadata:
      payload.metadata && typeof payload.metadata === 'object'
        ? payload.metadata
        : undefined,
  };

  if (typeof payload.claimTokenDigest === 'string' && payload.claimTokenDigest.length > 0) {
    record.claimTokenDigest = payload.claimTokenDigest;
  }

  await kv.set(getPwaSessionKey(state), record, { ex: DISCORD_PWA_SESSION_TTL_SEC });
  return record;
}

export async function getDiscordPwaSession(state) {
  if (!state) {
    return null;
  }
  const value = await kv.get(getPwaSessionKey(state));
  if (value == null) {
    return null;
  }
  if (typeof value === 'object') {
    return normalizePwaSessionRecord(value);
  }
  if (typeof value === 'string') {
    try {
      return normalizePwaSessionRecord(JSON.parse(value));
    } catch (error) {
      throw new Error('Failed to parse discord pwa session from kv', {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }
  return null;
}

export async function consumeDiscordPwaSession(state) {
  if (!state) {
    return null;
  }
  const value = await kv.getdel(getPwaSessionKey(state));
  if (value == null) {
    return null;
  }
  if (typeof value === 'object') {
    return normalizePwaSessionRecord(value);
  }
  if (typeof value === 'string') {
    try {
      return normalizePwaSessionRecord(JSON.parse(value));
    } catch (error) {
      throw new Error('Failed to parse discord pwa session from kv', {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }
  return null;
}

export async function deleteDiscordPwaSession(state) {
  if (!state) return;
  await kv.del(getPwaSessionKey(state));
}
