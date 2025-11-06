import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

export interface GachaDeleteConfirmDialogPayload {
  gachaId: string;
  gachaName: string;
  mode?: 'archive' | 'delete';
  onConfirm?: (gachaId: string) => void;
}

export function GachaDeleteConfirmDialog({ payload, close }: ModalComponentProps<GachaDeleteConfirmDialogPayload>): JSX.Element {
  const handleConfirm = () => {
    payload?.onConfirm?.(payload.gachaId);
    close();
  };

  const mode = payload?.mode ?? 'archive';
  const isDelete = mode === 'delete';

  return (
    <>
      <ModalBody className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm leading-relaxed text-black dark:text-white">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5" aria-hidden="true" />
          <div className="space-y-2">
            <p>
              {isDelete ? '以下のガチャを完全に削除します：' : '以下のガチャをアーカイブします：'}
              <span className="ml-2 inline-flex items-center rounded-full border border-red-500/50 bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-100">
                {payload.gachaName}
              </span>
            </p>
            {isDelete ? (
              <>
                <p className="text-xs text-black/70 dark:text-white/80">この操作は取り消せません。関連するアイテム、レアリティ、リアグ、ポイント設定、履歴やユーザーの獲得情報もまとめて削除されます。</p>
                <p className="text-xs text-black/70 dark:text-white/80">必要であれば削除前にバックアップを取得してください。</p>
              </>
            ) : (
              <>
                <p className="text-xs text-black/70 dark:text-white/80">アーカイブすると、このガチャはガチャ管理画面やユーザーごとの獲得内訳には表示されなくなります。</p>
                <p className="text-xs text-black/70 dark:text-white/80">サイト設定の「登録済みのガチャ」から再表示したり、完全に削除したりできます。</p>
              </>
            )}
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-muted" onClick={close}>
          キャンセル
        </button>
        <button type="button" className="btn btn-primary" onClick={handleConfirm}>
          {isDelete ? '削除する' : 'アーカイブする'}
        </button>
      </ModalFooter>
    </>
  );
}
