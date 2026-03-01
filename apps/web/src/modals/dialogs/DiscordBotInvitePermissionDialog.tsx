import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { useMemo } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import {
  DISCORD_BOT_INVITE_ADMIN_URL,
  DISCORD_BOT_INVITE_URL
} from '../../features/discord/discordInviteConfig';
import { resolveSafeUrl } from '../../utils/safeUrl';

interface DiscordBotInvitePermissionDialogPayload {
  standardInviteUrl?: string;
  adminInviteUrl?: string;
}

export function DiscordBotInvitePermissionDialog({
  payload,
  close
}: ModalComponentProps<DiscordBotInvitePermissionDialogPayload>): JSX.Element {
  const standardInviteUrl = payload?.standardInviteUrl ?? DISCORD_BOT_INVITE_URL;
  const adminInviteUrl = payload?.adminInviteUrl ?? DISCORD_BOT_INVITE_ADMIN_URL;

  const safeStandardInviteUrl = useMemo(
    () => resolveSafeUrl(standardInviteUrl, { allowedProtocols: ['https:'] }),
    [standardInviteUrl]
  );
  const safeAdminInviteUrl = useMemo(
    () => resolveSafeUrl(adminInviteUrl, { allowedProtocols: ['https:'] }),
    [adminInviteUrl]
  );

  return (
    <>
      <ModalBody className="space-y-4">
        <section
          id="discord-bot-invite-permission-dialog"
          className="discord-bot-invite-permission-dialog__section space-y-4"
        >
          <div className="discord-bot-invite-permission-dialog__intro rounded-2xl border border-border/70 bg-surface/20 p-4 text-sm leading-relaxed text-muted-foreground">
            <p className="discord-bot-invite-permission-dialog__intro-text text-surface-foreground">
              Botの招待時に、付与する権限レベルを選択してください。
            </p>
            <p className="discord-bot-invite-permission-dialog__legacy-note mt-2 text-xs text-muted-foreground">
              過去に作成したお渡しチャンネルを活用したい方は「管理者権限のbot」を招待してください。
            </p>
          </div>

          <div className="discord-bot-invite-permission-dialog__options grid gap-3 md:grid-cols-2">
            <article className="discord-bot-invite-permission-dialog__option-card rounded-2xl border border-border/70 bg-surface/30 p-4">
              <h3 className="discord-bot-invite-permission-dialog__option-title text-sm font-semibold text-surface-foreground">
                通常の権限のbotを招待
              </h3>
              <p className="discord-bot-invite-permission-dialog__option-description mt-2 text-xs leading-relaxed text-muted-foreground">
                必要な範囲の権限で運用できます。既存チャンネルの権限状態によっては、手動調整が必要になる場合があります。
              </p>
              {safeStandardInviteUrl ? (
                <a
                  id="discord-bot-invite-standard-action"
                  href={safeStandardInviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="discord-bot-invite-permission-dialog__action-button mt-3 inline-flex items-center gap-2 rounded-full border border-discord-primary/40 bg-panel px-4 py-2 text-xs font-semibold text-surface-foreground transition hover:bg-surface/60"
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
                  通常権限で招待
                </a>
              ) : (
                <span
                  className="discord-bot-invite-permission-dialog__action-button mt-3 inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/40 px-4 py-2 text-xs font-semibold text-muted-foreground"
                  aria-disabled="true"
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
                  通常権限で招待
                </span>
              )}
            </article>

            <article className="discord-bot-invite-permission-dialog__option-card discord-bot-invite-permission-dialog__option-card--recommended rounded-2xl border border-discord-primary/45 bg-discord-primary/10 p-4">
              <h3 className="discord-bot-invite-permission-dialog__option-title text-sm font-semibold text-surface-foreground">
                管理者権限のbotを招待
              </h3>
              <p className="discord-bot-invite-permission-dialog__option-description mt-2 text-xs leading-relaxed text-muted-foreground">
                既存のお渡しチャンネルをBotが認識・修復しやすくなり、権限不足による共有失敗を減らせます。
              </p>
              {safeAdminInviteUrl ? (
                <a
                  id="discord-bot-invite-admin-action"
                  href={safeAdminInviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="discord-bot-invite-permission-dialog__action-button mt-3 inline-flex items-center gap-2 rounded-full border border-discord-primary/50 bg-discord-primary px-4 py-2 text-xs font-semibold text-white transition hover:bg-discord-hover"
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
                  管理者権限で招待
                </a>
              ) : (
                <span
                  className="discord-bot-invite-permission-dialog__action-button mt-3 inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/40 px-4 py-2 text-xs font-semibold text-muted-foreground"
                  aria-disabled="true"
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
                  管理者権限で招待
                </span>
              )}
            </article>
          </div>
        </section>
      </ModalBody>

      <ModalFooter>
        <button
          type="button"
          id="discord-bot-invite-permission-close-button"
          className="discord-bot-invite-permission-dialog__close-button btn btn-muted"
          onClick={close}
        >
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
