// /api/_lib/discordUserStateStore.js
// Discordユーザー状態（discord.userState）を永続化するためのKVストアラッパー
import { kv } from './kv.js';

const KEY_PREFIX = 'discord:user-state:';

function requireUserId(discordUserId) {
  if (!discordUserId || typeof discordUserId !== 'string') {
    throw new Error('Discord user id is required to store user state');
  }
}

function getKey(discordUserId) {
  requireUserId(discordUserId);
  return `${KEY_PREFIX}${discordUserId}`;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonSerializable(value) {
  try {
    JSON.stringify(value);
    return true;
  } catch (error) {
    return false;
  }
}

function normalizeMemberCache(candidate) {
  if (!isPlainObject(candidate)) {
    return { ok: false, error: 'memberCache must be an object' };
  }

  const normalized = {};
  for (const [guildId, entry] of Object.entries(candidate)) {
    if (entry === undefined) {
      continue;
    }
    if (typeof guildId !== 'string' || guildId.length === 0) {
      continue;
    }
    if (!isJsonSerializable(entry)) {
      return { ok: false, error: 'memberCache entries must be JSON-serializable' };
    }
    normalized[guildId] = entry;
  }

  return { ok: true, value: normalized };
}

export function normalizeDiscordUserStateInput(payload) {
  if (!isPlainObject(payload)) {
    return { ok: false, error: 'payload must be an object' };
  }

  const normalized = {};
  let touched = false;

  if (Object.prototype.hasOwnProperty.call(payload, 'selection')) {
    if (!isJsonSerializable(payload.selection ?? null)) {
      return { ok: false, error: 'selection must be JSON-serializable' };
    }
    normalized.selection = payload.selection ?? null;
    touched = true;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'memberCache')) {
    const result = normalizeMemberCache(payload.memberCache);
    if (!result.ok) {
      return result;
    }
    normalized.memberCache = result.value;
    touched = true;
  }

  if (!touched) {
    return { ok: false, error: 'payload must include at least one of selection or memberCache' };
  }

  return { ok: true, value: normalized };
}

function normalizeStoredRecord(raw) {
  if (!isPlainObject(raw)) return null;

  const record = {};

  if (Object.prototype.hasOwnProperty.call(raw, 'selection')) {
    record.selection = raw.selection ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'memberCache') && isPlainObject(raw.memberCache)) {
    const cache = {};
    for (const [guildId, entry] of Object.entries(raw.memberCache)) {
      if (entry !== undefined) {
        cache[guildId] = entry;
      }
    }
    record.memberCache = cache;
  }

  const updatedAt = Number(raw.updatedAt);
  record.updatedAt = Number.isFinite(updatedAt) ? updatedAt : Date.now();

  return record;
}

export async function saveDiscordUserState(discordUserId, payload) {
  requireUserId(discordUserId);

  const validation = normalizeDiscordUserStateInput(payload);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const record = { ...validation.value, updatedAt: Date.now() };
  await kv.set(getKey(discordUserId), record);
  return record;
}

export async function getDiscordUserState(discordUserId) {
  requireUserId(discordUserId);

  const value = await kv.get(getKey(discordUserId));
  if (value == null) {
    return null;
  }

  if (typeof value === 'string') {
    try {
      return normalizeStoredRecord(JSON.parse(value));
    } catch (error) {
      throw new Error('Failed to parse discord user state from kv', {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  return normalizeStoredRecord(value);
}

export async function deleteDiscordUserState(discordUserId) {
  requireUserId(discordUserId);
  await kv.del(getKey(discordUserId));
}
