// /api/_lib/discordAuthStore.js
// Discord OAuth state を Upstash Redis (kv) に保存・取得・削除するヘルパー
import { kv } from './kv.js';

const DISCORD_AUTH_TTL_SEC = 60 * 10; // 10 minutes

function getKey(state) {
  if (!state) {
    throw new Error('Discord auth state key is required');
  }
  return `discord:auth:${state}`;
}

export async function saveDiscordAuthState(state, payload) {
  if (!payload?.verifier) {
    throw new Error('Discord auth verifier is required to store state');
  }
  const record = {
    verifier: payload.verifier,
    loginContext: payload.loginContext,
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
    return value;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error('Failed to parse discord auth state from kv');
    }
  }
  return null;
}

export async function deleteDiscordAuthState(state) {
  if (!state) return;
  await kv.del(getKey(state));
}
