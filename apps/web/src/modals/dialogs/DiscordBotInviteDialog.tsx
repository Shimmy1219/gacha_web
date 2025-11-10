import { useEffect, useMemo, useState } from 'react';
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { useDiscordOwnedGuilds, type DiscordGuildSummary } from '../../features/discord/useDiscordOwnedGuilds';
import {
  loadDiscordGuildSelection,
  saveDiscordGuildSelection,
  describeDiscordGuildCapabilityIssue,
  type DiscordGuildCapabilityCheckResult,
  type DiscordGuildSelection
} from '../../features/discord/discordGuildSelectionStorage';

interface DiscordBotInviteDialogPayload {
  userId: string;
  userName?: string;
  inviteUrl?: string;
  onGuildSelected?: (selection: DiscordGuildSelection) => void;
}

const DEFAULT_INVITE_URL =
  'https://discord.com/oauth2/authorize?client_id=1421371141666377839&permissions=805317648&redirect_uri=https%3A%2F%2Fstg.shimmy3.com%2Fapi%2Fauth%2Fdiscord%2Fcallback&integration_type=0&scope=bot';

function getGuildIconUrl(guild: DiscordGuildSummary): string | undefined {
  if (!guild.icon) {
    return undefined;
  }
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`;
}

export function DiscordBotInviteDialog({
  payload,
  close
}: ModalComponentProps<DiscordBotInviteDialogPayload>): JSX.Element {
  const userId = payload?.userId;
  const inviteUrl = payload?.inviteUrl ?? DEFAULT_INVITE_URL;
  const { data, isLoading, isError, refetch, isFetching } = useDiscordOwnedGuilds(userId);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [isCheckingGuild, setIsCheckingGuild] = useState(false);
  const [checkResult, setCheckResult] = useState<DiscordGuildCapabilityCheckResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const guilds = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    const stored = loadDiscordGuildSelection(userId);
    if (stored?.guildId) {
      setSelectedGuildId(stored.guildId);
    }
  }, [userId]);

  useEffect(() => {
    if (selectedGuildId && guilds.every((guild) => guild.id !== selectedGuildId)) {
      setSelectedGuildId(null);
    }
  }, [guilds, selectedGuildId]);

  useEffect(() => {
    setCheckResult(null);
    setCheckError(null);
  }, [selectedGuildId]);

  const handleSelect = (guild: DiscordGuildSummary) => {
    setSelectedGuildId(guild.id);
    setCheckResult(null);
    setCheckError(null);
  };

  const runGuildCapabilityCheck = async (
    guildId: string,
    categoryId: string | null
  ): Promise<DiscordGuildCapabilityCheckResult> => {
    const response = await fetch('/api/discord/guild-check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ guild_id: guildId, category_id: categoryId ?? undefined })
    });

    const payload = (await response.json().catch(() => null)) as
      | (Partial<DiscordGuildCapabilityCheckResult> & {
          ok?: boolean;
          messages?: Partial<DiscordGuildCapabilityCheckResult['messages']>;
        } & { categories?: { id: string; name: string; position: number }[] })
      | { ok?: false; error?: string }
      | null;

    if (!response.ok || !payload || payload.ok === false) {
      const message = payload && 'error' in payload && payload.error ? payload.error : null;
      throw new Error(message || `Discordギルドの権限チェックに失敗しました (${response.status})`);
    }

    const messages = {
      fetchCategories: payload.messages?.fetchCategories ?? null,
      ensurePrivateChannel: payload.messages?.ensurePrivateChannel ?? null,
      sendMessage: payload.messages?.sendMessage ?? null
    };

    return {
      checkedAt: typeof payload.checkedAt === 'string' ? payload.checkedAt : new Date().toISOString(),
      guildId: typeof payload.guildId === 'string' ? payload.guildId : guildId,
      categoryId:
        typeof payload.categoryId === 'string'
          ? payload.categoryId
          : categoryId ?? null,
      canFetchCategories: Boolean(payload.canFetchCategories),
      canEnsurePrivateChannel: Boolean(payload.canEnsurePrivateChannel),
      canSendMessage: Boolean(payload.canSendMessage),
      messages
    };
  };

  const handleSubmit = async () => {
    if (!userId || !selectedGuildId) {
      return;
    }

    const guild = guilds.find((item) => item.id === selectedGuildId);
    if (!guild) {
      return;
    }

    const storedSelection = loadDiscordGuildSelection(userId);
    const preservedCategory =
      storedSelection && storedSelection.guildId === guild.id
        ? storedSelection.privateChannelCategory ?? null
        : null;

    setIsCheckingGuild(true);
    setCheckResult(null);
    setCheckError(null);

    try {
      const capabilityCheck = await runGuildCapabilityCheck(
        guild.id,
        preservedCategory?.id ?? null
      );
      setCheckResult(capabilityCheck);

      if (
        !capabilityCheck.canFetchCategories ||
        !capabilityCheck.canEnsurePrivateChannel ||
        !capabilityCheck.canSendMessage
      ) {
        const issueMessage = describeDiscordGuildCapabilityIssue({
          guildId: guild.id,
          guildName: guild.name,
          guildIcon: guild.icon,
          selectedAt: new Date().toISOString(),
          privateChannelCategory: preservedCategory,
          capabilityCheck
        });
        setCheckError(
          issueMessage ??
            'Discord Botの権限確認で問題が見つかりました。Botの招待状況と権限を確認してください。'
        );
        return;
      }

      const selection: DiscordGuildSelection = {
        guildId: guild.id,
        guildName: guild.name,
        guildIcon: guild.icon,
        selectedAt: new Date().toISOString(),
        privateChannelCategory: preservedCategory,
        capabilityCheck
      };
      saveDiscordGuildSelection(userId, selection);
      payload?.onGuildSelected?.(selection);
      close();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Discordギルドの権限チェックに失敗しました。';
      setCheckError(message);
    } finally {
      setIsCheckingGuild(false);
    }
  };

  const capabilityStatuses = useMemo(() => {
    if (!checkResult) {
      return [] as {
        key: string;
        label: string;
        ok: boolean;
        message: string | null;
      }[];
    }
    return [
      {
        key: 'fetch',
        label: 'カテゴリ一覧の取得',
        ok: checkResult.canFetchCategories,
        message: checkResult.messages.fetchCategories
      },
      {
        key: 'channel',
        label: 'お渡しチャンネルの作成権限',
        ok: checkResult.canEnsurePrivateChannel,
        message: checkResult.messages.ensurePrivateChannel
      },
      {
        key: 'send',
        label: 'メッセージ送信権限',
        ok: checkResult.canSendMessage,
        message: checkResult.messages.sendMessage
      }
    ];
  }, [checkResult]);

  const checkedAtDisplay = useMemo(() => {
    if (!checkResult?.checkedAt) {
      return null;
    }
    try {
      return new Date(checkResult.checkedAt).toLocaleString();
    } catch {
      return checkResult.checkedAt;
    }
  }, [checkResult]);

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
                return (
                  <li key={guild.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(guild)}
                      className="flex w-full items-center gap-4 rounded-2xl border border-border/70 bg-surface/40 p-4 text-left transition hover:border-accent/50 hover:bg-surface/60"
                      aria-pressed={isSelected}
                      disabled={isCheckingGuild && isSelected}
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
                        <span className="text-xs text-muted-foreground">ID: {guild.id}</span>
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

          {checkError ? (
            <div className="space-y-2 rounded-2xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
              <div className="flex items-start gap-2">
                <XCircleIcon className="mt-0.5 h-5 w-5" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="font-semibold text-danger">Discord Botの権限チェックに失敗しました</p>
                  <p className="text-xs text-danger/90 whitespace-pre-line">{checkError}</p>
                </div>
              </div>
              <div className="text-xs text-danger/80">
                Botを再招待する場合は{' '}
                <a
                  href={inviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold underline"
                >
                  招待リンクを開く
                  <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
                {' '}か、Discord上で権限を付与した後に再度チェックを実行してください。
              </div>
            </div>
          ) : null}

          {checkResult ? (
            <section className="space-y-3 rounded-2xl border border-border/70 bg-surface/30 p-4 text-sm">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <h3 className="text-sm font-semibold text-surface-foreground">Bot権限チェックの結果</h3>
                {checkedAtDisplay ? (
                  <span className="text-xs text-muted-foreground">確認日時: {checkedAtDisplay}</span>
                ) : null}
              </div>
              <ul className="space-y-2">
                {capabilityStatuses.map((status) => (
                  <li key={status.key} className="flex items-start gap-3">
                    {status.ok ? (
                      <CheckCircleIcon className="mt-0.5 h-5 w-5 text-emerald-500" aria-hidden="true" />
                    ) : (
                      <XCircleIcon className="mt-0.5 h-5 w-5 text-rose-400" aria-hidden="true" />
                    )}
                    <div className="space-y-1">
                      <p className="font-medium text-surface-foreground">{status.label}</p>
                      {status.message ? (
                        <p className="text-xs text-muted-foreground whitespace-pre-line">{status.message}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      </ModalBody>

      <ModalFooter>
        <button type="button" className="btn btn-muted" onClick={close}>
          キャンセル
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={
            !selectedGuildId ||
            !guilds.some((guild) => guild.id === selectedGuildId) ||
            isCheckingGuild
          }
        >
          {isCheckingGuild ? '権限を確認中…' : 'このギルドを保存'}
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
