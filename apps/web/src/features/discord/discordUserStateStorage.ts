export interface DiscordUserStateSnapshot {
  selection?: unknown;
  memberCache?: Record<string, unknown> | undefined;
}

export const DISCORD_USER_STATE_STORAGE_PREFIX = 'discord.userState';

function getStorageKey(discordUserId: string): string {
  return `${DISCORD_USER_STATE_STORAGE_PREFIX}::${discordUserId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasOwnProperty(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeDiscordUserState(
  candidate: DiscordUserStateSnapshot | null | undefined
): DiscordUserStateSnapshot | null {
  if (!candidate) {
    return null;
  }

  const normalized: DiscordUserStateSnapshot = {};

  if (hasOwnProperty(candidate, 'selection')) {
    normalized.selection = candidate.selection ?? null;
  }

  if (hasOwnProperty(candidate, 'memberCache')) {
    const cache = candidate.memberCache;
    if (cache && typeof cache === 'object') {
      const normalizedCache: Record<string, unknown> = {};
      for (const [guildId, entry] of Object.entries(cache)) {
        if (entry !== undefined && entry !== null) {
          normalizedCache[guildId] = entry;
        }
      }
      if (Object.keys(normalizedCache).length > 0) {
        normalized.memberCache = normalizedCache;
      }
    }
  }

  if (!hasOwnProperty(normalized, 'selection') && !hasOwnProperty(normalized, 'memberCache')) {
    return null;
  }

  return normalized;
}

export function loadDiscordUserState(
  discordUserId: string | undefined | null
): DiscordUserStateSnapshot | null {
  if (!discordUserId || typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(discordUserId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }

    const snapshot: DiscordUserStateSnapshot = {};
    if (hasOwnProperty(parsed, 'selection')) {
      snapshot.selection = parsed.selection ?? null;
    }
    if (hasOwnProperty(parsed, 'memberCache') && isRecord(parsed.memberCache)) {
      snapshot.memberCache = { ...parsed.memberCache };
    }
    return snapshot;
  } catch (error) {
    console.warn('Failed to read Discord user state from localStorage', error);
    return null;
  }
}

export function updateDiscordUserState(
  discordUserId: string | undefined | null,
  mutator: (state: DiscordUserStateSnapshot) => DiscordUserStateSnapshot | void | null
): DiscordUserStateSnapshot | null {
  if (!discordUserId || typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }

  const currentState = loadDiscordUserState(discordUserId);
  const draft: DiscordUserStateSnapshot = {
    ...(currentState ?? {}),
    memberCache: currentState?.memberCache ? { ...currentState.memberCache } : currentState?.memberCache
  };

  const result = mutator(draft) ?? draft;
  const normalized = normalizeDiscordUserState(result);

  try {
    const storageKey = getStorageKey(discordUserId);
    if (!normalized) {
      window.localStorage.removeItem(storageKey);
      return null;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(normalized));
    return normalized;
  } catch (error) {
    console.warn('Failed to persist Discord user state to localStorage', error);
    return currentState ?? null;
  }
}

export function clearDiscordUserState(discordUserId: string | undefined | null): void {
  if (!discordUserId || typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(getStorageKey(discordUserId));
  } catch (error) {
    console.warn('Failed to clear Discord user state from localStorage', error);
  }
}
