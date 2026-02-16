import { useEffect, useMemo, useState } from 'react';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import {
  DISCORD_MEMBER_CACHE_TTL_MS,
  loadDiscordMemberCache,
  normalizeDiscordGuildMembers,
  normalizeDiscordMemberGiftChannels,
  saveDiscordMemberCache,
  mergeDiscordMemberGiftChannels,
  mergeDiscordGuildMembersGiftChannelMetadata,
  applyGiftChannelMetadataFromCache,
  type DiscordMemberCacheEntry,
  type DiscordMemberGiftChannelInfo,
  type DiscordGuildMemberSummary
} from '../../features/discord/discordMemberCacheStorage';
import { sortDiscordGuildMembers, type DiscordGuildMemberSortMode } from '../../features/discord/discordMemberSorting';
import {
  type DiscordGuildCategorySelection,
  loadDiscordGuildSelection,
  updateDiscordGuildSelectionMemberCacheTimestamp
} from '../../features/discord/discordGuildSelectionStorage';
import { fetchDiscordApi } from '../../features/discord/fetchDiscordApi';
import { recoverDiscordCategoryLimitByCreatingNextCategory } from '../../features/discord/recoverDiscordCategoryLimit';
import { DiscordPrivateChannelCategoryDialog } from './DiscordPrivateChannelCategoryDialog';
import {
  isDiscordCategoryChannelLimitReachedErrorCode,
  pushDiscordApiWarningByErrorCode
} from './_lib/discordApiErrorHandling';

export interface DiscordMemberShareResult {
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
}

interface DiscordMembersResponse {
  ok: boolean;
  members?: DiscordGuildMemberSummary[];
  error?: string;
  errorCode?: string;
}

interface DiscordGiftChannelsResponse {
  ok: boolean;
  channels?: unknown;
  error?: string;
  errorCode?: string;
}

type DiscordMemberPickerMode = 'share' | 'link';

interface DiscordMemberPickerBasePayload {
  mode?: DiscordMemberPickerMode;
  guildId: string;
  discordUserId: string;
  initialCategory?: DiscordGuildCategorySelection | null;
}

interface DiscordMemberPickerSharePayload extends DiscordMemberPickerBasePayload {
  mode?: 'share';
  shareUrl: string;
  shareLabel?: string;
  shareTitle?: string;
  receiverName?: string;
  onShared?: (result: DiscordMemberShareResult) => void;
  onShareFailed?: (message: string) => void;
}

interface DiscordMemberPickerLinkPayload extends DiscordMemberPickerBasePayload {
  mode: 'link';
  submitLabel?: string;
  refreshLabel?: string;
  onMemberPicked?: (member: DiscordGuildMemberSummary) => void | Promise<void>;
  onMemberPickFailed?: (message: string) => void;
}

type DiscordMemberPickerPayload = DiscordMemberPickerSharePayload | DiscordMemberPickerLinkPayload;

function getMemberAvatarUrl(member: DiscordGuildMemberSummary): string | null {
  if (member.avatarUrl) {
    return member.avatarUrl;
  }
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
  query: string,
  categoryId: string | null | undefined,
  push: ModalComponentProps['push']
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
    queryKey: ['discord', 'members', discordUserId, guildId, trimmedQuery, categoryId ?? null],
    queryFn: async () => {
      if (!discordUserId || !guildId) {
        return [];
      }

      const params = new URLSearchParams({ guild_id: guildId, limit: trimmedQuery ? '200' : '1000' });
      if (trimmedQuery) {
        params.set('q', trimmedQuery);
      }

      const response = await fetchDiscordApi(`/api/discord/members?${params.toString()}`, {
        method: 'GET'
      });

      const payload = (await response.json().catch(() => null)) as DiscordMembersResponse | null;

      if (!response.ok) {
        const message = payload?.error?.trim();
        pushDiscordApiWarningByErrorCode(
          push,
          payload?.errorCode,
          message && message.length > 0 ? message : `Discordメンバー一覧の取得に失敗しました (${response.status})`
        );
        throw new Error(
          message && message.length > 0
            ? `Discordメンバー一覧の取得に失敗しました: ${message}`
            : `Discordメンバー一覧の取得に失敗しました (${response.status})`
        );
      }

      if (!payload?.ok || !Array.isArray(payload.members)) {
        pushDiscordApiWarningByErrorCode(push, payload?.errorCode, payload?.error);
        throw new Error(payload?.error || 'Discordメンバー一覧の取得に失敗しました');
      }

      let normalizedMembers = normalizeDiscordGuildMembers(payload.members);
      let channelCacheEntry: DiscordMemberCacheEntry | null = null;
      if (!trimmedQuery) {
        const savedEntry = saveDiscordMemberCache(discordUserId, guildId, normalizedMembers);
        const persistedMembers = savedEntry?.members ?? normalizedMembers;
        normalizedMembers = persistedMembers;
        updateDiscordGuildSelectionMemberCacheTimestamp(discordUserId, guildId, savedEntry?.updatedAt ?? null);
        if (!savedEntry) {
          console.warn('Discord member cache could not be persisted. Continuing with API response only.');
        }
      }

      if (guildId && normalizedMembers.length > 0) {
        let latestChannels: DiscordMemberGiftChannelInfo[] | null = null;
        const channelMemberIds = trimmedQuery
          ? normalizedMembers.map((member) => member.id).filter(Boolean)
          : null;

        try {
          const channelParams = new URLSearchParams({ guild_id: guildId });
          if (categoryId) {
            channelParams.set('category_id', categoryId);
          }
          if (trimmedQuery) {
            if (channelMemberIds && channelMemberIds.length > 0) {
              channelParams.set('member_ids', channelMemberIds.join(','));
            }
          }

          const giftResponse = await fetchDiscordApi(`/api/discord/list-gift-channels?${channelParams.toString()}`, {
            method: 'GET'
          });

          const giftPayload = (await giftResponse.json().catch(() => null)) as DiscordGiftChannelsResponse | null;

          if (!giftResponse.ok || !giftPayload?.ok) {
            const message = giftPayload?.error?.trim();
            pushDiscordApiWarningByErrorCode(
              push,
              giftPayload?.errorCode,
              message && message.length > 0 ? message : `お渡しチャンネル一覧の取得に失敗しました (${giftResponse.status})`
            );
            if (message) {
              console.warn(`Failed to update Discord gift channel cache: ${message}`);
            } else {
              console.warn(`Failed to update Discord gift channel cache (${giftResponse.status})`);
            }
          } else if (discordUserId) {
            const normalizedChannels = normalizeDiscordMemberGiftChannels(giftPayload.channels);
            latestChannels = normalizedChannels;
            const mergeOptions = channelMemberIds ? { memberIds: channelMemberIds } : undefined;
            const mergedEntry = mergeDiscordMemberGiftChannels(
              discordUserId,
              guildId,
              normalizedChannels,
              mergeOptions
            );
            if (mergedEntry) {
              channelCacheEntry = mergedEntry;
            }
          }
        } catch (error) {
          console.warn('Failed to update Discord gift channel cache', error);
        }

        if (!channelCacheEntry && discordUserId && guildId) {
          channelCacheEntry = loadDiscordMemberCache(discordUserId, guildId);
        }

        if (channelCacheEntry) {
          normalizedMembers = applyGiftChannelMetadataFromCache(normalizedMembers, channelCacheEntry.members);
        }

        if (latestChannels) {
          normalizedMembers = mergeDiscordGuildMembersGiftChannelMetadata(normalizedMembers, latestChannels, {
            memberIds: channelMemberIds,
            mode: 'replace'
          });
        }
      }

      return normalizedMembers;
    },
    enabled: Boolean(discordUserId && guildId),
    staleTime: trimmedQuery ? 0 : DISCORD_MEMBER_CACHE_TTL_MS,
    gcTime: 5 * 60 * 1000,
    keepPreviousData: true,
    initialData,
    initialDataUpdatedAt,
    retry: false
  });
}

export function DiscordMemberPickerDialog({
  payload,
  close,
  push
}: ModalComponentProps<DiscordMemberPickerPayload>): JSX.Element {
  const queryClient = useQueryClient();
  const mode: DiscordMemberPickerMode = payload?.mode === 'link' ? 'link' : 'share';
  const isLinkMode = mode === 'link';
  const sharePayload = !isLinkMode ? (payload as DiscordMemberPickerSharePayload | undefined) : undefined;
  const linkPayload = isLinkMode ? (payload as DiscordMemberPickerLinkPayload | undefined) : undefined;

  const guildId = payload?.guildId ?? null;
  const discordUserId = payload?.discordUserId ?? '';
  const [searchInput, setSearchInput] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sortMode, setSortMode] = useState<DiscordGuildMemberSortMode>('newest');
  const [selectedCategory, setSelectedCategory] = useState<DiscordGuildCategorySelection | null>(
    !isLinkMode ? payload?.initialCategory ?? null : null
  );
  const categoryFilterId = useMemo(() => {
    const selectedId = selectedCategory?.id?.trim();
    if (selectedId) {
      return selectedId;
    }
    const initialId = payload?.initialCategory?.id?.trim();
    return initialId && initialId.length > 0 ? initialId : null;
  }, [payload?.initialCategory?.id, selectedCategory?.id]);

  const debouncedQuery = useDebouncedValue(searchInput, 300);
  const membersQuery = useDiscordGuildMembers(discordUserId, guildId, debouncedQuery, categoryFilterId, push);

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
    return sortDiscordGuildMembers(members, sortMode);
  }, [members, sortMode]);

  const handleSelect = (memberId: string) => {
    setSelectedMemberId(memberId);
    setSubmitError(null);
  };

  useEffect(() => {
    if (isLinkMode) {
      setSelectedCategory(null);
      return;
    }
    if (!sharePayload?.initialCategory) {
      return;
    }
    setSelectedCategory(sharePayload.initialCategory);
  }, [isLinkMode, sharePayload?.initialCategory?.id]);

  const openCategoryDialog = () => {
    if (isLinkMode) {
      return;
    }
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
    if (!sharePayload?.shareUrl) {
      const message = '共有URLが見つかりませんでした。ZIPをアップロードしてから再度お試しください。';
      setSubmitError(message);
      sharePayload?.onShareFailed?.(message);
      return;
    }
    if (!guildId) {
      const message = 'Discordギルド情報を取得できませんでした。';
      setSubmitError(message);
      sharePayload?.onShareFailed?.(message);
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
      const selectedMemberSummary = members.find((member) => member.id === selectedMemberId);
      let activeCategory = category;
      const exhaustedCategoryIds = new Set<string>();
      let confirmationRequired = true;
      let findPayload: {
        ok: boolean;
        channel_id?: string | null;
        channel_name?: string | null;
        parent_id?: string | null;
        created?: boolean;
        error?: string;
        errorCode?: string;
      } | null = null;

      while (true) {
        const params = new URLSearchParams({
          guild_id: guildId,
          member_id: selectedMemberId,
          create: '1'
        });
        if (selectedMemberSummary?.displayName) {
          params.set('display_name', selectedMemberSummary.displayName);
        }
        params.set('category_id', activeCategory.id);

        const findResponse = await fetchDiscordApi(`/api/discord/find-channels?${params.toString()}`, {
          method: 'GET'
        });

        findPayload = (await findResponse.json().catch(() => null)) as {
          ok: boolean;
          channel_id?: string | null;
          channel_name?: string | null;
          parent_id?: string | null;
          created?: boolean;
          error?: string;
          errorCode?: string;
        } | null;

        if (!findResponse.ok || !findPayload || !findPayload.ok) {
          const message =
            !findResponse.ok || !findPayload
              ? findPayload?.error || `お渡しチャンネルの確認に失敗しました (${findResponse.status})`
              : findPayload.error || 'お渡しチャンネルの確認に失敗しました';

          if (
            isDiscordCategoryChannelLimitReachedErrorCode(findPayload?.errorCode)
          ) {
            const storedSelection = loadDiscordGuildSelection(discordUserId);
            if (!storedSelection || storedSelection.guildId !== guildId) {
              throw new Error('Discordギルドの選択情報を再取得してください。');
            }

            exhaustedCategoryIds.add(activeCategory.id);
            const nextCategory = await recoverDiscordCategoryLimitByCreatingNextCategory({
              push,
              discordUserId,
              guildSelection: storedSelection,
              currentCategoryId: activeCategory.id,
              currentCategoryName: activeCategory.name,
              exhaustedCategoryIds,
              confirmationRequired
            });
            if (!nextCategory?.id) {
              throw new Error('Discord共有を中断しました。');
            }

            activeCategory = nextCategory;
            setSelectedCategory(nextCategory);
            setSubmitError(null);
            confirmationRequired = false;
            continue;
          }

          if (pushDiscordApiWarningByErrorCode(push, findPayload?.errorCode, message)) {
            setSubmitError(null);
            return;
          }
          throw new Error(message);
        }

        break;
      }

      if (!findPayload) {
        throw new Error('お渡しチャンネルの作成に失敗しました。');
      }

      const channelId = findPayload.channel_id ?? null;
      if (!channelId) {
        throw new Error('お渡しチャンネルの作成に失敗しました。');
      }

      const nextGiftChannelInfo: DiscordMemberGiftChannelInfo = {
        memberId: selectedMemberId,
        channelId,
        channelName: findPayload.channel_name ?? null,
        channelParentId: findPayload.parent_id ?? activeCategory.id,
        botHasView: true
      };

      // Gift channel creation can succeed even if the subsequent send fails.
      // Update cache so the member list reflects "お渡しチャンネル未作成" -> created.
      mergeDiscordMemberGiftChannels(discordUserId, guildId, [nextGiftChannelInfo], {
        memberIds: [selectedMemberId],
        mode: 'upsert'
      });

      const trimmedQuery = debouncedQuery.trim();
      queryClient.setQueryData<DiscordGuildMemberSummary[]>(
        ['discord', 'members', discordUserId, guildId, trimmedQuery, categoryFilterId ?? null],
        (current) => {
          if (!Array.isArray(current)) {
            return current;
          }
          return mergeDiscordGuildMembersGiftChannelMetadata(current, [nextGiftChannelInfo], {
            memberIds: [selectedMemberId],
            mode: 'upsert'
          });
        }
      );

      const title =
        sharePayload?.shareTitle ?? `${sharePayload?.receiverName ?? '景品'}のお渡しリンクです`;
      const comment =
        sharePayload?.shareLabel && sharePayload.shareLabel !== sharePayload.shareUrl
          ? sharePayload.shareLabel
          : undefined;

      const sendResponse = await fetchDiscordApi('/api/discord/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          channel_id: channelId,
          share_url: sharePayload.shareUrl,
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

      sharePayload?.onShared?.({
        memberId: selectedMemberId,
        memberName,
        memberDisplayName,
        memberUsername: selectedMember?.username,
        memberGlobalName: selectedMember?.globalName ?? null,
        memberAvatarHash: selectedMember?.avatar ?? null,
        memberAvatarUrl,
        channelId,
        channelName: findPayload.channel_name ?? null,
        channelParentId: findPayload.parent_id ?? activeCategory.id,
        created: Boolean(findPayload.created),
        shareUrl: sharePayload.shareUrl,
        shareLabel: sharePayload?.shareLabel ?? null,
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
      sharePayload?.onShareFailed?.(displayMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const performLink = async () => {
    if (!linkPayload?.onMemberPicked) {
      const message = 'Discord情報の連携処理が設定されていません。';
      setSubmitError(message);
      linkPayload?.onMemberPickFailed?.(message);
      return;
    }
    if (!selectedMemberId) {
      setSubmitError('連携するメンバーを選択してください。');
      return;
    }

    const selectedMember = members.find((member) => member.id === selectedMemberId);
    if (!selectedMember) {
      const message = '選択したメンバーの情報を取得できませんでした。再度選択してください。';
      setSubmitError(message);
      linkPayload.onMemberPickFailed?.(message);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await linkPayload.onMemberPicked(selectedMember);
      close();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Discord情報の連携に失敗しました。';
      const displayMessage = message.includes('Discord情報')
        ? message
        : `Discord情報の連携に失敗しました: ${message}`;
      setSubmitError(displayMessage);
      linkPayload.onMemberPickFailed?.(displayMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedMemberId) {
      setSubmitError(isLinkMode ? '連携するメンバーを選択してください。' : '共有先のメンバーを選択してください。');
      return;
    }
    if (isLinkMode) {
      await performLink();
      return;
    }
    if (!selectedCategory?.id) {
      openCategoryDialog();
      return;
    }
    await performShare(selectedCategory);
  };

  const refreshLabel = linkPayload?.refreshLabel ?? '再取得';
  const refreshButtonLabel = membersQuery.isFetching ? '更新中' : refreshLabel;
  const submitLabel = linkPayload?.submitLabel ?? 'Discordに共有';

  return (
    <>
      <ModalBody className="discord-member-picker-dialog__body space-y-6">
        <section className="discord-member-picker-dialog__intro rounded-2xl border border-border/70 bg-surface/20 p-4 text-sm leading-relaxed text-muted-foreground">
          {isLinkMode ? (
            <>
              <p>Discordギルドのメンバーから連携するユーザーを選択し、ユーザープロフィールに保存します。</p>
              <p className="mt-2">
                選択したメンバーの表示名・ユーザー名・アイコンが、このユーザーのプロフィールに反映されます。
              </p>
            </>
          ) : (
            <>
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
            </>
          )}
        </section>

        <section className="discord-member-picker-dialog__member-section space-y-4">
          {isLinkMode && !discordUserId ? (
            <p className="text-xs text-danger">Discordにログインしてからメンバー一覧を読み込んでください。</p>
          ) : null}
          {isLinkMode && discordUserId && !guildId ? (
            <p className="text-xs text-danger">Discord設定からギルドを選択するとメンバー一覧を利用できます。</p>
          ) : null}
          <div className="discord-member-picker-dialog__member-header flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h3 className="discord-member-picker-dialog__member-title text-sm font-semibold text-surface-foreground">
              ギルドメンバー一覧
            </h3>
            <div className="discord-member-picker-dialog__member-controls flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <div className="discord-member-picker-dialog__sort flex items-center gap-2">
                <label
                  htmlFor="discord-member-picker-sort-select"
                  className="discord-member-picker-dialog__sort-label text-xs font-medium text-muted-foreground"
                >
                  並び替え
                </label>
                <select
                  id="discord-member-picker-sort-select"
                  className="discord-member-picker-dialog__sort-select rounded-full border border-border/60 bg-panel px-3 py-1.5 text-xs font-medium text-surface-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                  value={sortMode}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (next === 'name' || next === 'id' || next === 'newest' || next === 'oldest') {
                      setSortMode(next);
                    }
                  }}
                >
                  <option value="name">名前順</option>
                  <option value="id">ID順</option>
                  <option value="newest">新規加入順</option>
                  <option value="oldest">古参順</option>
                </select>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-panel px-3 py-1.5 font-medium text-surface-foreground transition hover:bg-surface/60"
                onClick={() => {
                  void membersQuery.refetch();
                }}
                disabled={membersQuery.isFetching}
                aria-busy={membersQuery.isFetching}
              >
                <ArrowPathIcon className={`h-4 w-4 ${membersQuery.isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span aria-live="polite">{refreshButtonLabel}</span>
              </button>
            </div>
          </div>

          <div className="discord-member-picker-dialog__search relative">
            <MagnifyingGlassIcon
              className="discord-member-picker-dialog__search-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              id="discord-member-picker-search-input"
              aria-label="メンバー検索"
              className="discord-member-picker-dialog__search-input w-full rounded-full border border-border/70 bg-surface/30 py-2 pl-10 pr-4 text-sm text-surface-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
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
            <ul className="discord-member-picker-dialog__member-list max-h-80 space-y-2 overflow-y-auto pr-1">
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
                const giftChannelName = member.giftChannelName?.trim();
                const hasGiftChannel = Boolean(member.giftChannelId);
                const resolvedChannelName =
                  giftChannelName && giftChannelName.length > 0
                    ? `#${giftChannelName}`
                    : member.giftChannelId ?? '';
                const giftLabel = hasGiftChannel
                  ? `お渡しチャンネル: ${resolvedChannelName}`
                  : 'お渡しチャンネル未作成';
                const giftBadgeClass = hasGiftChannel
                  ? 'inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success'
                  : 'inline-flex items-center rounded-full bg-surface/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground';
                const categoryLabel =
                  hasGiftChannel && member.giftChannelParentId
                    ? `カテゴリID: ${member.giftChannelParentId}`
                    : null;
                const botWarningLabel =
                  hasGiftChannel && member.giftChannelBotHasView === false ? 'Bot閲覧不可' : null;
                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(member.id)}
                      className="discord-member-picker-dialog__member-button flex w-full items-center gap-4 rounded-2xl border border-border/70 bg-surface/40 p-4 text-left transition hover:border-accent/50 hover:bg-surface/60"
                      aria-pressed={isSelected}
                    >
                      <span className="discord-member-picker-dialog__member-avatar relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface text-base font-semibold text-muted-foreground">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="Member avatar" className="h-full w-full object-cover" />
                        ) : (
                          displayName.slice(0, 2)
                        )}
                      </span>
                      <div className="discord-member-picker-dialog__member-info flex flex-1 flex-col">
                        <span className="discord-member-picker-dialog__member-name text-sm font-semibold text-surface-foreground">
                          {displayName}
                        </span>
                        <span className="discord-member-picker-dialog__member-username text-xs text-muted-foreground">
                          @
                          {fallbackLabel}
                          {member.nick ? ` ／ サーバーニックネーム: ${member.nick}` : ''}
                        </span>
                        <div className="discord-member-picker-dialog__member-meta flex flex-wrap items-center gap-2">
                          <span className={giftBadgeClass}>{giftLabel}</span>
                          {categoryLabel ? (
                            <span className="inline-flex items-center rounded-full bg-surface/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              {categoryLabel}
                            </span>
                          ) : null}
                          {botWarningLabel ? (
                            <span className="inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning-foreground">
                              {botWarningLabel}
                            </span>
                          ) : null}
                        </div>
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
            <span>{submitLabel}</span>
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
