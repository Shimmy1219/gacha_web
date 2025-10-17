import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

import { ModalBody, ModalFooter, type ModalComponentProps } from '../../../components/modal';

export interface GachaDeleteConfirmDialogPayload {
  gachaId: string;
  gachaName: string;
  onConfirm?: (gachaId: string) => void;
}

export function GachaDeleteConfirmDialog({ payload, close }: ModalComponentProps<GachaDeleteConfirmDialogPayload>): JSX.Element {
  const handleConfirm = () => {
    payload?.onConfirm?.(payload.gachaId);
    close();
  };

  return (
    <>
      <ModalBody className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm leading-relaxed text-red-200">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5" aria-hidden="true" />
          <div className="space-y-2">
            <p>
              以下のガチャを削除します：
              <span className="ml-2 inline-flex items-center rounded-full border border-red-500/50 bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-100">
                {payload.gachaName}
              </span>
            </p>
            <p className="text-xs text-red-200/90">
              ガチャに紐づくユーザー集計も削除され、復元できません。必要であれば保存オプションからZIPを出力しておいてください。
            </p>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-muted" onClick={close}>
          キャンセル
        </button>
        <button type="button" className="btn btn-primary" onClick={handleConfirm}>
          削除する
        </button>
      </ModalFooter>
    </>
  );
}
