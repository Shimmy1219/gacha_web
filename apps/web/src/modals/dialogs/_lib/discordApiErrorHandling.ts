import type { ModalComponentProps } from '../../ModalTypes';
import { WarningDialog } from '../WarningDialog';
import {
  API_ERROR_CODE_CSRF_TOKEN_MISMATCH,
  getCsrfMismatchGuideMessageJa
} from '../../../features/csrf/csrfGuards';

export const DISCORD_API_ERROR_CODE_UNKNOWN_GUILD = 'discord_unknown_guild' as const;
export const DISCORD_API_ERROR_CODE_MISSING_PERMISSIONS = 'discord_missing_permissions' as const;
export const DISCORD_API_ERROR_CODE_CATEGORY_CHANNEL_LIMIT_REACHED =
  'discord_category_channel_limit_reached' as const;
export const DISCORD_API_ERROR_CODE_MULTIPLE_GIFT_CHANNELS_FOUND =
  'discord_multiple_gift_channels_found' as const;

export function isDiscordUnknownGuildErrorCode(value: unknown): boolean {
  return value === DISCORD_API_ERROR_CODE_UNKNOWN_GUILD;
}

export function isDiscordMissingPermissionsErrorCode(value: unknown): boolean {
  return value === DISCORD_API_ERROR_CODE_MISSING_PERMISSIONS;
}

export function isDiscordCategoryChannelLimitReachedErrorCode(value: unknown): boolean {
  return value === DISCORD_API_ERROR_CODE_CATEGORY_CHANNEL_LIMIT_REACHED;
}

export function isDiscordMultipleGiftChannelsFoundErrorCode(value: unknown): boolean {
  return value === DISCORD_API_ERROR_CODE_MULTIPLE_GIFT_CHANNELS_FOUND;
}

export function isCsrfTokenMismatchErrorCode(value: unknown): boolean {
  return value === API_ERROR_CODE_CSRF_TOKEN_MISMATCH;
}

export const DISCORD_UNKNOWN_GUILD_FALLBACK_MESSAGE =
  '選択されたDiscordギルドを操作できません。ボットが参加しているか確認してください。';
export const DISCORD_MISSING_PERMISSIONS_FALLBACK_MESSAGE = 'Discord botの権限が不足しています。';

export function pushDiscordUnknownGuildWarning(
  push: ModalComponentProps['push'],
  message: unknown
): void {
  const resolvedMessage =
    typeof message === 'string' && message.trim().length > 0
      ? message.trim()
      : DISCORD_UNKNOWN_GUILD_FALLBACK_MESSAGE;

  push(WarningDialog, {
    id: 'discord-unknown-guild-warning',
    title: 'Discordギルドを操作できません',
    intent: 'warning',
    payload: {
      message: resolvedMessage,
      confirmLabel: '閉じる'
    }
  });
}

export function pushDiscordMissingPermissionsWarning(
  push: ModalComponentProps['push'],
  message: unknown
): void {
  const resolvedMessage =
    typeof message === 'string' && message.trim().length > 0
      ? message.trim()
      : DISCORD_MISSING_PERMISSIONS_FALLBACK_MESSAGE;

  push(WarningDialog, {
    id: 'discord-missing-permissions-warning',
    title: 'Discord Botの権限が不足しています',
    intent: 'warning',
    payload: {
      message: resolvedMessage,
      confirmLabel: '閉じる'
    }
  });
}

export function pushCsrfTokenMismatchWarning(
  push: ModalComponentProps['push'],
  message?: unknown,
  reason?: unknown
): void {
  const detail =
    typeof message === 'string' && message.trim().length > 0
      ? `\n\n詳細: ${message.trim()}`
      : '';

  push(WarningDialog, {
    id: 'csrf-token-mismatch-warning',
    title: 'セキュリティ検証に失敗しました',
    intent: 'warning',
    payload: {
      message: `${getCsrfMismatchGuideMessageJa(reason)}${detail}`,
      confirmLabel: '閉じる'
    }
  });
}

export function pushDiscordApiWarningByErrorCode(
  push: ModalComponentProps['push'],
  errorCode: unknown,
  message: unknown,
  options?: { csrfReason?: unknown }
): boolean {
  if (isDiscordUnknownGuildErrorCode(errorCode)) {
    pushDiscordUnknownGuildWarning(push, message);
    return true;
  }
  if (isDiscordMissingPermissionsErrorCode(errorCode)) {
    pushDiscordMissingPermissionsWarning(push, message);
    return true;
  }
  if (isCsrfTokenMismatchErrorCode(errorCode)) {
    pushCsrfTokenMismatchWarning(push, message, options?.csrfReason);
    return true;
  }
  return false;
}
