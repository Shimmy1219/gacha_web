import { useCallback, useEffect, useMemo, useState } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { useDiscordSession } from '../../features/discord/useDiscordSession';
import {
  loadDiscordGuildSelection,
  type DiscordGuildSelection
} from '../../features/discord/discordGuildSelectionStorage';
import {
  loadDiscordMemberCache,
  type DiscordMemberCacheEntry,
  type DiscordGuildMemberSummary
} from '../../features/discord/discordMemberCacheStorage';
import { linkDiscordProfileToStore } from '../../features/discord/linkDiscordProfileToStore';

interface UserDiscordProfileLinkDialogPayload {
  userId: string;
  userName: string;
}

function formatDateLabel(formatter: Intl.DateTimeFormat, value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }
  return formatter.format(parsed);
}

function buildMemberDetails(member: DiscordGuildMemberSummary): string | null {
  const details = [
    member.username ? `@${member.username}` : null,
    member.globalName ?? null,
    member.nick ? `(${member.nick})` : null
  ].filter(Boolean);
  return details.length > 0 ? details.join(' / ') : null;
}

export function UserDiscordProfileLinkDialog({
  payload,
  close
}: ModalComponentProps<UserDiscordProfileLinkDialogPayload>): JSX.Element {
  const { userId, userName } = payload;
  const { userProfiles: userProfilesStore } = useDomainStores();
  const { data: discordSession } = useDiscordSession();
  const discordUserId = discordSession?.user?.id ?? null;

  const [guildSelection, setGuildSelection] = useState<DiscordGuildSelection | null>(null);
  const guildId = guildSelection?.guildId ?? null;
  const guildName = guildSelection?.guildName ?? null;

  const [memberCacheEntry, setMemberCacheEntry] = useState<DiscordMemberCacheEntry | null>(null);
  const members = memberCacheEntry?.members ?? [];

  const [searchQuery, setSearchQuery] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('ja-JP', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }),
    []
  );

  const memberCacheUpdatedLabel = useMemo(
    () => formatDateLabel(dateTimeFormatter, memberCacheEntry?.updatedAt ?? null),
    [dateTimeFormatter, memberCacheEntry?.updatedAt]
  );

  useEffect(() => {
    if (!discordUserId) {
      setGuildSelection(null);
      return;
    }
    const selection = loadDiscordGuildSelection(discordUserId);
    setGuildSelection(selection);
  }, [discordUserId]);

  useEffect(() => {
    if (!discordUserId || !guildId) {
      setMemberCacheEntry(null);
      return;
    }
    const entry = loadDiscordMemberCache(discordUserId, guildId);
    setMemberCacheEntry(entry);
  }, [discordUserId, guildId]);

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

  const handleSelectMember = useCallback(
    async (member: DiscordGuildMemberSummary) => {
      if (!userProfilesStore || isLinking) {
        return;
      }
      setIsLinking(true);
      setError(null);
      try {
        await linkDiscordProfileToStore({
          store: userProfilesStore,
          profileId: userId,
          discordUserId: member.id,
          discordDisplayName: member.displayName ?? null,
          discordUserName: member.username || member.globalName || null,
          avatarUrl: member.avatarUrl ?? null
        });
        close();
      } catch (linkError) {
        console.warn('Failed to link Discord profile from member cache', linkError);
        setError('Discord情報の連携に失敗しました。時間をおいて再度お試しください。');
      } finally {
        setIsLinking(false);
      }
    },
    [close, isLinking, userId, userProfilesStore]
  );

  return (
    <>
      <ModalBody className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-surface-foreground">{userName}</p>
          <p className="text-xs text-muted-foreground">連携するDiscordユーザーを選択してください。</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">選択中のDiscordギルド</p>
          <p className="text-sm text-surface-foreground">{guildName ?? '未選択'}</p>
          {memberCacheUpdatedLabel ? (
            <p className="text-xs text-muted-foreground">メンバーキャッシュ最終更新: {memberCacheUpdatedLabel}</p>
          ) : null}
        </div>
        {!discordUserId ? (
          <p className="text-xs text-red-500">Discordにログインしてからメンバー一覧を読み込んでください。</p>
        ) : null}
        {discordUserId && !guildId ? (
          <p className="text-xs text-red-500">Discord設定からギルドを選択するとメンバー一覧を利用できます。</p>
        ) : null}
        {discordUserId && guildId ? (
          members.length > 0 ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label
                  className="block text-xs font-semibold text-muted-foreground"
                  htmlFor={`discord-member-search-${userId}`}
                >
                  メンバーを検索
                </label>
                <input
                  id={`discord-member-search-${userId}`}
                  type="text"
                  className="w-full rounded-lg border border-border/60 bg-panel-contrast px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="表示名やユーザー名で検索"
                />
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-border/60 bg-panel-contrast p-2">
                {filteredMembers.length > 0 ? (
                  filteredMembers.map((member) => {
                    const details = buildMemberDetails(member);
                    const fallbackInitial = member.displayName
                      ? member.displayName.slice(0, 1).toUpperCase()
                      : '?';
                    return (
                      <button
                        key={member.id}
                        type="button"
                        className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-panel-contrast px-3 py-2 text-left text-sm text-surface-foreground transition hover:border-border/40 hover:bg-panel-contrast/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        onClick={() => handleSelectMember(member)}
                        disabled={isLinking}
                      >
                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-border/60 text-xs font-semibold text-muted-foreground">
                          {member.avatarUrl ? (
                            <img src={member.avatarUrl} alt="Discordユーザーのアイコン" className="h-full w-full object-cover" />
                          ) : (
                            <span>{fallbackInitial}</span>
                          )}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <p className="truncate text-sm font-semibold">{member.displayName}</p>
                          {details ? <p className="truncate text-xs text-muted-foreground">{details}</p> : null}
                          <p className="truncate text-xs text-muted-foreground/80">ID: {member.id}</p>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <p className="text-xs text-muted-foreground">検索条件に一致するメンバーが見つかりません。</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              メンバーキャッシュが見つかりません。Discord設定からメンバーキャッシュを更新してください。
            </p>
          )
        ) : null}
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-muted" onClick={close} disabled={isLinking}>
          キャンセル
        </button>
      </ModalFooter>
    </>
  );
}
