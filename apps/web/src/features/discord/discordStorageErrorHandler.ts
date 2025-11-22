import { DiscordUserStateCryptoError } from './discordUserStateCrypto';
import { DiscordUserStateSyncError } from './discordUserStateStorage';

let hasNotified = false;

export function notifyDiscordStorageError(error: unknown): void {
  const baseMessage =
    error instanceof DiscordUserStateCryptoError || error instanceof DiscordUserStateSyncError
      ? error.message
      : 'Discordデータの保存・復元に失敗しました。';
  const recovery =
    (error instanceof DiscordUserStateCryptoError || error instanceof DiscordUserStateSyncError) && error.recovery
      ? error.recovery
      : 'ページを再読み込みし、それでも解決しない場合はDiscordに再ログインしてください。';

  console.error('Discord storage error detected', error);

  if (typeof window === 'undefined') {
    return;
  }

  if (hasNotified) {
    return;
  }

  hasNotified = true;
  window.alert(`${baseMessage}\n${recovery}`);
}

export function resetDiscordStorageErrorNotification(): void {
  hasNotified = false;
}
