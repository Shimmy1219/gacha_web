import type { ModalComponentProps } from '../../ModalTypes';
import { WarningDialog } from '../WarningDialog';

export const DISCORD_API_ERROR_CODE_MISSING_PERMISSIONS = 'discord_missing_permissions' as const;

export function isDiscordMissingPermissionsErrorCode(value: unknown): boolean {
  return value === DISCORD_API_ERROR_CODE_MISSING_PERMISSIONS;
}

export const DISCORD_MISSING_PERMISSIONS_FALLBACK_MESSAGE = 'Discord botの権限が不足しています。';

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
    title: 'Discord Botの権限',
    intent: 'warning',
    payload: {
      message: resolvedMessage,
      confirmLabel: '閉じる'
    }
  });
}

