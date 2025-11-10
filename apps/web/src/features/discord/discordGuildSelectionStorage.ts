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
  capabilityCheck?: DiscordGuildCapabilityCheckResult | null;
}

export interface DiscordGuildCapabilityCheckMessages {
  fetchCategories: string | null;
  ensurePrivateChannel: string | null;
  sendMessage: string | null;
}

export interface DiscordGuildCapabilityCheckResult {
  checkedAt: string;
  guildId: string;
  categoryId: string | null;
  canFetchCategories: boolean;
  canEnsurePrivateChannel: boolean;
  canSendMessage: boolean;
  messages: DiscordGuildCapabilityCheckMessages;
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
    parsed.capabilityCheck = normalizeCapabilityCheck(parsed.capabilityCheck, parsed.guildId);
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

  try {
    window.localStorage.setItem(
      getStorageKey(discordUserId),
      JSON.stringify({
        ...selection,
        capabilityCheck: normalizeCapabilityCheck(selection.capabilityCheck, selection.guildId),
      })
    );
  } catch (error) {
    console.error('Failed to persist Discord guild selection to localStorage', error);
  }
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

function normalizeCapabilityCheck(
  value: unknown,
  guildId: string
): DiscordGuildCapabilityCheckResult | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<DiscordGuildCapabilityCheckResult>;
  if (typeof candidate.guildId !== 'string' || candidate.guildId !== guildId) {
    return null;
  }

  if (typeof candidate.checkedAt !== 'string' || Number.isNaN(Date.parse(candidate.checkedAt))) {
    return null;
  }

  if (
    typeof candidate.canFetchCategories !== 'boolean' ||
    typeof candidate.canEnsurePrivateChannel !== 'boolean' ||
    typeof candidate.canSendMessage !== 'boolean'
  ) {
    return null;
  }

  const messages = candidate.messages;
  const normalizedMessages: DiscordGuildCapabilityCheckMessages = {
    fetchCategories: null,
    ensurePrivateChannel: null,
    sendMessage: null,
  };

  if (messages && typeof messages === 'object') {
    normalizedMessages.fetchCategories = sanitizeMessage(messages.fetchCategories);
    normalizedMessages.ensurePrivateChannel = sanitizeMessage(messages.ensurePrivateChannel);
    normalizedMessages.sendMessage = sanitizeMessage(messages.sendMessage);
  }

  return {
    checkedAt: new Date(candidate.checkedAt).toISOString(),
    guildId,
    categoryId: typeof candidate.categoryId === 'string' ? candidate.categoryId : null,
    canFetchCategories: candidate.canFetchCategories,
    canEnsurePrivateChannel: candidate.canEnsurePrivateChannel,
    canSendMessage: candidate.canSendMessage,
    messages: normalizedMessages,
  };
}

function sanitizeMessage(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isDiscordGuildSelectionCapabilityValid(
  selection: DiscordGuildSelection | null | undefined
): selection is DiscordGuildSelection & { capabilityCheck: DiscordGuildCapabilityCheckResult } {
  if (!selection?.capabilityCheck) {
    return false;
  }
  const check = selection.capabilityCheck;
  if (
    !check.canFetchCategories ||
    !check.canEnsurePrivateChannel ||
    !check.canSendMessage
  ) {
    return false;
  }

  const categoryId = selection.privateChannelCategory?.id ?? null;
  if (categoryId && check.categoryId && categoryId !== check.categoryId) {
    return false;
  }

  if (!categoryId && check.categoryId) {
    return false;
  }

  return true;
}

export function describeDiscordGuildCapabilityIssue(
  selection: DiscordGuildSelection | null | undefined
): string | null {
  if (!selection) {
    return 'Discordギルドが選択されていません。ギルドを選択し直してください。';
  }

  const check = selection.capabilityCheck;
  if (!check) {
    return 'Discord Botの権限チェックが未完了です。Botを再招待し、「Discord設定」から再確認してください。';
  }

  const issues: string[] = [];

  if (!check.canFetchCategories) {
    issues.push(check.messages.fetchCategories ?? 'カテゴリ一覧の取得に失敗しました。');
  }

  if (!check.canEnsurePrivateChannel) {
    issues.push(check.messages.ensurePrivateChannel ?? 'お渡しチャンネルの作成権限を確認できませんでした。');
  }

  if (!check.canSendMessage) {
    issues.push(check.messages.sendMessage ?? 'メッセージ送信テストに失敗しました。');
  }

  const categoryId = selection.privateChannelCategory?.id ?? null;
  if (categoryId && check.categoryId && categoryId !== check.categoryId) {
    issues.push('保存されているカテゴリが権限チェック時と異なります。チェックを再実行してください。');
  }

  if (!categoryId && check.categoryId) {
    issues.push('カテゴリが未設定の状態で保存されています。カテゴリを選択してから再度チェックを実行してください。');
  }

  if (issues.length === 0) {
    return null;
  }

  return issues.join('\n');
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
