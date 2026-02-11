import { loadDiscordUserState, updateDiscordUserState } from './discordUserStateStorage';
import { getDiscordInfoStore } from './discordInfoStore';

export interface DiscordGuildMemberSummary {
  id: string;
  username: string;
  globalName: string | null;
  nick: string | null;
  joinedAt: string | null;
  avatar: string | null;
  avatarUrl: string | null;
  displayName: string;
  giftChannelId?: string | null;
  giftChannelName?: string | null;
  giftChannelParentId?: string | null;
  giftChannelBotHasView?: boolean | null;
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

function hasOwnProperty(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export interface DiscordMemberGiftChannelInfo {
  memberId: string;
  channelId: string;
  channelName: string | null;
  channelParentId: string | null;
  botHasView: boolean | null;
}

export type DiscordMemberGiftChannelMergeMode = 'replace' | 'upsert';

export interface DiscordMemberGiftChannelMergeOptions {
  memberIds?: string[] | null;
  mode?: DiscordMemberGiftChannelMergeMode;
}

function cloneWithGiftChannelMetadata(
  member: DiscordGuildMemberSummary,
  source: DiscordGuildMemberSummary
): DiscordGuildMemberSummary {
  const next: DiscordGuildMemberSummary = { ...member };

  if (hasOwnProperty(source, 'giftChannelId')) {
    next.giftChannelId = source.giftChannelId ?? null;
  } else {
    delete next.giftChannelId;
  }

  if (hasOwnProperty(source, 'giftChannelName')) {
    next.giftChannelName = source.giftChannelName ?? null;
  } else {
    delete next.giftChannelName;
  }

  if (hasOwnProperty(source, 'giftChannelParentId')) {
    next.giftChannelParentId = source.giftChannelParentId ?? null;
  } else {
    delete next.giftChannelParentId;
  }

  if (hasOwnProperty(source, 'giftChannelBotHasView')) {
    next.giftChannelBotHasView = source.giftChannelBotHasView ?? null;
  } else {
    delete next.giftChannelBotHasView;
  }

  return next;
}

export function applyGiftChannelMetadataFromCache(
  members: DiscordGuildMemberSummary[],
  cachedMembers: DiscordGuildMemberSummary[] | undefined | null
): DiscordGuildMemberSummary[] {
  if (!Array.isArray(members) || members.length === 0) {
    return members;
  }

  if (!Array.isArray(cachedMembers) || cachedMembers.length === 0) {
    return members;
  }

  const cacheMap = new Map(cachedMembers.map((entry) => [entry.id, entry]));

  return members.map((member) => {
    const cached = cacheMap.get(member.id);
    return cached ? cloneWithGiftChannelMetadata(member, cached) : member;
  });
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

  const record = candidate as Record<string, unknown>;

  const id = typeof record.id === 'string' ? record.id : null;
  const username = typeof record.username === 'string' ? record.username : '';
  const globalName =
    typeof record.globalName === 'string' || record.globalName === null ? (record.globalName as string | null) : null;
  const nick = typeof record.nick === 'string' || record.nick === null ? (record.nick as string | null) : null;
  const joinedAt =
    typeof record.joinedAt === 'string' || record.joinedAt === null ? (record.joinedAt as string | null) : null;
  const avatar = typeof record.avatar === 'string' ? (record.avatar as string) : null;
  const displayName = typeof record.displayName === 'string' ? (record.displayName as string) : '';
  const avatarUrlCandidate =
    typeof record.avatarUrl === 'string' && record.avatarUrl.length > 0 ? (record.avatarUrl as string) : null;

  let giftChannelId: string | null | undefined;
  if (hasOwnProperty(record, 'giftChannelId')) {
    const raw = record.giftChannelId;
    if (typeof raw === 'string' && raw.trim().length > 0) {
      giftChannelId = raw.trim();
    } else if (raw === null) {
      giftChannelId = null;
    } else {
      giftChannelId = null;
    }
  }

  let giftChannelName: string | null | undefined;
  if (hasOwnProperty(record, 'giftChannelName')) {
    const raw = record.giftChannelName;
    if (typeof raw === 'string') {
      giftChannelName = raw;
    } else if (raw === null) {
      giftChannelName = null;
    }
  }

  let giftChannelParentId: string | null | undefined;
  if (hasOwnProperty(record, 'giftChannelParentId')) {
    const raw = record.giftChannelParentId;
    if (typeof raw === 'string' && raw.trim().length > 0) {
      giftChannelParentId = raw.trim();
    } else if (raw === null) {
      giftChannelParentId = null;
    }
  }

  let giftChannelBotHasView: boolean | null | undefined;
  if (hasOwnProperty(record, 'giftChannelBotHasView')) {
    const raw = record.giftChannelBotHasView;
    if (typeof raw === 'boolean') {
      giftChannelBotHasView = raw;
    } else if (raw === null) {
      giftChannelBotHasView = null;
    }
  }

  if (!id || !displayName) {
    return null;
  }

  const sanitized: DiscordGuildMemberSummary = {
    id,
    username,
    globalName,
    nick,
    joinedAt,
    avatar,
    avatarUrl: avatarUrlCandidate ?? buildMemberAvatarUrl(id, avatar),
    displayName
  };

  if (giftChannelId !== undefined) {
    sanitized.giftChannelId = giftChannelId;
  }
  if (giftChannelName !== undefined) {
    sanitized.giftChannelName = giftChannelName ?? null;
  }
  if (giftChannelParentId !== undefined) {
    sanitized.giftChannelParentId = giftChannelParentId ?? null;
  }
  if (giftChannelBotHasView !== undefined) {
    sanitized.giftChannelBotHasView = giftChannelBotHasView ?? null;
  }

  return sanitized;
}

export function normalizeDiscordGuildMembers(candidates: unknown): DiscordGuildMemberSummary[] {
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates
    .map((candidate) => sanitizeMember(candidate))
    .filter((member): member is DiscordGuildMemberSummary => Boolean(member));
}

function sanitizeGiftChannelFromApi(candidate: unknown): DiscordMemberGiftChannelInfo | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const memberId = typeof record['member_id'] === 'string' ? (record['member_id'] as string) : null;
  const channelId = typeof record['channel_id'] === 'string' ? (record['channel_id'] as string) : null;
  if (!memberId || !channelId) {
    return null;
  }

  const channelNameRaw = record['channel_name'];
  const channelName =
    typeof channelNameRaw === 'string'
      ? (channelNameRaw as string)
      : channelNameRaw === null
        ? null
        : null;

  const parentRaw = record['parent_id'];
  let channelParentId: string | null = null;
  if (typeof parentRaw === 'string') {
    const trimmed = (parentRaw as string).trim();
    channelParentId = trimmed.length > 0 ? trimmed : null;
  } else if (parentRaw === null) {
    channelParentId = null;
  }

  const botHasViewRaw = record['bot_has_view'];
  const botHasView = typeof botHasViewRaw === 'boolean'
    ? (botHasViewRaw as boolean)
    : botHasViewRaw === null
      ? null
      : null;

  return {
    memberId,
    channelId,
    channelName,
    channelParentId,
    botHasView,
  };
}

export function normalizeDiscordMemberGiftChannels(candidates: unknown): DiscordMemberGiftChannelInfo[] {
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates
    .map((candidate) => sanitizeGiftChannelFromApi(candidate))
    .filter((entry): entry is DiscordMemberGiftChannelInfo => Boolean(entry));
}

function sanitizeGiftChannelInfo(candidate: unknown): DiscordMemberGiftChannelInfo | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const memberId = typeof record.memberId === 'string' ? (record.memberId as string) : null;
  const channelId = typeof record.channelId === 'string' ? (record.channelId as string) : null;
  if (!memberId || !channelId) {
    return null;
  }

  const channelNameRaw = record.channelName;
  const channelName =
    typeof channelNameRaw === 'string'
      ? (channelNameRaw as string)
      : channelNameRaw === null
        ? null
        : null;

  const parentRaw = record.channelParentId;
  let channelParentId: string | null = null;
  if (typeof parentRaw === 'string') {
    const trimmed = (parentRaw as string).trim();
    channelParentId = trimmed.length > 0 ? trimmed : null;
  } else if (parentRaw === null) {
    channelParentId = null;
  }

  const botHasViewRaw = record.botHasView;
  const botHasView = typeof botHasViewRaw === 'boolean'
    ? (botHasViewRaw as boolean)
    : botHasViewRaw === null
      ? null
      : null;

  return {
    memberId,
    channelId,
    channelName,
    channelParentId,
    botHasView,
  };
}

function normalizeMemberIdList(value: string[] | null | undefined): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const normalized = value
    .map((candidate) => (typeof candidate === 'string' ? candidate.trim() : ''))
    .filter(Boolean);

  return normalized.length > 0 ? normalized : null;
}

export function mergeDiscordGuildMembersGiftChannelMetadata(
  members: DiscordGuildMemberSummary[],
  channels: DiscordMemberGiftChannelInfo[],
  options?: DiscordMemberGiftChannelMergeOptions
): DiscordGuildMemberSummary[] {
  if (!Array.isArray(members) || members.length === 0) {
    return [];
  }

  const sanitizedChannels = Array.isArray(channels)
    ? channels
        .map((entry) => sanitizeGiftChannelInfo(entry))
        .filter((entry): entry is DiscordMemberGiftChannelInfo => Boolean(entry))
    : [];

  const channelMap = new Map(sanitizedChannels.map((entry) => [entry.memberId, entry]));

  const targetMemberIds = normalizeMemberIdList(options?.memberIds);
  const targetIdSet = targetMemberIds ? new Set(targetMemberIds) : null;
  const mode: DiscordMemberGiftChannelMergeMode = options?.mode === 'upsert' ? 'upsert' : 'replace';

  return members.map((member) => {
    if (targetIdSet && !targetIdSet.has(member.id)) {
      return member;
    }

    const info = channelMap.get(member.id);
    if (info) {
      return {
        ...member,
        giftChannelId: info.channelId,
        giftChannelName: info.channelName ?? null,
        giftChannelParentId: info.channelParentId ?? null,
        giftChannelBotHasView: info.botHasView ?? null
      };
    }

    if (mode === 'upsert') {
      return member;
    }

    const nextMember: DiscordGuildMemberSummary = { ...member };
    delete nextMember.giftChannelId;
    delete nextMember.giftChannelName;
    delete nextMember.giftChannelParentId;
    delete nextMember.giftChannelBotHasView;
    return nextMember;
  });
}

export function mergeDiscordMemberGiftChannels(
  discordUserId: string | undefined | null,
  guildId: string | undefined | null,
  channels: DiscordMemberGiftChannelInfo[],
  options?: DiscordMemberGiftChannelMergeOptions
): DiscordMemberCacheEntry | null {
  if (
    !discordUserId ||
    !guildId ||
    typeof window === 'undefined'
  ) {
    return null;
  }

  updateDiscordUserState(discordUserId, (state) => {
    if (!state.memberCache || !isRecord(state.memberCache)) {
      return state;
    }

    const entryCandidate = state.memberCache[guildId];
    if (!entryCandidate || !isRecord(entryCandidate)) {
      return state;
    }

    const membersCandidate = entryCandidate.members;
    if (!Array.isArray(membersCandidate)) {
      return state;
    }

    const normalizedMembers = normalizeDiscordGuildMembers(membersCandidate);
    if (normalizedMembers.length === 0) {
      return state;
    }

    const updatedMembers = mergeDiscordGuildMembersGiftChannelMetadata(normalizedMembers, channels, options);

    const nextEntry = { ...entryCandidate, members: updatedMembers };
    const memberCache = { ...state.memberCache, [guildId]: nextEntry };
    state.memberCache = memberCache;
    return state;
  });

  return loadDiscordMemberCache(discordUserId, guildId);
}

function loadLegacyDiscordMemberCache(
  discordUserId: string,
  guildId: string
): DiscordMemberCacheEntry | null {
  try {
    const raw = getDiscordInfoStore().getJson<Record<string, unknown>>(
      `${LEGACY_STORAGE_PREFIX}::${discordUserId}::${guildId}`
    );
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    if (!isRecord(raw) || !Array.isArray(raw.members)) {
      return null;
    }
    const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : null;
    if (!updatedAt) {
      return null;
    }
    const members = normalizeDiscordGuildMembers(raw.members);
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
      void getDiscordInfoStore().remove(`${LEGACY_STORAGE_PREFIX}::${discordUserId}::${entry.guildId}`);
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
    typeof window === 'undefined'
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
    typeof window === 'undefined'
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
  if (typeof window === 'undefined') {
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
      void getDiscordInfoStore().removeByPrefix(`${LEGACY_STORAGE_PREFIX}::${discordUserId}::`);
    } catch (error) {
      console.warn('Failed to clear legacy Discord member cache entries from localStorage', error);
    }
    return;
  }

  try {
    void getDiscordInfoStore().remove(`${LEGACY_STORAGE_PREFIX}::${discordUserId}::${guildId}`);
  } catch (error) {
    console.warn('Failed to clear legacy Discord member cache entry from localStorage', error);
  }
}
