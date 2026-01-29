import {
  clearDiscordMemberCache,
  loadDiscordMemberCache
} from './discordMemberCacheStorage';
import {
  DISCORD_USER_STATE_STORAGE_PREFIX,
  loadDiscordUserState,
  updateDiscordUserState
} from './discordUserStateStorage';
import { getDiscordInfoStore } from './discordInfoStore';

export interface DiscordGuildCategorySelection {
  id: string;
  name: string;
  selectedAt?: string;
}

export interface DiscordGuildSelection {
  guildId: string;
  guildName: string;
  guildIcon?: string | null;
  selectedAt: string;
  privateChannelCategory?: DiscordGuildCategorySelection | null;
  memberCacheUpdatedAt?: string | null;
}

const LEGACY_STORAGE_PREFIX = 'discord.guildSelection';
const LEGACY_MEMBER_CACHE_PREFIX = 'discord.memberCache';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizeCategory(candidate: unknown): DiscordGuildCategorySelection | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const id = typeof candidate.id === 'string' ? candidate.id : null;
  const name = typeof candidate.name === 'string' ? candidate.name : null;
  if (!id || !name) {
    return null;
  }

  const selection: DiscordGuildCategorySelection = {
    id,
    name
  };
  if (typeof candidate.selectedAt === 'string') {
    selection.selectedAt = candidate.selectedAt;
  }
  return selection;
}

function sanitizeGuildSelection(candidate: unknown): DiscordGuildSelection | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const guildId = typeof candidate.guildId === 'string' ? candidate.guildId : null;
  const guildName = typeof candidate.guildName === 'string' ? candidate.guildName : null;
  if (!guildId || !guildName) {
    return null;
  }

  const guildIcon =
    typeof candidate.guildIcon === 'string'
      ? candidate.guildIcon
      : candidate.guildIcon === null
        ? null
        : undefined;

  const selectedAt = typeof candidate.selectedAt === 'string' ? candidate.selectedAt : new Date().toISOString();
  const privateChannelCategory = sanitizeCategory(candidate.privateChannelCategory) ?? null;
  const memberCacheUpdatedAt =
    typeof candidate.memberCacheUpdatedAt === 'string'
      ? candidate.memberCacheUpdatedAt
      : candidate.memberCacheUpdatedAt === null
        ? null
        : undefined;

  return {
    guildId,
    guildName,
    guildIcon,
    selectedAt,
    privateChannelCategory,
    memberCacheUpdatedAt: memberCacheUpdatedAt ?? null
  };
}

function loadLegacyDiscordGuildSelection(discordUserId: string): DiscordGuildSelection | null {
  try {
    const raw = getDiscordInfoStore().getJson<Record<string, unknown>>(
      `${LEGACY_STORAGE_PREFIX}::${discordUserId}`
    );
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    return sanitizeGuildSelection(raw);
  } catch (error) {
    console.warn('Failed to read legacy Discord guild selection from localStorage', error);
    return null;
  }
}

function migrateLegacyDiscordGuildSelection(
  discordUserId: string,
  selection: DiscordGuildSelection
): DiscordGuildSelection | null {
  const result = updateDiscordUserState(discordUserId, (state) => {
    state.selection = selection;
    return state;
  });

  if (result?.selection) {
    try {
      void getDiscordInfoStore().remove(`${LEGACY_STORAGE_PREFIX}::${discordUserId}`);
    } catch (error) {
      console.warn('Failed to remove legacy Discord guild selection from localStorage', error);
    }
    return selection;
  }

  return null;
}

export class DiscordGuildSelectionMissingError extends Error {
  constructor(message = 'Discord guild selection is missing') {
    super(message);
    this.name = 'DiscordGuildSelectionMissingError';
  }
}

export function loadDiscordGuildSelection(
  discordUserId: string | undefined | null
): DiscordGuildSelection | null {
  if (!discordUserId || typeof window === 'undefined') {
    return null;
  }

  const state = loadDiscordUserState(discordUserId);
  const selection = sanitizeGuildSelection(state?.selection);
  if (selection) {
    return selection;
  }

  const legacySelection = loadLegacyDiscordGuildSelection(discordUserId);
  if (!legacySelection) {
    return null;
  }

  return migrateLegacyDiscordGuildSelection(discordUserId, legacySelection) ?? legacySelection;
}

export function saveDiscordGuildSelection(
  discordUserId: string | undefined | null,
  selection: DiscordGuildSelection
): void {
  if (!discordUserId || typeof window === 'undefined') {
    return;
  }

  const previousSelection = loadDiscordGuildSelection(discordUserId);
  if (previousSelection?.guildId && previousSelection.guildId !== selection.guildId) {
    clearDiscordMemberCache(discordUserId, previousSelection.guildId);
  }

  const cacheEntry =
    selection.memberCacheUpdatedAt !== undefined
      ? null
      : loadDiscordMemberCache(discordUserId, selection.guildId);

  const normalizedSelection: DiscordGuildSelection = {
    guildId: selection.guildId,
    guildName: selection.guildName,
    guildIcon: selection.guildIcon ?? null,
    selectedAt: selection.selectedAt,
    privateChannelCategory: selection.privateChannelCategory ?? null,
    memberCacheUpdatedAt:
      selection.memberCacheUpdatedAt !== undefined
        ? selection.memberCacheUpdatedAt ?? null
        : cacheEntry?.updatedAt ?? null
  };

  updateDiscordUserState(discordUserId, (state) => {
    state.selection = normalizedSelection;
    return state;
  });

  const persistedSelection = loadDiscordGuildSelection(discordUserId);
  if (persistedSelection?.guildId === normalizedSelection.guildId) {
    try {
      void getDiscordInfoStore().remove(`${LEGACY_STORAGE_PREFIX}::${discordUserId}`);
    } catch (error) {
      console.warn('Failed to remove legacy Discord guild selection after saving', error);
    }
  }
}

export function updateDiscordGuildSelectionMemberCacheTimestamp(
  discordUserId: string | undefined | null,
  guildId: string | undefined | null,
  updatedAt: string | null | undefined
): void {
  if (!discordUserId || !guildId || typeof window === 'undefined') {
    return;
  }

  updateDiscordUserState(discordUserId, (state) => {
    const currentSelection = sanitizeGuildSelection(state.selection);
    if (!currentSelection || currentSelection.guildId !== guildId) {
      return state;
    }

    const normalizedUpdatedAt = updatedAt ?? null;
    if (currentSelection.memberCacheUpdatedAt === normalizedUpdatedAt) {
      return state;
    }

    state.selection = {
      ...currentSelection,
      memberCacheUpdatedAt: normalizedUpdatedAt
    };
    return state;
  });
}

export function getStoredDiscordGuildId(discordUserId: string | undefined | null): string | null {
  const selection = loadDiscordGuildSelection(discordUserId);
  return selection?.guildId ?? null;
}

export function requireDiscordGuildSelection(
  discordUserId: string | undefined | null,
  errorMessage = 'Discordギルドが選択されていません。Discordギルドを選択してから再度お試しください。'
): DiscordGuildSelection {
  const selection = loadDiscordGuildSelection(discordUserId);
  if (!selection?.guildId) {
    throw new DiscordGuildSelectionMissingError(errorMessage);
  }
  return selection;
}

export function clearAllDiscordGuildSelections(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    void getDiscordInfoStore().removeByPrefix(`${DISCORD_USER_STATE_STORAGE_PREFIX}::`);
    void getDiscordInfoStore().removeByPrefix(`${LEGACY_STORAGE_PREFIX}::`);
    void getDiscordInfoStore().removeByPrefix(`${LEGACY_MEMBER_CACHE_PREFIX}::`);
  } catch (error) {
    console.error('Failed to clear Discord guild selections from storage', error);
  }
}
