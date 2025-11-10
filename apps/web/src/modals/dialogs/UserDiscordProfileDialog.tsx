import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { useStoreValue } from '@domain/stores';

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
  close
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

  const [discordUserId, setDiscordUserId] = useState(profile?.discordUserId ?? '');
  const [discordDisplayName, setDiscordDisplayName] = useState(profile?.discordDisplayName ?? '');
  const [discordUserName, setDiscordUserName] = useState(profile?.discordUserName ?? '');
  const [discordAvatarAssetId, setDiscordAvatarAssetId] = useState(profile?.discordAvatarAssetId ?? '');
  const [discordAvatarUrl, setDiscordAvatarUrl] = useState(profile?.discordAvatarUrl ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDiscordUserId(profile?.discordUserId ?? '');
    setDiscordDisplayName(profile?.discordDisplayName ?? '');
    setDiscordUserName(profile?.discordUserName ?? '');
    setDiscordAvatarAssetId(profile?.discordAvatarAssetId ?? '');
    setDiscordAvatarUrl(profile?.discordAvatarUrl ?? '');
  }, [
    profile?.discordAvatarAssetId,
    profile?.discordAvatarUrl,
    profile?.discordDisplayName,
    profile?.discordUserId,
    profile?.discordUserName
  ]);

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

  const fieldId = (name: string) => `user-discord-${userId}-${name}`;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const trimmedId = discordUserId.trim();
    if (!trimmedId) {
      setError('DiscordユーザーIDを入力してください');
      return;
    }

    const displayNameValue = discordDisplayName.trim();
    const userNameValue = discordUserName.trim();
    const avatarAssetIdValue = discordAvatarAssetId.trim();
    const avatarUrlValue = discordAvatarUrl.trim();

    userProfilesStore.linkDiscordProfile(userId, {
      discordUserId: trimmedId,
      discordDisplayName: displayNameValue || null,
      discordUserName: userNameValue || null,
      discordAvatarAssetId: avatarAssetIdValue ? avatarAssetIdValue : null,
      discordAvatarUrl: avatarUrlValue ? avatarUrlValue : null
    });
    close();
  };

  const handleUnlink = () => {
    userProfilesStore.unlinkDiscordProfile(userId);
    close();
  };

  const canUnlink = Boolean(profile?.discordUserId);

  return (
    <>
      <ModalBody className="space-y-5">
        <div className="space-y-1">
          <p className="text-sm font-medium text-surface-foreground">{userName}</p>
          <p className="text-xs text-muted-foreground">Discord情報を編集または連携解除します。</p>
        </div>
        <form id="discord-profile-form" className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-muted-foreground" htmlFor={fieldId('id')}>
              DiscordユーザーID
            </label>
            <input
              id={fieldId('id')}
              type="text"
              className="w-full rounded-lg border border-border/60 bg-panel-contrast px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none"
              value={discordUserId}
              onChange={(event) => {
                setDiscordUserId(event.target.value);
                if (error) {
                  setError(null);
                }
              }}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-muted-foreground" htmlFor={fieldId('display-name')}>
              表示名 (任意)
            </label>
            <input
              id={fieldId('display-name')}
              type="text"
              className="w-full rounded-lg border border-border/60 bg-panel-contrast px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none"
              value={discordDisplayName}
              onChange={(event) => setDiscordDisplayName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-muted-foreground" htmlFor={fieldId('username')}>
              ユーザー名 (任意)
            </label>
            <input
              id={fieldId('username')}
              type="text"
              className="w-full rounded-lg border border-border/60 bg-panel-contrast px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none"
              value={discordUserName}
              onChange={(event) => setDiscordUserName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-muted-foreground" htmlFor={fieldId('avatar-asset')}>
              アバターアセットID (任意)
            </label>
            <input
              id={fieldId('avatar-asset')}
              type="text"
              className="w-full rounded-lg border border-border/60 bg-panel-contrast px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none"
              value={discordAvatarAssetId}
              onChange={(event) => setDiscordAvatarAssetId(event.target.value)}
              placeholder="画像アセットID"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-muted-foreground" htmlFor={fieldId('avatar-url')}>
              アバターURL (任意)
            </label>
            <input
              id={fieldId('avatar-url')}
              type="url"
              className="w-full rounded-lg border border-border/60 bg-panel-contrast px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none"
              value={discordAvatarUrl}
              onChange={(event) => setDiscordAvatarUrl(event.target.value)}
              placeholder="https://..."
            />
          </div>
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
        </form>
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
      </ModalBody>
      <ModalFooter className="justify-between">
        <button
          type="button"
          className="btn btn-muted border-red-500/50 text-red-500 hover:border-red-500 hover:text-red-600"
          onClick={handleUnlink}
          disabled={!canUnlink}
        >
          連携を解除
        </button>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-muted" onClick={close}>
            キャンセル
          </button>
          <button type="submit" form="discord-profile-form" className="btn btn-primary">
            保存
          </button>
        </div>
      </ModalFooter>
    </>
  );
}
