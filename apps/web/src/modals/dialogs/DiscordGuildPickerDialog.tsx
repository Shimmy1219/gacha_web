import { useEffect, useMemo, useState } from 'react';
import { ArrowPathIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { useDiscordOwnedGuilds, type DiscordGuildSummary } from '../../features/discord/useDiscordOwnedGuilds';
import {
  loadDiscordGuildSelection,
  saveDiscordGuildSelection,
  type DiscordGuildSelection,
} from '../../features/discord/discordGuildSelectionStorage';

interface DiscordGuildPickerPayload {
  userId: string;
  userName?: string;
  onGuildSelected?: (selection: DiscordGuildSelection) => void;
}

function getGuildIconUrl(guild: DiscordGuildSummary): string | undefined {
  if (!guild.icon) {
    return undefined;
  }
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`;
}

export function DiscordGuildPickerDialog({ payload, close }: ModalComponentProps<DiscordGuildPickerPayload>): JSX.Element {
  const userId = payload?.userId;
  const { data, isLoading, isError, refetch, isFetching } = useDiscordOwnedGuilds(userId);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);

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

  const handleSelect = (guild: DiscordGuildSummary) => {
    setSelectedGuildId(guild.id);
  };

  const handleSubmit = () => {
    if (!userId || !selectedGuildId) {
      return;
    }

    const guild = guilds.find((item) => item.id === selectedGuildId);
    if (!guild) {
      return;
    }

    const selection: DiscordGuildSelection = {
      guildId: guild.id,
      guildName: guild.name,
      guildIcon: guild.icon,
      selectedAt: new Date().toISOString(),
    };
    saveDiscordGuildSelection(userId, selection);
    payload?.onGuildSelected?.(selection);
    close();
  };

  return (
    <>
      <ModalBody className="space-y-6">
        <section className="rounded-2xl border border-border/70 bg-surface/20 p-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            Discordでログインいただきありがとうございます。以下の一覧から、お渡し鯖（特典鯖・ファン鯖）としてZIPを送信するギルドを選択してください。
          </p>
          <p className="mt-2">
            選択内容はこの端末のローカルストレージに保存され、次回以降の共有設定に利用されます。
          </p>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h3 className="text-sm font-semibold text-surface-foreground">オーナーのギルド一覧</h3>
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
                再取得
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
              ギルド一覧の取得に失敗しました。数秒後に再取得をお試しください。
            </div>
          ) : null}

          {!isLoading && !isError && guilds.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-surface/30 px-4 py-3 text-sm text-muted-foreground">
              オーナー権限を持つギルドが見つかりませんでした。Discord上でギルドを作成してから再度お試しください。
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
          disabled={!selectedGuildId || !guilds.some((guild) => guild.id === selectedGuildId)}
        >
          このギルドを選択
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
