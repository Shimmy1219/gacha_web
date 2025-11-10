import { useEffect, useMemo, useState } from 'react';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import {
  DISCORD_MEMBER_CACHE_TTL_MS,
  loadDiscordMemberCache,
  saveDiscordMemberCache,
  type DiscordGuildMemberSummary
} from '../../features/discord/discordMemberCacheStorage';
import {
  type DiscordGuildCategorySelection,
  updateDiscordGuildSelectionMemberCacheTimestamp
} from '../../features/discord/discordGuildSelectionStorage';
import { DiscordPrivateChannelCategoryDialog } from './DiscordPrivateChannelCategoryDialog';

interface DiscordMembersResponse {
  ok: boolean;
  members?: DiscordGuildMemberSummary[];
  error?: string;
}

interface DiscordMemberPickerPayload {
  guildId: string;
  discordUserId: string;
  initialCategory?: DiscordGuildCategorySelection | null;
  shareUrl: string;
  shareLabel?: string;
  shareTitle?: string;
  receiverName?: string;
  onShared?: (result: {
    memberId: string;
    memberName: string;
    memberDisplayName: string;
    memberUsername?: string;
    memberGlobalName?: string | null;
    memberAvatarHash?: string | null;
    memberAvatarUrl?: string | null;
    channelId: string;
    channelName?: string | null;
    channelParentId?: string | null;
    created: boolean;
    shareUrl: string;
    shareLabel?: string | null;
    shareTitle: string;
    shareComment?: string | null;
    sharedAt: string;
  }) => void;
  onShareFailed?: (message: string) => void;
}

function getMemberAvatarUrl(member: DiscordGuildMemberSummary): string | null {
  if (!member.avatar) {
    return null;
  }
  return `https://cdn.discordapp.com/avatars/${member.id}/${member.avatar}.png?size=128`;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setDebounced(value);
      return;
    }

    const timer = window.setTimeout(() => {
      setDebounced(value);
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delay]);

  return debounced;
}

function useDiscordGuildMembers(
  discordUserId: string | null | undefined,
  guildId: string | null | undefined,
  query: string
) {
  const trimmedQuery = query.trim();
  const cacheEntry = useMemo(() => loadDiscordMemberCache(discordUserId, guildId), [discordUserId, guildId]);

  const initialData = useMemo(() => {
    if (!cacheEntry) {
      return undefined;
    }

    if (!trimmedQuery) {
      return cacheEntry.members;
    }

    const lowered = trimmedQuery.toLowerCase();
    return cacheEntry.members.filter((member) => {
      const fields = [
        member.displayName,
        member.username,
        member.globalName ?? '',
        member.nick ?? ''
      ]
        .filter(Boolean)
        .map((field) => field.toLowerCase());
      return fields.some((field) => field.includes(lowered));
    });
  }, [cacheEntry, trimmedQuery]);

  const initialDataUpdatedAt = useMemo(() => {
    if (!cacheEntry) {
      return undefined;
    }
    const timestamp = Date.parse(cacheEntry.updatedAt);
    return Number.isNaN(timestamp) ? undefined : timestamp;
  }, [cacheEntry]);

  return useQuery<DiscordGuildMemberSummary[]>({
    queryKey: ['discord', 'members', discordUserId, guildId, trimmedQuery],
    queryFn: async () => {
      if (!discordUserId || !guildId) {
        return [];
      }

      const params = new URLSearchParams({ guild_id: guildId, limit: trimmedQuery ? '200' : '1000' });
      if (trimmedQuery) {
        params.set('q', trimmedQuery);
      }

      const response = await fetch(`/api/discord/members?${params.toString()}`, {
        headers: {
          Accept: 'application/json'
        },
        credentials: 'include'
      });

      const payload = (await response.json().catch(() => null)) as DiscordMembersResponse | null;

      if (!response.ok) {
        const message = payload?.error?.trim();
        throw new Error(
          message && message.length > 0
            ? `Discordメンバー一覧の取得に失敗しました: ${message}`
            : `Discordメンバー一覧の取得に失敗しました (${response.status})`
        );
      }

      if (!payload?.ok || !Array.isArray(payload.members)) {
        throw new Error(payload?.error || 'Discordメンバー一覧の取得に失敗しました');
      }

      if (!trimmedQuery) {
        const savedEntry = saveDiscordMemberCache(discordUserId, guildId, payload.members);
        updateDiscordGuildSelectionMemberCacheTimestamp(discordUserId, guildId, savedEntry?.updatedAt ?? null);
        if (!savedEntry) {
          console.warn('Discord member cache could not be persisted. Continuing with API response only.');
        }
      }

      return payload.members;
    },
    enabled: Boolean(discordUserId && guildId),
    staleTime: trimmedQuery ? 0 : DISCORD_MEMBER_CACHE_TTL_MS,
    gcTime: 5 * 60 * 1000,
    keepPreviousData: true,
    initialData,
    initialDataUpdatedAt
  });
}

export function DiscordMemberPickerDialog({
  payload,
  close,
  push
}: ModalComponentProps<DiscordMemberPickerPayload>): JSX.Element {
  const guildId = payload?.guildId ?? null;
  const discordUserId = payload?.discordUserId ?? '';
  const [searchInput, setSearchInput] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<DiscordGuildCategorySelection | null>(
    payload?.initialCategory ?? null
  );

  const debouncedQuery = useDebouncedValue(searchInput, 300);
  const membersQuery = useDiscordGuildMembers(discordUserId, guildId, debouncedQuery);

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);

  useEffect(() => {
    if (!selectedMemberId) {
      return;
    }
    const stillExists = members.some((member) => member.id === selectedMemberId);
    if (!stillExists) {
      setSelectedMemberId(null);
    }
  }, [members, selectedMemberId]);

  const sortedMembers = useMemo(() => {
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

  const handleSelect = (memberId: string) => {
    setSelectedMemberId(memberId);
    setSubmitError(null);
  };

  useEffect(() => {
    if (!payload?.initialCategory) {
      return;
    }
    setSelectedCategory(payload.initialCategory);
  }, [payload?.initialCategory?.id]);

  const openCategoryDialog = () => {
    if (!guildId || !discordUserId) {
      setSubmitError('Discordギルドまたはアカウント情報を取得できませんでした。');
      return;
    }
    push(DiscordPrivateChannelCategoryDialog, {
      title: 'お渡しカテゴリの選択',
      size: 'lg',
      payload: {
        guildId,
        discordUserId,
        initialCategory: selectedCategory,
        onCategorySelected: (category) => {
          setSelectedCategory(category);
          setSubmitError(null);
        }
      }
    });
  };

  const performShare = async (category: DiscordGuildCategorySelection) => {
    if (!payload?.shareUrl) {
      const message = '共有URLが見つかりませんでした。ZIPをアップロードしてから再度お試しください。';
      setSubmitError(message);
      payload?.onShareFailed?.(message);
      return;
    }
    if (!guildId) {
      const message = 'Discordギルド情報を取得できませんでした。';
      setSubmitError(message);
      payload?.onShareFailed?.(message);
      return;
    }
    if (!selectedMemberId) {
      setSubmitError('共有先のメンバーを選択してください。');
      return;
    }
    if (!category?.id) {
      setSubmitError('お渡し用のカテゴリが選択されていません。');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const params = new URLSearchParams({
        guild_id: guildId,
        member_id: selectedMemberId,
        create: '1'
      });
      const selectedMemberSummary = members.find((member) => member.id === selectedMemberId);
      if (selectedMemberSummary?.displayName) {
        params.set('display_name', selectedMemberSummary.displayName);
      }
      params.set('category_id', category.id);

      const findResponse = await fetch(`/api/discord/find-channels?${params.toString()}`, {
        headers: {
          Accept: 'application/json'
        },
        credentials: 'include'
      });

      const findPayload = (await findResponse.json().catch(() => null)) as {
        ok: boolean;
        channel_id?: string | null;
        channel_name?: string | null;
        parent_id?: string | null;
        created?: boolean;
        error?: string;
      } | null;

      if (!findResponse.ok || !findPayload) {
        const message = findPayload?.error || `お渡しチャンネルの確認に失敗しました (${findResponse.status})`;
        throw new Error(message);
      }

      if (!findPayload.ok) {
        throw new Error(findPayload.error || 'お渡しチャンネルの確認に失敗しました');
      }

      const channelId = findPayload.channel_id ?? null;
      if (!channelId) {
        throw new Error('お渡しチャンネルの作成に失敗しました。');
      }

      const title =
        payload.shareTitle ?? `${payload.receiverName ?? '景品'}のお渡しリンクです`;
      const comment =
        payload.shareLabel && payload.shareLabel !== payload.shareUrl
          ? payload.shareLabel
          : undefined;

      const sendResponse = await fetch('/api/discord/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          channel_id: channelId,
          share_url: payload.shareUrl,
          title,
          comment,
          mode: 'bot'
        })
      });

      const sendPayload = (await sendResponse
        .json()
        .catch(() => ({ ok: false, error: 'unexpected response' }))) as {
        ok?: boolean;
        error?: string;
      };

      if (!sendResponse.ok || !sendPayload.ok) {
        throw new Error(sendPayload.error || 'Discordへの共有に失敗しました');
      }

      const selectedMember = selectedMemberSummary ?? members.find((member) => member.id === selectedMemberId);
      const memberDisplayName = selectedMember?.displayName ?? selectedMemberId;
      const memberName = memberDisplayName;
      const memberAvatarUrl = selectedMember ? getMemberAvatarUrl(selectedMember) : null;

      const sharedAt = new Date().toISOString();

      payload?.onShared?.({
        memberId: selectedMemberId,
        memberName,
        memberDisplayName,
        memberUsername: selectedMember?.username,
        memberGlobalName: selectedMember?.globalName ?? null,
        memberAvatarHash: selectedMember?.avatar ?? null,
        memberAvatarUrl,
        channelId,
        channelName: findPayload.channel_name ?? null,
        channelParentId: findPayload.parent_id ?? null,
        created: Boolean(findPayload.created),
        shareUrl: payload.shareUrl,
        shareLabel: payload.shareLabel ?? null,
        shareTitle: title,
        shareComment: comment ?? null,
        sharedAt
      });
      close();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Discord共有処理に失敗しました';
      const displayMessage = `Discord共有処理に失敗しました: ${message}`;
      setSubmitError(displayMessage);
      payload?.onShareFailed?.(displayMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedMemberId) {
      setSubmitError('共有先のメンバーを選択してください。');
      return;
    }
    if (!selectedCategory?.id) {
      openCategoryDialog();
      return;
    }
    await performShare(selectedCategory);
  };

  return (
    <>
      <ModalBody className="space-y-6">
        <section className="rounded-2xl border border-border/70 bg-surface/20 p-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            Discordギルドのメンバーから共有先を選択し、お渡し用のテキストチャンネルへ共有リンクを送信します。
          </p>
          <p className="mt-2">
            選択したメンバーとの1:1お渡しチャンネルが見つからない場合は、保存済みのカテゴリ配下に自動で作成します。カテゴリは事前に設定しておく必要があります。
          </p>
          {selectedCategory ? (
            <p className="mt-2 text-xs text-surface-foreground">
              現在のお渡しカテゴリ: {selectedCategory.name} (ID: {selectedCategory.id})
            </p>
          ) : (
            <p className="mt-2 text-xs text-danger">
              お渡しカテゴリが未設定です。「Discordに共有」を押すとカテゴリ選択モーダルが表示されます。
            </p>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h3 className="text-sm font-semibold text-surface-foreground">
              ギルドメンバー一覧
            </h3>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {membersQuery.isFetching ? (
                <span className="inline-flex items-center gap-1" aria-live="polite">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
                  更新中…
                </span>
              ) : null}
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-panel px-3 py-1.5 font-medium text-surface-foreground transition hover:bg-surface/60"
                onClick={() => {
                  void membersQuery.refetch();
                }}
                disabled={membersQuery.isFetching}
                aria-busy={membersQuery.isFetching}
              >
                <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
                再取得
              </button>
            </div>
          </div>

          <div className="relative">
            <MagnifyingGlassIcon
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              className="w-full rounded-full border border-border/70 bg-surface/30 py-2 pl-10 pr-4 text-sm text-surface-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="メンバーを検索 (ニックネーム / ユーザー名)"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>

          {membersQuery.isLoading ? (
            <div className="space-y-2">
              <MemberPlaceholder />
              <MemberPlaceholder />
              <MemberPlaceholder />
            </div>
          ) : null}

          {!membersQuery.isLoading && membersQuery.isError ? (
            <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {membersQuery.error instanceof Error
                ? membersQuery.error.message
                : 'Discordメンバー一覧の取得に失敗しました。数秒後に再取得をお試しください。'}
            </div>
          ) : null}

          {!membersQuery.isLoading && !membersQuery.isError && sortedMembers.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-surface/30 px-4 py-3 text-sm text-muted-foreground">
              条件に一致するメンバーが見つかりませんでした。
            </div>
          ) : null}

          {!membersQuery.isLoading && !membersQuery.isError && sortedMembers.length > 0 ? (
            <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {sortedMembers.map((member) => {
                const isSelected = member.id === selectedMemberId;
                const avatarUrl = getMemberAvatarUrl(member);
                const displayName =
                  (member.displayName && member.displayName.trim().length > 0
                    ? member.displayName
                    : undefined) ??
                  member.globalName ??
                  member.username ??
                  member.id;
                const fallbackLabel =
                  member.username && member.username.trim().length > 0
                    ? member.username
                    : member.id;
                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(member.id)}
                      className="flex w-full items-center gap-4 rounded-2xl border border-border/70 bg-surface/40 p-4 text-left transition hover:border-accent/50 hover:bg-surface/60"
                      aria-pressed={isSelected}
                    >
                      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface text-base font-semibold text-muted-foreground">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="Member avatar" className="h-full w-full object-cover" />
                        ) : (
                          displayName.slice(0, 2)
                        )}
                      </span>
                      <div className="flex flex-1 flex-col">
                        <span className="text-sm font-semibold text-surface-foreground">
                          {displayName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          @
                          {fallbackLabel}
                          {member.nick ? ` ／ サーバーニックネーム: ${member.nick}` : ''}
                        </span>
                      </div>
                      {isSelected ? (
                        <CheckCircleIcon className="h-6 w-6 text-accent" aria-hidden="true" />
                      ) : (
                        <span className="h-6 w-6 rounded-full border border-border/60" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {submitError ? (
            <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {submitError}
            </div>
          ) : null}
        </section>
      </ModalBody>

      <ModalFooter>
        <button type="button" className="btn btn-muted" onClick={close} disabled={isSubmitting}>
          キャンセル
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={isSubmitting || !selectedMemberId || membersQuery.isLoading}
          aria-busy={isSubmitting}
        >
          <span className="flex items-center gap-2">
            {isSubmitting ? <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            <span>Discordに共有</span>
          </span>
        </button>
      </ModalFooter>
    </>
  );
}

function MemberPlaceholder(): JSX.Element {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-surface/30 p-4">
      <div className="h-12 w-12 rounded-xl bg-surface/60" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-1/2 rounded-full bg-surface/60" />
        <div className="h-3 w-1/3 rounded-full bg-surface/50" />
      </div>
    </div>
  );
}
