import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

import { ModalBody, ModalFooter, type ModalComponentProps } from '../../../components/modal';

export interface ItemDeleteConfirmDialogPayload {
  itemId: string;
  itemName: string;
  gachaName?: string;
  hasUserReferences?: boolean;
  winnerNames?: string[];
  onConfirm?: (itemId: string) => void;
}

export function ItemDeleteConfirmDialog({ payload, close }: ModalComponentProps<ItemDeleteConfirmDialogPayload>): JSX.Element {
  const winnerNames = (payload?.winnerNames ?? []).map((name) => name.trim()).filter((name) => name.length > 0);

  const referenceWarning = (() => {
    if (winnerNames.length === 1) {
      return `${winnerNames[0]}がこのアイテムを獲得していますが、削除しますか？`;
    }
    if (winnerNames.length === 2) {
      return `${winnerNames[0]}と${winnerNames[1]}がこのアイテムを獲得していますが、削除しますか？`;
    }
    if (winnerNames.length >= 3) {
      return `${winnerNames[0]}と${winnerNames[1]}ほか${winnerNames.length - 2}名がこのアイテムを獲得していますが、削除しますか？`;
    }
    if (payload?.hasUserReferences) {
      return 'このアイテムを獲得したユーザーがいます。削除するとユーザーの獲得履歴からも取り除かれます。本当に削除しますか？';
    }
    return null;
  })();

  const handleConfirm = () => {
    payload?.onConfirm?.(payload.itemId);
    close();
  };

  return (
    <>
      <ModalBody className="space-y-4">
        <div className="rounded-2xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm leading-relaxed text-red-100">
          <div className="flex items-center gap-2 font-semibold">
            <ExclamationTriangleIcon className="h-5 w-5" aria-hidden="true" />
            アイテムを削除します
          </div>
          <p className="mt-2 text-sm">
            対象：
            <span className="ml-2 inline-flex items-center rounded-full border border-red-400/60 bg-red-500/20 px-2 py-0.5 text-xs font-semibold">
              {payload.itemName}
            </span>
            {payload.gachaName ? (
              <span className="ml-2 text-xs text-red-200/90">({payload.gachaName})</span>
            ) : null}
          </p>
          {referenceWarning ? (
            <p className="mt-3 rounded-xl border border-red-400/60 bg-red-500/25 px-3 py-2 text-xs text-red-100">
              {referenceWarning}
            </p>
          ) : null}
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
