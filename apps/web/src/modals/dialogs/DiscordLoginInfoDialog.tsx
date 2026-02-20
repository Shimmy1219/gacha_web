import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

export function DiscordLoginInfoDialog({ close }: ModalComponentProps): JSX.Element {
  return (
    <>
      <ModalBody className="login-info-dialog__body space-y-4">
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
            <li className="login-info-dialog__feature-item">・ガチャ機能の全て</li>
            <li className="login-info-dialog__feature-item">
              ・ユーザーごとに景品をまとめ、zipファイルを作成し、端末に保存
            </li>
            <li className="login-info-dialog__feature-item">・作成したzipファイルをアップロードし、URLを発行</li>
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
