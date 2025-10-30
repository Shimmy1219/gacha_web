export interface DiscordGuildSelection {
  guildId: string;
  guildName: string;
  guildIcon?: string | null;
  selectedAt: string;
}

const STORAGE_PREFIX = 'discord.guildSelection';

function getStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}::${userId}`;
}

export class DiscordGuildSelectionMissingError extends Error {
  constructor(message = 'Discord guild selection is missing') {
    super(message);
    this.name = 'DiscordGuildSelectionMissingError';
  }
}

export function loadDiscordGuildSelection(userId: string | undefined | null): DiscordGuildSelection | null {
  if (!userId || typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as DiscordGuildSelection;
    if (!parsed || typeof parsed.guildId !== 'string' || typeof parsed.guildName !== 'string') {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('Failed to parse Discord guild selection from localStorage', error);
    return null;
  }
}

export function saveDiscordGuildSelection(userId: string | undefined | null, selection: DiscordGuildSelection): void {
  if (!userId || typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(selection));
  } catch (error) {
    console.error('Failed to persist Discord guild selection to localStorage', error);
  }
}

export function getStoredDiscordGuildId(userId: string | undefined | null): string | null {
  const selection = loadDiscordGuildSelection(userId);
  return selection?.guildId ?? null;
}

export function requireDiscordGuildSelection(
  userId: string | undefined | null,
  errorMessage = 'Discordギルドが選択されていません。Discordギルドを選択してから再度お試しください。'
): DiscordGuildSelection {
  const selection = loadDiscordGuildSelection(userId);
  if (!selection?.guildId) {
    throw new DiscordGuildSelectionMissingError(errorMessage);
  }
  return selection;
}
