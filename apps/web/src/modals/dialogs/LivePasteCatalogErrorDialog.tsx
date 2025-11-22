import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

export interface LivePasteCatalogErrorDialogPayload {
  detail?: string;
  onAcknowledge?: () => void;
}

export function LivePasteCatalogErrorDialog({
  payload,
  close
}: ModalComponentProps<LivePasteCatalogErrorDialogPayload>): JSX.Element {
  const detail = payload?.detail;
  const acknowledge = payload?.onAcknowledge;

  return (
    <>
      <ModalBody className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm leading-relaxed text-red-100">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 text-red-400" aria-hidden="true" />
          <div className="space-y-2">
            <p>貼り付け結果の内容が登録済みのガチャカタログと一致しませんでした。</p>
            <p className="text-xs text-red-200/90">
              外部ガチャサイトで最新のTXTを保存して「ガチャ登録」から読み込ませてください。
            </p>
            {detail ? <p className="text-xs text-red-200/70">{detail}</p> : null}
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            acknowledge?.();
            close();
          }}
        >
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
