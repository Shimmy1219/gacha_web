import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

export interface RarityRateErrorDialogPayload {
  detail?: string;
}

export function RarityRateErrorDialog({
  payload,
  close
}: ModalComponentProps<RarityRateErrorDialogPayload>): JSX.Element {
  const detail = payload?.detail;

  return (
    <>
      <ModalBody className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm leading-relaxed text-red-100">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 text-red-400" aria-hidden="true" />
          <div className="space-y-2">
            <p>排出率の合計が100%を超えています。</p>
            <p className="text-xs text-red-200/90">入力内容を元に戻しました。排出率を調整してから再度入力してください。</p>
            {detail ? <p className="text-xs text-red-200/70">{detail}</p> : null}
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-primary" onClick={close}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
