import { loadDiscordUserState, updateDiscordUserState } from './discordUserStateStorage';

export interface DiscordGuildMemberSummary {
  id: string;
  username: string;
  globalName: string | null;
  nick: string | null;
  avatar: string | null;
  avatarUrl: string | null;
  displayName: string;
}

export interface DiscordMemberCacheEntry {
  guildId: string;
  members: DiscordGuildMemberSummary[];
  updatedAt: string;
}

const LEGACY_STORAGE_PREFIX = 'discord.memberCache';

export const DISCORD_MEMBER_CACHE_TTL_MS = 5 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function buildMemberAvatarUrl(memberId: string, avatar: string | null): string | null {
  if (!avatar) {
    return null;
  }
  return `https://cdn.discordapp.com/avatars/${memberId}/${avatar}.png?size=128`;
}

function sanitizeMember(candidate: unknown): DiscordGuildMemberSummary | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const id = typeof candidate.id === 'string' ? candidate.id : null;
  const username = typeof candidate.username === 'string' ? candidate.username : '';
  const globalName =
    typeof candidate.globalName === 'string' || candidate.globalName === null ? candidate.globalName : null;
  const nick = typeof candidate.nick === 'string' || candidate.nick === null ? candidate.nick : null;
  const avatar = typeof candidate.avatar === 'string' ? candidate.avatar : null;
  const displayName = typeof candidate.displayName === 'string' ? candidate.displayName : '';
  const avatarUrlCandidate =
    typeof candidate.avatarUrl === 'string' && candidate.avatarUrl.length > 0 ? candidate.avatarUrl : null;

  if (!id || !displayName) {
    return null;
  }

  return {
    id,
    username,
    globalName,
    nick,
    avatar,
    avatarUrl: avatarUrlCandidate ?? buildMemberAvatarUrl(id, avatar),
    displayName
  };
}

export function normalizeDiscordGuildMembers(candidates: unknown): DiscordGuildMemberSummary[] {
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates
    .map((candidate) => sanitizeMember(candidate))
    .filter((member): member is DiscordGuildMemberSummary => Boolean(member));
}

function loadLegacyDiscordMemberCache(
  discordUserId: string,
  guildId: string
): DiscordMemberCacheEntry | null {
  const storageKey = `${LEGACY_STORAGE_PREFIX}::${discordUserId}::${guildId}`;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || !Array.isArray(parsed.members)) {
      return null;
    }
    const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
    if (!updatedAt) {
      return null;
    }
    const members = normalizeDiscordGuildMembers(parsed.members);
    if (members.length === 0) {
      return null;
    }
    return {
      guildId,
      members,
      updatedAt
    };
  } catch (error) {
    console.warn('Failed to read legacy Discord member cache from localStorage', error);
    return null;
  }
}

function migrateLegacyMemberCache(
  discordUserId: string,
  entry: DiscordMemberCacheEntry
): DiscordMemberCacheEntry | null {
  const result = updateDiscordUserState(discordUserId, (state) => {
    const memberCache = state.memberCache ? { ...state.memberCache } : {};
    memberCache[entry.guildId] = entry;
    state.memberCache = memberCache;
    return state;
  });

  if (result?.memberCache && isRecord(result.memberCache[entry.guildId])) {
    try {
      window.localStorage.removeItem(`${LEGACY_STORAGE_PREFIX}::${discordUserId}::${entry.guildId}`);
    } catch (error) {
      console.warn('Failed to remove legacy Discord member cache entry from localStorage', error);
    }
    return entry;
  }

  return null;
}

export function loadDiscordMemberCache(
  discordUserId: string | undefined | null,
  guildId: string | undefined | null
): DiscordMemberCacheEntry | null {
  if (
    !discordUserId ||
    !guildId ||
    typeof window === 'undefined' ||
    typeof window.localStorage === 'undefined'
  ) {
    return null;
  }

  const state = loadDiscordUserState(discordUserId);
  const candidate = state?.memberCache && isRecord(state.memberCache) ? state.memberCache[guildId] : undefined;
  if (candidate && isRecord(candidate) && Array.isArray(candidate.members)) {
    const members = normalizeDiscordGuildMembers(candidate.members);
    const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : null;
    if (members.length > 0 && updatedAt) {
      return {
        guildId,
        members,
        updatedAt
      };
    }
  }

  const legacyEntry = loadLegacyDiscordMemberCache(discordUserId, guildId);
  if (!legacyEntry) {
    return null;
  }

  return migrateLegacyMemberCache(discordUserId, legacyEntry) ?? legacyEntry;
}

export function saveDiscordMemberCache(
  discordUserId: string | undefined | null,
  guildId: string | undefined | null,
  members: DiscordGuildMemberSummary[]
): DiscordMemberCacheEntry | null {
  if (
    !discordUserId ||
    !guildId ||
    typeof window === 'undefined' ||
    typeof window.localStorage === 'undefined'
  ) {
    return null;
  }

  const sanitizedMembers = normalizeDiscordGuildMembers(members);
  if (sanitizedMembers.length === 0) {
    return null;
  }

  const entry: DiscordMemberCacheEntry = {
    guildId,
    members: sanitizedMembers,
    updatedAt: new Date().toISOString()
  };

  updateDiscordUserState(discordUserId, (state) => {
    const memberCache = state.memberCache ? { ...state.memberCache } : {};
    memberCache[guildId] = entry;
    state.memberCache = memberCache;
    return state;
  });

  const persistedEntry = loadDiscordMemberCache(discordUserId, guildId);
  if (persistedEntry && persistedEntry.updatedAt === entry.updatedAt) {
    return persistedEntry;
  }

  console.warn('Failed to persist Discord member cache to localStorage');
  return null;
}

export function clearDiscordMemberCache(
  discordUserId: string | undefined | null,
  guildId?: string
): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  if (!discordUserId) {
    return;
  }

  updateDiscordUserState(discordUserId, (state) => {
    if (!state.memberCache) {
      return state;
    }

    if (!guildId) {
      delete state.memberCache;
      return state;
    }

    const memberCache = { ...state.memberCache };
    delete memberCache[guildId];
    if (Object.keys(memberCache).length === 0) {
      delete state.memberCache;
    } else {
      state.memberCache = memberCache;
    }
    return state;
  });

  if (!guildId) {
    try {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (key && key.startsWith(`${LEGACY_STORAGE_PREFIX}::${discordUserId}::`)) {
          window.localStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.warn('Failed to clear legacy Discord member cache entries from localStorage', error);
    }
    return;
  }

  try {
    window.localStorage.removeItem(`${LEGACY_STORAGE_PREFIX}::${discordUserId}::${guildId}`);
  } catch (error) {
    console.warn('Failed to clear legacy Discord member cache entry from localStorage', error);
  }
}
