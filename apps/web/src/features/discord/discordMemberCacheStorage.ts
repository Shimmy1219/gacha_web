export interface DiscordGuildMemberSummary {
  id: string;
  username: string;
  globalName: string | null;
  nick: string | null;
  avatar: string | null;
  displayName: string;
}

export interface DiscordMemberCacheEntry {
  guildId: string;
  members: DiscordGuildMemberSummary[];
  updatedAt: string;
}

const STORAGE_PREFIX = 'discord.memberCache';

export const DISCORD_MEMBER_CACHE_TTL_MS = 5 * 60 * 1000;

function getStorageKey(discordUserId: string, guildId: string): string {
  return `${STORAGE_PREFIX}::${discordUserId}::${guildId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizeMember(candidate: unknown): DiscordGuildMemberSummary | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const id = typeof candidate.id === 'string' ? candidate.id : null;
  const username = typeof candidate.username === 'string' ? candidate.username : '';
  const globalName =
    typeof candidate.globalName === 'string' || candidate.globalName === null
      ? candidate.globalName
      : null;
  const nick = typeof candidate.nick === 'string' || candidate.nick === null ? candidate.nick : null;
  const avatar =
    typeof candidate.avatar === 'string' || candidate.avatar === null ? candidate.avatar : null;
  const displayName = typeof candidate.displayName === 'string' ? candidate.displayName : '';

  if (!id || !displayName) {
    return null;
  }

  return {
    id,
    username,
    globalName,
    nick,
    avatar,
    displayName
  };
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

  try {
    const raw = window.localStorage.getItem(getStorageKey(discordUserId, guildId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<DiscordMemberCacheEntry> | null;
    if (!parsed || !Array.isArray(parsed.members)) {
      return null;
    }

    const members = parsed.members
      .map((member) => sanitizeMember(member))
      .filter((member): member is DiscordGuildMemberSummary => Boolean(member));

    if (members.length === 0) {
      return null;
    }

    const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
    if (!updatedAt) {
      return null;
    }

    return {
      guildId,
      members,
      updatedAt
    };
  } catch (error) {
    console.warn('Failed to read Discord member cache from localStorage', error);
    return null;
  }
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

  const sanitizedMembers = members
    .map((member) => sanitizeMember(member))
    .filter((member): member is DiscordGuildMemberSummary => Boolean(member));

  if (sanitizedMembers.length === 0) {
    return null;
  }

  const entry: DiscordMemberCacheEntry = {
    guildId,
    members: sanitizedMembers,
    updatedAt: new Date().toISOString()
  };

  try {
    window.localStorage.setItem(getStorageKey(discordUserId, guildId), JSON.stringify(entry));
    return entry;
  } catch (error) {
    console.warn('Failed to persist Discord member cache to localStorage', error);
    return null;
  }
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

  try {
    if (guildId) {
      window.localStorage.removeItem(getStorageKey(discordUserId, guildId));
      return;
    }

    const prefix = `${STORAGE_PREFIX}::${discordUserId}::`;
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key && key.startsWith(prefix)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.warn('Failed to clear Discord member cache from localStorage', error);
  }
}
