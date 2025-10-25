// /api/_lib/discordHandoffStore.js
// Discord OAuth handoff token を介して sid を受け渡すためのヘルパー
import { kv } from './kv.js';

const DISCORD_HANDOFF_TTL_SEC = 60 * 5; // 5 minutes

function getKey(token) {
  if (!token) {
    throw new Error('Discord handoff token is required');
  }
  return `discord:handoff:${token}`;
}

function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sid = typeof raw.sid === 'string' ? raw.sid : null;
  const uid = typeof raw.uid === 'string' ? raw.uid : null;
  if (!sid || !uid) {
    return null;
  }
  const user = {
    id: uid,
    name: typeof raw.name === 'string' ? raw.name : undefined,
    avatar: typeof raw.avatar === 'string' ? raw.avatar : undefined,
  };
  return {
    sid,
    user,
    issuedAt:
      typeof raw.issuedAt === 'number' && Number.isFinite(raw.issuedAt) ? raw.issuedAt : undefined,
  };
}

export async function saveDiscordHandoff(token, payload) {
  if (!payload || typeof payload.sid !== 'string' || !payload.sid) {
    throw new Error('Discord handoff payload requires sid');
  }
  if (typeof payload.uid !== 'string' || !payload.uid) {
    throw new Error('Discord handoff payload requires uid');
  }

  const record = {
    sid: payload.sid,
    uid: payload.uid,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    avatar: typeof payload.avatar === 'string' ? payload.avatar : undefined,
    issuedAt: Date.now(),
  };

  await kv.set(getKey(token), record, { ex: DISCORD_HANDOFF_TTL_SEC });
  return record;
}

export async function consumeDiscordHandoff(token) {
  if (!token) return null;
  const value = await kv.getdel(getKey(token));
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
      throw new Error('Failed to parse discord handoff payload from kv');
    }
  }
  return null;
}

