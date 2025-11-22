import {
  clearDiscordMemberCache,
  loadDiscordMemberCache
} from './discordMemberCacheStorage';
import {
  DISCORD_USER_STATE_STORAGE_PREFIX,
  loadDiscordUserState,
  updateDiscordUserState
} from './discordUserStateStorage';

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
    const raw = window.localStorage.getItem(`${LEGACY_STORAGE_PREFIX}::${discordUserId}`);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return sanitizeGuildSelection(parsed);
  } catch (error) {
    console.warn('Failed to read legacy Discord guild selection from localStorage', error);
    return null;
  }
}

async function migrateLegacyDiscordGuildSelection(
  discordUserId: string,
  selection: DiscordGuildSelection
): Promise<DiscordGuildSelection | null> {
  const result = await updateDiscordUserState(discordUserId, (state) => {
    state.selection = selection;
    return state;
  });

  if (result?.selection) {
    try {
      window.localStorage.removeItem(`${LEGACY_STORAGE_PREFIX}::${discordUserId}`);
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

export async function loadDiscordGuildSelection(
  discordUserId: string | undefined | null
): Promise<DiscordGuildSelection | null> {
  if (!discordUserId || typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') {
    return null;
  }

  const state = await loadDiscordUserState(discordUserId);
  const selection = sanitizeGuildSelection(state?.selection);
  if (selection) {
    return selection;
  }

  const legacySelection = loadLegacyDiscordGuildSelection(discordUserId);
  if (!legacySelection) {
    return null;
  }

  const migrated = await migrateLegacyDiscordGuildSelection(discordUserId, legacySelection);
  return migrated ?? legacySelection;
}

export async function saveDiscordGuildSelection(
  discordUserId: string | undefined | null,
  selection: DiscordGuildSelection
): Promise<void> {
  if (!discordUserId || typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') {
    return;
  }

  const previousSelection = await loadDiscordGuildSelection(discordUserId);
  if (previousSelection?.guildId && previousSelection.guildId !== selection.guildId) {
    await clearDiscordMemberCache(discordUserId, previousSelection.guildId);
  }

  const cacheEntry =
    selection.memberCacheUpdatedAt !== undefined
      ? null
      : await loadDiscordMemberCache(discordUserId, selection.guildId);

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

  await updateDiscordUserState(discordUserId, (state) => {
    state.selection = normalizedSelection;
    return state;
  });

  const persistedSelection = await loadDiscordGuildSelection(discordUserId);
  if (persistedSelection?.guildId === normalizedSelection.guildId) {
    try {
      window.localStorage.removeItem(`${LEGACY_STORAGE_PREFIX}::${discordUserId}`);
    } catch (error) {
      console.warn('Failed to remove legacy Discord guild selection after saving', error);
    }
  }
}

export async function updateDiscordGuildSelectionMemberCacheTimestamp(
  discordUserId: string | undefined | null,
  guildId: string | undefined | null,
  updatedAt: string | null | undefined
): Promise<void> {
  if (!discordUserId || !guildId || typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') {
    return;
  }

  await updateDiscordUserState(discordUserId, (state) => {
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

export async function getStoredDiscordGuildId(discordUserId: string | undefined | null): Promise<string | null> {
  const selection = await loadDiscordGuildSelection(discordUserId);
  return selection?.guildId ?? null;
}

export async function requireDiscordGuildSelection(
  discordUserId: string | undefined | null,
  errorMessage = 'Discordギルドが選択されていません。Discordギルドを選択してから再度お試しください。'
): Promise<DiscordGuildSelection> {
  const selection = await loadDiscordGuildSelection(discordUserId);
  if (!selection?.guildId) {
    throw new DiscordGuildSelectionMissingError(errorMessage);
  }
  return selection;
}

export function clearAllDiscordGuildSelections(): void {
  if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') {
    return;
  }

  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (!key) {
        continue;
      }
      if (key.startsWith(`${DISCORD_USER_STATE_STORAGE_PREFIX}::`)) {
        window.sessionStorage.removeItem(key);
        continue;
      }
      if (key.startsWith(`${LEGACY_STORAGE_PREFIX}::`)) {
        window.localStorage.removeItem(key);
        continue;
      }
      if (key.startsWith(`${LEGACY_MEMBER_CACHE_PREFIX}::`)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.error('Failed to clear Discord guild selections from storage', error);
  }
}
