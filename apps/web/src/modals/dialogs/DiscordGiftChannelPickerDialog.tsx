import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/outline';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

export interface DiscordGiftChannelCandidate {
  channelId: string;
  channelName: string | null;
  parentId: string | null;
  botCanView: boolean | null;
  botCanSend: boolean | null;
}

interface DiscordGiftChannelPickerDialogPayload {
  channels: DiscordGiftChannelCandidate[];
  onSelect?: (channel: DiscordGiftChannelCandidate) => void;
  onCancel?: () => void;
}

function getBotAccessLabel(channel: DiscordGiftChannelCandidate): string | null {
  if (channel.botCanView === true && channel.botCanSend === true) {
    return null;
  }
  if (channel.botCanView === true && channel.botCanSend === false) {
    return 'Bot送信不可';
  }
  if (channel.botCanView === false && channel.botCanSend === true) {
    return 'Bot閲覧不可（送信権限のみ）';
  }
  if (channel.botCanView === false && channel.botCanSend === false) {
    return 'Bot閲覧・送信不可';
  }
  if (channel.botCanView === false) {
    return 'Bot閲覧不可';
  }
  if (channel.botCanSend === false) {
    return 'Bot送信不可';
  }
  return null;
}

export function DiscordGiftChannelPickerDialog({
  payload,
  close
}: ModalComponentProps<DiscordGiftChannelPickerDialogPayload>): JSX.Element {
  const callbackResolvedRef = useRef(false);
  const channels = useMemo(() => {
    const source = Array.isArray(payload?.channels) ? payload.channels : [];
    const deduped = new Map<string, DiscordGiftChannelCandidate>();
    for (const channel of source) {
      if (!channel?.channelId) {
        continue;
      }
      if (!deduped.has(channel.channelId)) {
        deduped.set(channel.channelId, channel);
      }
    }
    return Array.from(deduped.values());
  }, [payload?.channels]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(channels[0]?.channelId ?? null);

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.channelId === selectedChannelId) ?? null,
    [channels, selectedChannelId]
  );

  const handleCancel = () => {
    callbackResolvedRef.current = true;
    payload?.onCancel?.();
    close();
  };

  const handleSubmit = () => {
    if (!selectedChannel) {
      return;
    }
    callbackResolvedRef.current = true;
    payload?.onSelect?.(selectedChannel);
    close();
  };

  useEffect(() => {
    return () => {
      if (!callbackResolvedRef.current) {
        payload?.onCancel?.();
      }
    };
  }, [payload]);

  return (
    <>
      <ModalBody className="discord-gift-channel-picker-dialog__body space-y-4">
        <div className="discord-gift-channel-picker-dialog__intro space-y-2 rounded-2xl border border-border/70 bg-surface/20 p-4">
          <p className="discord-gift-channel-picker-dialog__title text-sm font-semibold text-surface-foreground">
            送信先のお渡しチャンネルを選択してください
          </p>
          <p className="discord-gift-channel-picker-dialog__description text-xs leading-relaxed text-muted-foreground">
            同じメンバー向けの1 on 1チャンネルが複数見つかりました。送信先として使用するチャンネルを1つ選択してください。
          </p>
        </div>

        {channels.length === 0 ? (
          <p className="discord-gift-channel-picker-dialog__empty rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            送信先チャンネル候補を取得できませんでした。再度お試しください。
          </p>
        ) : (
          <ul className="discord-gift-channel-picker-dialog__list max-h-80 space-y-2 overflow-y-auto pr-1">
            {channels.map((channel) => {
              const isSelected = channel.channelId === selectedChannelId;
              const accessLabel = getBotAccessLabel(channel);
              const resolvedChannelName = channel.channelName?.trim()
                ? `#${channel.channelName.trim()}`
                : channel.channelId;
              return (
                <li key={channel.channelId} className="discord-gift-channel-picker-dialog__list-item">
                  <button
                    type="button"
                    className="discord-gift-channel-picker-dialog__channel-button flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-surface/40 p-3 text-left transition hover:border-accent/50 hover:bg-surface/60"
                    onClick={() => setSelectedChannelId(channel.channelId)}
                    aria-pressed={isSelected}
                  >
                    <div className="discord-gift-channel-picker-dialog__channel-main flex min-w-0 flex-1 flex-col gap-1">
                      <span className="discord-gift-channel-picker-dialog__channel-name truncate text-sm font-semibold text-surface-foreground">
                        {resolvedChannelName}
                      </span>
                      <div className="discord-gift-channel-picker-dialog__channel-meta flex flex-wrap items-center gap-2">
                        <span className="discord-gift-channel-picker-dialog__channel-id rounded-full bg-surface/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                          Channel ID: {channel.channelId}
                        </span>
                        {channel.parentId ? (
                          <span className="discord-gift-channel-picker-dialog__parent-id rounded-full bg-surface/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                            Category ID: {channel.parentId}
                          </span>
                        ) : null}
                        {accessLabel ? (
                          <span className="discord-gift-channel-picker-dialog__access-warning rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning-foreground">
                            {accessLabel}
                          </span>
                        ) : (
                          <span className="discord-gift-channel-picker-dialog__access-ok rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                            Bot送信可能
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="discord-gift-channel-picker-dialog__selected-indicator flex h-6 w-6 items-center justify-center">
                      {isSelected ? (
                        <CheckCircleIcon className="h-6 w-6 text-accent" aria-hidden="true" />
                      ) : (
                        <span className="discord-gift-channel-picker-dialog__selected-placeholder h-6 w-6 rounded-full border border-border/60" />
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          className="discord-gift-channel-picker-dialog__cancel-button btn btn-muted"
          onClick={handleCancel}
        >
          キャンセル
        </button>
        <button
          type="button"
          className="discord-gift-channel-picker-dialog__submit-button btn btn-primary"
          onClick={handleSubmit}
          disabled={!selectedChannel}
        >
          このチャンネルに送信
        </button>
      </ModalFooter>
    </>
  );
}
