import {
  clearDiscordMemberCache,
  loadDiscordMemberCache
} from './discordMemberCacheStorage';

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

const STORAGE_PREFIX = 'discord.guildSelection';

function getStorageKey(discordUserId: string): string {
  return `${STORAGE_PREFIX}::${discordUserId}`;
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
  if (!discordUserId || typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(discordUserId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as DiscordGuildSelection;
    if (!parsed || typeof parsed.guildId !== 'string' || typeof parsed.guildName !== 'string') {
      return null;
    }
    if (
      parsed.privateChannelCategory &&
      (typeof parsed.privateChannelCategory.id !== 'string' ||
        typeof parsed.privateChannelCategory.name !== 'string')
    ) {
      parsed.privateChannelCategory = null;
    }
    if (
      parsed.memberCacheUpdatedAt !== undefined &&
      typeof parsed.memberCacheUpdatedAt !== 'string'
    ) {
      parsed.memberCacheUpdatedAt = null;
    }
    return parsed;
  } catch (error) {
    console.warn('Failed to parse Discord guild selection from localStorage', error);
    return null;
  }
}

export function saveDiscordGuildSelection(
  discordUserId: string | undefined | null,
  selection: DiscordGuildSelection
): void {
  if (!discordUserId || typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
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
    ...selection,
    memberCacheUpdatedAt:
      selection.memberCacheUpdatedAt !== undefined
        ? selection.memberCacheUpdatedAt
        : cacheEntry?.updatedAt ?? null
  };

  try {
    window.localStorage.setItem(getStorageKey(discordUserId), JSON.stringify(normalizedSelection));
  } catch (error) {
    console.error('Failed to persist Discord guild selection to localStorage', error);
  }
}

export function updateDiscordGuildSelectionMemberCacheTimestamp(
  discordUserId: string | undefined | null,
  guildId: string | undefined | null,
  updatedAt: string | null | undefined
): void {
  if (!discordUserId || !guildId || typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  const currentSelection = loadDiscordGuildSelection(discordUserId);
  if (!currentSelection || currentSelection.guildId !== guildId) {
    return;
  }

  const normalizedUpdatedAt = updatedAt ?? null;
  if (currentSelection.memberCacheUpdatedAt === normalizedUpdatedAt) {
    return;
  }

  saveDiscordGuildSelection(discordUserId, {
    ...currentSelection,
    memberCacheUpdatedAt: normalizedUpdatedAt
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
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  const prefix = `${STORAGE_PREFIX}::`;

  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key && key.startsWith(prefix)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.error('Failed to clear Discord guild selections from storage', error);
  }
}
