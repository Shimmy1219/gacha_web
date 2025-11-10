import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { useStoreValue } from '@domain/stores';
import { useDiscordSession } from '../../features/discord/useDiscordSession';
import {
  loadDiscordGuildSelection,
  updateDiscordGuildSelectionMemberCacheTimestamp,
  type DiscordGuildSelection
} from '../../features/discord/discordGuildSelectionStorage';
import {
  loadDiscordMemberCache,
  normalizeDiscordGuildMembers,
  saveDiscordMemberCache,
  type DiscordGuildMemberSummary,
  type DiscordMemberCacheEntry
} from '../../features/discord/discordMemberCacheStorage';

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
  const { data: discordSession } = useDiscordSession();
  const discordUserIdFromSession = discordSession?.user?.id ?? null;

  const [guildSelection, setGuildSelection] = useState<DiscordGuildSelection | null>(null);
  const guildId = guildSelection?.guildId ?? null;
  const guildName = guildSelection?.guildName ?? null;

  const [memberCacheEntry, setMemberCacheEntry] = useState<DiscordMemberCacheEntry | null>(null);
  const members = memberCacheEntry?.members ?? [];

  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('ja-JP', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }),
    []
  );

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(profile?.discordUserId ?? null);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [isRefreshingCache, setIsRefreshingCache] = useState(false);

  useEffect(() => {
    if (!discordUserIdFromSession) {
      setGuildSelection(null);
      return;
    }
    const selection = loadDiscordGuildSelection(discordUserIdFromSession);
    setGuildSelection(selection);
  }, [discordUserIdFromSession]);

  useEffect(() => {
    if (!discordUserIdFromSession || !guildId) {
      setMemberCacheEntry(null);
      return;
    }
    const entry = loadDiscordMemberCache(discordUserIdFromSession, guildId);
    setMemberCacheEntry(entry);
  }, [discordUserIdFromSession, guildId]);

  useEffect(() => {
    setSelectedMemberId(profile?.discordUserId ?? null);
  }, [profile?.discordUserId]);

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

  const sortedMembers = useMemo(() => {
    if (members.length === 0) {
      return [] as DiscordGuildMemberSummary[];
    }
    return [...members].sort((a, b) => {
      const nameA = a.displayName.toLowerCase();
      const nameB = b.displayName.toLowerCase();
      if (nameA < nameB) {
        return -1;
      }
      if (nameA > nameB) {
        return 1;
      }
      return a.id.localeCompare(b.id);
    });
  }, [members]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredMembers = useMemo(() => {
    if (!normalizedSearch) {
      return sortedMembers;
    }

    return sortedMembers.filter((member) => {
      const fields = [
        member.displayName,
        member.username,
        member.globalName ?? '',
        member.nick ?? ''
      ]
        .filter(Boolean)
        .map((field) => field.toLowerCase());
      return fields.some((field) => field.includes(normalizedSearch));
    });
  }, [normalizedSearch, sortedMembers]);

  const selectedMember = useMemo(
    () => (selectedMemberId ? members.find((member) => member.id === selectedMemberId) ?? null : null),
    [members, selectedMemberId]
  );

  const memberCacheUpdatedLabel = useMemo(
    () => formatDateLabel(dateTimeFormatter, memberCacheEntry?.updatedAt),
    [dateTimeFormatter, memberCacheEntry?.updatedAt]
  );

  const handleSelectMember = useCallback((memberId: string) => {
    setSelectedMemberId(memberId);
    setError(null);
  }, []);

  const refreshGuildSelection = useCallback(() => {
    if (!discordUserIdFromSession) {
      return;
    }
    const selection = loadDiscordGuildSelection(discordUserIdFromSession);
    setGuildSelection(selection);
  }, [discordUserIdFromSession]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!selectedMember) {
      setError('Discordメンバーを選択してください');
      return;
    }

    userProfilesStore.linkDiscordProfile(userId, {
      discordUserId: selectedMember.id,
      discordDisplayName: selectedMember.displayName || null,
      discordUserName: selectedMember.username || selectedMember.globalName || null,
      discordAvatarAssetId: null,
      discordAvatarUrl: selectedMember.avatarUrl ?? null
    });
    close();
  };

  const handleUnlink = () => {
    userProfilesStore.unlinkDiscordProfile(userId);
    close();
  };

  const canUnlink = Boolean(profile?.discordUserId);

  const handleRefreshMemberCache = useCallback(async () => {
    if (!discordUserIdFromSession) {
      setCacheError('Discordにログインしてからメンバーキャッシュを更新してください。');
      return;
    }
    if (!guildId) {
      setCacheError('Discordギルドが選択されていません。');
      return;
    }

    setCacheError(null);
    setCacheMessage(null);
    setIsRefreshingCache(true);

    try {
      const params = new URLSearchParams({ guild_id: guildId, limit: '1000' });
      const response = await fetch(`/api/discord/members?${params.toString()}`, {
        headers: {
          Accept: 'application/json'
        },
        credentials: 'include'
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        members?: DiscordGuildMemberSummary[];
        error?: string;
      } | null;

      if (!response.ok || !payload) {
        const message = payload?.error?.trim();
        throw new Error(message && message.length > 0 ? message : `HTTP ${response.status}`);
      }

      if (!payload.ok || !Array.isArray(payload.members)) {
        throw new Error(payload.error || 'Discordメンバー一覧の取得に失敗しました');
      }

      const normalizedMembers = normalizeDiscordGuildMembers(payload.members);
      if (normalizedMembers.length === 0) {
        throw new Error('利用可能なメンバーが見つかりませんでした');
      }

      const savedEntry = saveDiscordMemberCache(discordUserIdFromSession, guildId, normalizedMembers);
      if (savedEntry) {
        setMemberCacheEntry(savedEntry);
        updateDiscordGuildSelectionMemberCacheTimestamp(
          discordUserIdFromSession,
          guildId,
          savedEntry.updatedAt
        );
        refreshGuildSelection();
        setCacheMessage('メンバーキャッシュを更新しました。');
      } else {
        setMemberCacheEntry({
          guildId,
          members: normalizedMembers,
          updatedAt: new Date().toISOString()
        });
        setCacheMessage('メンバー一覧を更新しました (キャッシュの保存に失敗した可能性があります)。');
      }
    } catch (refreshError) {
      const message =
        refreshError instanceof Error
          ? refreshError.message
          : 'メンバーキャッシュの更新に失敗しました';
      setCacheError(`メンバーキャッシュの更新に失敗しました: ${message}`);
    } finally {
      setIsRefreshingCache(false);
    }
  }, [discordUserIdFromSession, guildId, refreshGuildSelection]);

  const missingSelectedMember = Boolean(selectedMemberId && !selectedMember && members.length > 0);

  const memberDetails = useMemo(() => {
    if (!selectedMember) {
      return null;
    }
    const detailParts = [
      selectedMember.username ? `@${selectedMember.username}` : null,
      selectedMember.globalName ?? null,
      selectedMember.nick ? `(${selectedMember.nick})` : null
    ].filter(Boolean);
    return {
      id: selectedMember.id,
      displayName: selectedMember.displayName,
      details: detailParts.join(' / ') || null
    };
  }, [selectedMember]);

  return (
    <>
      <ModalBody className="space-y-5">
        <div className="space-y-1">
          <p className="text-sm font-medium text-surface-foreground">{userName}</p>
          <p className="text-xs text-muted-foreground">Discord情報を編集または連携解除します。</p>
        </div>
        <form id="discord-profile-form" className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">選択中のDiscordギルド</p>
                <p className="text-sm text-surface-foreground">{guildName ?? '未選択'}</p>
                {memberCacheUpdatedLabel ? (
                  <p className="text-xs text-muted-foreground">メンバーキャッシュ最終更新: {memberCacheUpdatedLabel}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="btn btn-muted inline-flex items-center gap-1"
                onClick={handleRefreshMemberCache}
                disabled={isRefreshingCache || !discordUserIdFromSession || !guildId}
              >
                <ArrowPathIcon
                  className={clsx('h-4 w-4', isRefreshingCache && 'animate-spin')}
                  aria-hidden="true"
                />
                <span>メンバーキャッシュを更新</span>
              </button>
            </div>
            {!discordUserIdFromSession ? (
              <p className="text-xs text-red-500">
                Discordにログインすると所属ギルドのメンバー一覧を利用できます。
              </p>
            ) : null}
            {discordUserIdFromSession && !guildId ? (
              <p className="text-xs text-red-500">Discordギルドが選択されていません。Discord設定からギルドを選択してください。</p>
            ) : null}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-muted-foreground" htmlFor={fieldId('search')}>
                メンバーを検索
              </label>
              <input
                id={fieldId('search')}
                type="text"
                className="w-full rounded-lg border border-border/60 bg-panel-contrast px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="表示名やユーザー名で検索"
                disabled={members.length === 0}
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">メンバー一覧</p>
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-border/60 bg-panel-contrast p-2">
                {filteredMembers.length > 0 ? (
                  filteredMembers.map((member) => {
                    const detailParts = [
                      member.username ? `@${member.username}` : null,
                      member.globalName ?? null,
                      member.nick ? `(${member.nick})` : null
                    ].filter(Boolean);
                    return (
                      <button
                        key={member.id}
                        type="button"
                        className={clsx(
                          'w-full rounded-lg border px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                          selectedMemberId === member.id
                            ? 'border-accent bg-accent/10 text-surface-foreground'
                            : 'border-border/60 bg-panel-contrast text-surface-foreground hover:border-border/40 hover:bg-panel-contrast/80'
                        )}
                        onClick={() => handleSelectMember(member.id)}
                      >
                        <p className="text-sm font-semibold">{member.displayName}</p>
                        {detailParts.length > 0 ? (
                          <p className="text-xs text-muted-foreground">{detailParts.join(' / ')}</p>
                        ) : null}
                        <p className="text-xs text-muted-foreground/80">ID: {member.id}</p>
                      </button>
                    );
                  })
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {guildId
                      ? 'メンバーキャッシュが見つかりません。更新ボタンを押して最新のメンバー一覧を取得してください。'
                      : 'メンバー一覧を取得するにはDiscordにログインし、ギルドを選択してください。'}
                  </p>
                )}
              </div>
            </div>
            {cacheMessage ? <p className="text-xs text-accent">{cacheMessage}</p> : null}
            {cacheError ? <p className="text-xs text-red-500">{cacheError}</p> : null}
            {missingSelectedMember ? (
              <p className="text-xs text-red-500">
                選択中のDiscordユーザーは現在のメンバーキャッシュに存在しません。キャッシュを更新するか、別のメンバーを選択してください。
              </p>
            ) : null}
            {memberDetails ? (
              <div className="space-y-1 rounded-xl border border-border/60 bg-panel-contrast px-3 py-2">
                <p className="text-xs font-semibold text-muted-foreground">選択中のメンバー</p>
                <p className="text-sm text-surface-foreground">{memberDetails.displayName}</p>
                {memberDetails.details ? (
                  <p className="text-xs text-muted-foreground">{memberDetails.details}</p>
                ) : null}
                <p className="text-xs text-muted-foreground/80">ID: {memberDetails.id}</p>
              </div>
            ) : null}
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
          <button
            type="submit"
            form="discord-profile-form"
            className="btn btn-primary"
            disabled={!selectedMember}
          >
            保存
          </button>
        </div>
      </ModalFooter>
    </>
  );
}
