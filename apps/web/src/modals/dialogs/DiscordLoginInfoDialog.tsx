import { InformationCircleIcon } from '@heroicons/react/24/outline';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

export function DiscordLoginInfoDialog({ close }: ModalComponentProps): JSX.Element {
  return (
    <>
      <ModalBody className="login-info-dialog__body space-y-4">
        <div className="login-info-dialog__lead flex items-start gap-3 rounded-2xl border border-white/5 bg-surface/40 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          <InformationCircleIcon className="login-info-dialog__lead-icon mt-0.5 h-5 w-5 text-accent" aria-hidden="true" />
          <p className="login-info-dialog__lead-text">
            Discordログインの必要性と、ログインで使える機能をまとめています。
          </p>
        </div>

        <section className="login-info-dialog__section space-y-2 rounded-2xl border border-border/60 bg-panel/40 p-4 text-left">
          <h3 className="login-info-dialog__section-title text-base font-semibold text-surface-foreground">
            ログインは必要？
          </h3>
          <p className="login-info-dialog__section-description text-sm leading-relaxed text-muted-foreground">
            ログインは必須ではありません。自分の特典鯖に景品を自動で送らない方、端末間でデータ移行する予定が無い方はログインしなくても使うことが出来ます。
          </p>
          <p className="login-info-dialog__section-description text-sm leading-relaxed text-muted-foreground">
            またログインしなくても以下のことが可能です。
          </p>
          <ul className="login-info-dialog__feature-list space-y-1 text-sm leading-relaxed text-muted-foreground">
            <li className="login-info-dialog__feature-item">
              ・基本的なガチャ機能zipファイルを作成したり、URLを発行したりすることが出来ます。
            </li>
          </ul>
        </section>

        <section className="login-info-dialog__section space-y-2 rounded-2xl border border-border/60 bg-panel/40 p-4 text-left">
          <h3 className="login-info-dialog__section-title text-base font-semibold text-surface-foreground">
            ログインのメリット
          </h3>
          <p className="login-info-dialog__section-description text-sm leading-relaxed text-muted-foreground">
            ログインをすると以下のことが可能になります。
          </p>
          <ul className="login-info-dialog__feature-list space-y-1 text-sm leading-relaxed text-muted-foreground">
            <li className="login-info-dialog__feature-item">・特典鯖に景品を自動で送信</li>
            <li className="login-info-dialog__feature-item">・端末引継ぎの際のデータ移行</li>
          </ul>
        </section>
      </ModalBody>
      <ModalFooter>
        <button type="button" className="login-info-dialog__close-button btn btn-primary" onClick={close}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
