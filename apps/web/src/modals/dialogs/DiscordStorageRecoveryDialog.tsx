import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

export interface DiscordStorageRecoveryDialogPayload {
  onRetry?: () => void;
}

export function DiscordStorageRecoveryDialog({
  payload,
  close
}: ModalComponentProps<DiscordStorageRecoveryDialogPayload>): JSX.Element {
  const handleRetry = () => {
    payload?.onRetry?.();
    close();
  };

  return (
    <>
      <ModalBody className="space-y-4 text-sm leading-relaxed">
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-700">
          <p className="font-semibold">Discord連携情報を再取得してください</p>
          <p className="mt-2">
            保存データの復号に失敗したため、安全のため削除しました。お渡し鯖の情報を再取得します。
          </p>
        </div>
      </ModalBody>
      <ModalFooter className="justify-end">
        <button type="button" className="btn btn-ghost" onClick={close}>
          閉じる
        </button>
        <button type="button" className="btn btn-primary" onClick={handleRetry}>
          再取得する
        </button>
      </ModalFooter>
    </>
  );
}
