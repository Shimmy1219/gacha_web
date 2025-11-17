import { useEffect, useMemo, useState } from 'react';
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { DiscordPrivateChannelCategoryDialog } from './DiscordPrivateChannelCategoryDialog';
import { useDiscordOwnedGuilds, type DiscordGuildSummary } from '../../features/discord/useDiscordOwnedGuilds';
import {
  loadDiscordGuildSelection,
  saveDiscordGuildSelection,
  type DiscordGuildSelection
} from '../../features/discord/discordGuildSelectionStorage';
import {
  saveDiscordMemberCache,
  mergeDiscordMemberGiftChannels,
  normalizeDiscordMemberGiftChannels,
  type DiscordGuildMemberSummary
} from '../../features/discord/discordMemberCacheStorage';

interface DiscordBotInviteDialogPayload {
  userId: string;
  userName?: string;
  inviteUrl?: string;
  onGuildSelected?: (selection: DiscordGuildSelection) => void;
}

const DEFAULT_INVITE_URL =
  'https://discord.com/oauth2/authorize?client_id=1421371141666377839&permissions=805317648&redirect_uri=https%3A%2F%2Fstg.shimmy3.com%2Fapi%2Fauth%2Fdiscord%2Fcallback&integration_type=0&scope=bot';

interface DiscordMembersResponse {
  ok: boolean;
  members?: DiscordGuildMemberSummary[];
  error?: string;
}

interface DiscordGiftChannelsResponse {
  ok: boolean;
  channels?: unknown;
  error?: string;
}

function getGuildIconUrl(guild: DiscordGuildSummary): string | undefined {
  if (!guild.icon) {
    return undefined;
  }
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`;
}

export function DiscordBotInviteDialog({
  payload,
  close,
  push
}: ModalComponentProps<DiscordBotInviteDialogPayload>): JSX.Element {
  const userId = payload?.userId;
  const inviteUrl = payload?.inviteUrl ?? DEFAULT_INVITE_URL;
  const { data, isLoading, isError, refetch, isFetching } = useDiscordOwnedGuilds(userId);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [submitStage, setSubmitStage] = useState<'idle' | 'members' | 'channels'>('idle');
  const isSaving = submitStage !== 'idle';
  const [storedSelection, setStoredSelection] = useState<DiscordGuildSelection | null>(null);

  const guilds = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    const stored = loadDiscordGuildSelection(userId);
    if (stored?.guildId) {
      setSelectedGuildId(stored.guildId);
      setStoredSelection(stored);
    }
  }, [userId]);

  useEffect(() => {
    if (!selectedGuildId || isLoading || isFetching) {
      return;
    }
    const selectedGuild = guilds.find((guild) => guild.id === selectedGuildId);
    if (!selectedGuild || !selectedGuild.botJoined) {
      setSelectedGuildId(null);
    }
  }, [guilds, isFetching, isLoading, selectedGuildId]);

  const openCategorySetupDialog = (selection: DiscordGuildSelection) => {
    if (!userId) {
      return;
    }
    if (selection.privateChannelCategory?.id) {
      return;
    }

    push(DiscordPrivateChannelCategoryDialog, {
      title: 'お渡しカテゴリの選択',
      size: 'lg',
      payload: {
        guildId: selection.guildId,
        discordUserId: userId,
        initialCategory: selection.privateChannelCategory ?? null,
        onCategorySelected: (category) => {
          payload?.onGuildSelected?.({ ...selection, privateChannelCategory: category });
        }
      }
    });
  };

  const handleSelect = (guild: DiscordGuildSummary) => {
    if (!guild.botJoined) {
      return;
    }
    setSelectedGuildId(guild.id);
  };

  const handleSubmit = async () => {
    if (!userId || !selectedGuildId) {
      return;
    }

    const guild = guilds.find((item) => item.id === selectedGuildId);
    if (!guild || !guild.botJoined) {
      return;
    }

    setSubmitStage('members');

    try {
      const storedSelection = loadDiscordGuildSelection(userId);
      const preservedCategory =
        storedSelection && storedSelection.guildId === guild.id
          ? storedSelection.privateChannelCategory ?? null
          : null;
      let memberCacheUpdatedAt: string | null | undefined =
        storedSelection && storedSelection.guildId === guild.id
          ? storedSelection.memberCacheUpdatedAt ?? null
          : null;

      try {
        const params = new URLSearchParams({ guild_id: guild.id, limit: '1000' });
        const response = await fetch(`/api/discord/members?${params.toString()}`, {
          headers: {
            Accept: 'application/json'
          },
          credentials: 'include'
        });

        const payload = (await response.json().catch(() => null)) as DiscordMembersResponse | null;

        if (response.ok && payload?.ok && Array.isArray(payload.members)) {
          const savedEntry = saveDiscordMemberCache(userId, guild.id, payload.members);
          if (savedEntry) {
            memberCacheUpdatedAt = savedEntry.updatedAt;
          } else {
            console.warn('Discord member cache could not be persisted after guild selection.');
          }
        } else {
          const message = payload?.error || `Discordメンバー一覧の取得に失敗しました (${response.status})`;
          console.warn('Failed to refresh Discord member cache after guild selection:', message);
        }
      } catch (error) {
        console.warn('Unexpected error while refreshing Discord member cache after guild selection', error);
      }

      setSubmitStage('channels');

      try {
        const channelParams = new URLSearchParams({ guild_id: guild.id });
        const response = await fetch(`/api/discord/list-gift-channels?${channelParams.toString()}`, {
          headers: {
            Accept: 'application/json'
          },
          credentials: 'include'
        });

        const payload = (await response.json().catch(() => null)) as DiscordGiftChannelsResponse | null;

        if (response.ok && payload?.ok) {
          const normalizedChannels = normalizeDiscordMemberGiftChannels(payload.channels);
          mergeDiscordMemberGiftChannels(userId, guild.id, normalizedChannels);
        } else {
          const message = payload?.error || `お渡しチャンネル一覧の取得に失敗しました (${response.status})`;
          console.warn('Failed to refresh Discord gift channel cache after guild selection:', message);
        }
      } catch (error) {
        console.warn('Unexpected error while refreshing Discord gift channel cache after guild selection', error);
      }

      const selection: DiscordGuildSelection = {
        guildId: guild.id,
        guildName: guild.name,
        guildIcon: guild.icon,
        selectedAt: new Date().toISOString(),
        privateChannelCategory: preservedCategory,
        memberCacheUpdatedAt
      };

      saveDiscordGuildSelection(userId, selection);
      setStoredSelection(selection);
      payload?.onGuildSelected?.(selection);
      openCategorySetupDialog(selection);
      close();
    } finally {
      setSubmitStage('idle');
    }
  };

  return (
    <>
      <ModalBody className="space-y-6">
        <section className="space-y-4 rounded-2xl border border-border/70 bg-surface/20 p-4 text-sm leading-relaxed text-muted-foreground">
          <header className="space-y-2 text-surface-foreground">
            <h2 className="text-base font-semibold">Discord Botの招待が必要です</h2>
            <p>
              お渡し鯖に共有リンクを送信するには、下記のボタンからShimmy3 Discord Botをギルドへ招待してください。
            </p>
          </header>
          <div>
            <a
              href={inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-discord-primary/50 bg-discord-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-discord-hover"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
              Botを招待する
            </a>
            <p className="mt-3 text-xs text-muted-foreground">
              招待先のギルドを選択し、権限を確認して承認してください。完了後、下の「ギルド一覧を再取得」から反映を確認できます。
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-surface-foreground">共有先のギルドを選択</h3>
              <p className="text-xs text-muted-foreground">
                Botを招待したギルドを選択すると、この端末に保存され今後の共有で利用されます。
              </p>
            </div>
            <div className="flex items-center gap-3">
              {isFetching ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ギルド情報を取得中です…
                </span>
              ) : null}
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-panel px-3 py-1.5 text-xs font-medium text-surface-foreground transition hover:bg-surface/60"
                onClick={() => {
                  void refetch();
                }}
                disabled={isFetching}
                aria-busy={isFetching}
              >
                <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
                ギルド一覧を再取得
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <GuildPlaceholder />
              <GuildPlaceholder />
              <GuildPlaceholder />
            </div>
          ) : null}

          {!isLoading && isError ? (
            <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              ギルド一覧の取得に失敗しました。Botの招待状況を確認し、数秒後に再取得をお試しください。
            </div>
          ) : null}

          {!isLoading && !isError && guilds.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-surface/30 px-4 py-3 text-sm text-muted-foreground">
              オーナー権限を持つギルドが見つかりませんでした。Botを招待した後に再取得してください。
            </div>
          ) : null}

          {!isLoading && !isError && guilds.length > 0 ? (
            <ul className="space-y-3">
              {guilds.map((guild) => {
                const isSelected = guild.id === selectedGuildId;
                const iconUrl = getGuildIconUrl(guild);
                const isDisabled = !guild.botJoined;
                const isStoredSelection = storedSelection?.guildId === guild.id;
                const categoryLabel = isStoredSelection
                  ? storedSelection?.privateChannelCategory?.name
                    ? `お渡しカテゴリ：${storedSelection.privateChannelCategory.name}`
                    : 'お渡しカテゴリ：未設定'
                  : 'お渡しカテゴリ：未設定';
                return (
                  <li key={guild.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(guild)}
                      className={`relative flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ${
                        isDisabled
                          ? 'cursor-not-allowed border-border/60 bg-surface/20 text-muted-foreground/90 opacity-60'
                          : 'border-border/70 bg-surface/40 hover:border-accent/50 hover:bg-surface/60'
                      }`}
                      aria-pressed={isSelected}
                      disabled={isDisabled}
                    >
                      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface">
                        {iconUrl ? (
                          <img src={iconUrl} alt="Guild icon" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-base font-semibold text-muted-foreground">{guild.name.slice(0, 2)}</span>
                        )}
                      </span>
                      <div className="flex flex-1 flex-col">
                        <span className="text-sm font-semibold text-surface-foreground">{guild.name}</span>
                        <span className="text-xs text-muted-foreground">{categoryLabel}</span>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <span
                            className={
                              guild.botJoined
                                ? 'inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success'
                                : 'inline-flex items-center rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger'
                            }
                          >
                            {guild.botJoined ? 'Bot参加済み' : 'Bot未参加'}
                          </span>
                          {guild.permissions ? (
                            <span className="inline-flex items-center rounded-full bg-surface/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              権限: {guild.permissions}
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
        </section>
      </ModalBody>

      <ModalFooter>
        {!isSaving ? (
          <button type="button" className="btn btn-muted" onClick={close}>
            キャンセル
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={
            isSaving ||
            !selectedGuildId ||
            !guilds.some((guild) => guild.id === selectedGuildId && guild.botJoined)
          }
          aria-busy={isSaving}
        >
          {isSaving ? (
            <span className="flex items-center gap-2">
              <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
              {submitStage === 'members' ? 'メンバー情報取得中…' : 'チャンネル情報取得中…'}
            </span>
          ) : (
            'このギルドを保存'
          )}
        </button>
      </ModalFooter>
    </>
  );
}

function GuildPlaceholder(): JSX.Element {
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
