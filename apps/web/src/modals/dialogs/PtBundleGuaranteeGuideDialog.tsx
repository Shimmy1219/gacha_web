import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

export interface PtBundleGuaranteeGuideDialogPayload {
  confirmLabel?: string;
}

export function PtBundleGuaranteeGuideDialog({
  payload,
  close
}: ModalComponentProps<PtBundleGuaranteeGuideDialogPayload>): JSX.Element {
  const confirmLabel = payload?.confirmLabel ?? '閉じる';

  return (
    <>
      <ModalBody className="pt-bundle-guide-dialog__body space-y-4">
        <div className="pt-bundle-guide-dialog__section space-y-2 rounded-2xl border border-border/60 bg-surface/40 px-4 py-3">
          <h3 className="pt-bundle-guide-dialog__section-title text-sm font-semibold text-surface-foreground">
            お得バンドル とは
          </h3>
          <p className="pt-bundle-guide-dialog__section-text text-sm leading-relaxed text-muted-foreground">
            お得バンドルは「n ptでm連」をまとめて設定できる任意機能です。例えば、1回10ptでガチャを回せるとしたら、100ptで11連引けるようにするような高ptで引くと少し多く引けるようになるのが「お得バンドル」です。これは複数登録出来ます。
          </p>
        </div>
        <div className="pt-bundle-guide-dialog__section space-y-2 rounded-2xl border border-border/60 bg-surface/40 px-4 py-3">
          <h3 className="pt-bundle-guide-dialog__section-title text-sm font-semibold text-surface-foreground">
            天井保証 とは
          </h3>
          <p className="pt-bundle-guide-dialog__section-text text-sm leading-relaxed text-muted-foreground">
            ユーザーが高ptでガチャを引いた時に、レア度の高いアイテムが出ないのはかわいそうなので、せめて１つでも保証してあげようというお情け機能です。ソシャゲにある「10連でSR確定！」のようなニュアンスです。これも複数登録出来ます。
          </p>
        </div>
      </ModalBody>
      <ModalFooter className="pt-bundle-guide-dialog__footer">
        <button
          type="button"
          id="pt-bundle-guide-dialog-close-button"
          className="pt-bundle-guide-dialog__close-button btn btn-primary"
          onClick={close}
        >
          {confirmLabel}
        </button>
      </ModalFooter>
    </>
  );
}
