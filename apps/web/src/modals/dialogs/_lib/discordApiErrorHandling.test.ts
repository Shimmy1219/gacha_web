import { describe, expect, it, vi } from 'vitest';

import type { ModalComponentProps } from '../../ModalTypes';
import {
  DISCORD_API_ERROR_CODE_UNKNOWN_CHANNEL,
  DISCORD_UNKNOWN_CHANNEL_FALLBACK_MESSAGE,
  pushDiscordApiWarningByErrorCode
} from './discordApiErrorHandling';

describe('discordApiErrorHandling', () => {
  it('discord_unknown_channel のときにチャンネル再選択ダイアログを表示する', () => {
    const pushMock = vi.fn();
    const push = pushMock as unknown as ModalComponentProps['push'];
    const handled = pushDiscordApiWarningByErrorCode(
      push,
      DISCORD_API_ERROR_CODE_UNKNOWN_CHANNEL,
      'チャンネルを選択しなおしてください。'
    );

    expect(handled).toBe(true);
    expect(pushMock).toHaveBeenCalledTimes(1);
    const [, options] = pushMock.mock.calls[0];
    expect(options.id).toBe('discord-unknown-channel-warning');
    expect(options.title).toBe('Discordチャンネルを再選択してください');
    expect(options.payload?.message).toBe('チャンネルを選択しなおしてください。');
  });

  it('discord_unknown_channel でメッセージ未指定ならフォールバック文言を使う', () => {
    const pushMock = vi.fn();
    const push = pushMock as unknown as ModalComponentProps['push'];
    const handled = pushDiscordApiWarningByErrorCode(
      push,
      DISCORD_API_ERROR_CODE_UNKNOWN_CHANNEL,
      '   '
    );

    expect(handled).toBe(true);
    const [, options] = pushMock.mock.calls[0];
    expect(options.payload?.message).toBe(DISCORD_UNKNOWN_CHANNEL_FALLBACK_MESSAGE);
  });
});
