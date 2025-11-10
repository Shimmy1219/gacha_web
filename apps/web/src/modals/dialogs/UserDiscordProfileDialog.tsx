import { useCallback, useMemo } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { useStoreValue } from '@domain/stores';
import { useAssetPreview } from '../../features/assets/useAssetPreview';
import { UserDiscordProfileLinkDialog } from './UserDiscordProfileLinkDialog';

interface UserDiscordProfileDialogPayload {
  userId: string;
  userName: string;
}

function formatDateLabel(formatter: Intl.DateTimeFormat, value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }
  return formatter.format(parsed);
}

export function UserDiscordProfileDialog({
  payload,
  close,
  push
}: ModalComponentProps<UserDiscordProfileDialogPayload>): JSX.Element {
  const { userId, userName } = payload;
  const { userProfiles: userProfilesStore } = useDomainStores();
  const userProfilesState = useStoreValue(userProfilesStore);
  const profile = userProfilesState?.users?.[userId];

  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('ja-JP', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }),
    []
  );

  const linkedAtLabel = useMemo(
    () => formatDateLabel(dateTimeFormatter, profile?.discordLinkedAt),
    [dateTimeFormatter, profile?.discordLinkedAt]
  );

  const lastShareAtLabel = useMemo(
    () => formatDateLabel(dateTimeFormatter, profile?.discordLastShareAt),
    [dateTimeFormatter, profile?.discordLastShareAt]
  );

  const lastShareDetails = useMemo(() => {
    if (!profile) {
      return [] as Array<{ label: string; value: string }>;
    }

    const details: Array<{ label: string; value: string }> = [];

    if (profile.discordLastShareChannelName || profile.discordLastShareChannelId) {
      const channelLabel = profile.discordLastShareChannelName
        ? `${profile.discordLastShareChannelName}`
        : '不明なチャンネル';
      const channelSuffix = profile.discordLastShareChannelId
        ? ` (ID: ${profile.discordLastShareChannelId})`
        : '';
      details.push({ label: 'チャンネル', value: `${channelLabel}${channelSuffix}` });
    }

    if (profile.discordLastShareChannelParentId) {
      details.push({ label: 'カテゴリID', value: profile.discordLastShareChannelParentId });
    }

    if (profile.discordLastShareUrl) {
      details.push({ label: '共有URL', value: profile.discordLastShareUrl });
    }

    if (profile.discordLastShareTitle) {
      details.push({ label: 'タイトル', value: profile.discordLastShareTitle });
    }

    if (profile.discordLastShareLabel) {
      details.push({ label: 'ラベル', value: profile.discordLastShareLabel });
    }

    if (profile.discordLastShareComment) {
      details.push({ label: 'コメント', value: profile.discordLastShareComment });
    }

    if (lastShareAtLabel) {
      details.push({ label: '共有日時', value: lastShareAtLabel });
    }

    return details;
  }, [lastShareAtLabel, profile]);

  const normalizedDiscordDisplayName = profile?.discordDisplayName?.trim() ?? '';
  const avatarAssetId = profile?.discordAvatarAssetId ?? null;
  const avatarPreview = useAssetPreview(avatarAssetId);
  const avatarSrc = avatarPreview.url ?? (profile?.discordAvatarUrl ?? null);
  const avatarFallback = useMemo(() => {
    const source =
      normalizedDiscordDisplayName || profile?.discordUserName?.trim() || userName || profile?.discordUserId || '';
    if (!source) {
      return '';
    }
    const [first] = Array.from(source);
    return first ? first.toUpperCase() : '';
  }, [normalizedDiscordDisplayName, profile?.discordUserName, profile?.discordUserId, userName]);

  const handleOpenLinkDialog = useCallback(() => {
    push(UserDiscordProfileLinkDialog, {
      title: 'Discord情報を追加',
      size: 'md',
      payload: { userId, userName }
    });
  }, [push, userId, userName]);

  const handleUnlink = useCallback(() => {
    userProfilesStore.unlinkDiscordProfile(userId);
  }, [userProfilesStore, userId]);

  const hasLinkedDiscord = Boolean(profile?.discordUserId);

  return (
    <>
      <ModalBody className="space-y-5">
        <div className="space-y-1">
          <p className="text-sm font-medium text-surface-foreground">{userName}</p>
          <p className="text-xs text-muted-foreground">Discord情報を編集または連携解除します。</p>
        </div>
        {hasLinkedDiscord ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">連携中のDiscordユーザー</p>
              <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-panel-contrast px-3 py-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-border/60 text-base font-semibold text-muted-foreground">
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="Discordユーザーのアイコン" className="h-full w-full object-cover" />
                  ) : (
                    <span>{avatarFallback}</span>
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-semibold text-surface-foreground">
                    {profile?.discordDisplayName || profile?.discordUserName || '不明なユーザー'}
                  </p>
                  {profile?.discordUserName ? (
                    <p className="truncate text-xs text-muted-foreground">@{profile.discordUserName}</p>
                  ) : null}
                  <p className="truncate text-xs text-muted-foreground/80">ID: {profile?.discordUserId}</p>
                </div>
              </div>
            </div>
            <div>
              <button type="button" className="btn btn-muted" onClick={handleOpenLinkDialog}>
                Discord情報を追加
              </button>
            </div>
            {linkedAtLabel ? (
              <div className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent">
                <span className="font-semibold">最終連携日時:</span> {linkedAtLabel}
              </div>
            ) : null}
            {lastShareDetails.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">最後に共有した情報</p>
                <dl className="space-y-1 rounded-xl border border-border/60 bg-panel-contrast px-3 py-2 text-xs text-muted-foreground">
                  {lastShareDetails.map((detail) => (
                    <div key={`${detail.label}-${detail.value}`} className="flex gap-2">
                      <dt className="w-28 shrink-0 text-muted-foreground/80">{detail.label}</dt>
                      <dd className="flex-1 break-words text-surface-foreground/90">{detail.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border/60 bg-panel-contrast px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">連携しているDiscord情報がありません</p>
            <button type="button" className="btn btn-primary" onClick={handleOpenLinkDialog}>
              Discord情報を追加
            </button>
          </div>
        )}
      </ModalBody>
      <ModalFooter className={hasLinkedDiscord ? 'justify-between' : 'justify-end'}>
        {hasLinkedDiscord ? (
          <>
            <button
              type="button"
              className="btn btn-muted border-red-500/50 text-red-500 hover:border-red-500 hover:text-red-600"
              onClick={handleUnlink}
            >
              連携を解除
            </button>
            <button type="button" className="btn btn-muted" onClick={close}>
              閉じる
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-muted" onClick={close}>
            閉じる
          </button>
        )}
      </ModalFooter>
    </>
  );
}
