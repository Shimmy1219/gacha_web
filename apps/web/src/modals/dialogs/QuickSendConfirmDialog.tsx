import { useState } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

export interface QuickSendConfirmDialogPayload {
  onConfirm?: (result: { sendNewOnly: boolean; rememberChoice: boolean }) => void;
}

export function QuickSendConfirmDialog({
  payload,
  close
}: ModalComponentProps<QuickSendConfirmDialogPayload>): JSX.Element {
  const [rememberChoice, setRememberChoice] = useState(false);

  const handleConfirm = (sendNewOnly: boolean) => {
    payload?.onConfirm?.({ sendNewOnly, rememberChoice });
    close();
  };

  return (
    <>
      <ModalBody>
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Newタグが付いたものだけを送りますか？
          </p>
          <p className="text-xs text-muted-foreground">
            ※過去に引いた未送信分は今回の送信対象に含まれません。
          </p>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border/60 text-accent focus-visible:ring-2 focus-visible:ring-accent/60"
              checked={rememberChoice}
              onChange={(event) => setRememberChoice(event.currentTarget.checked)}
            />
            <span>今後は表示しない</span>
          </label>
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-muted" onClick={close}>
          キャンセル
        </button>
        <button type="button" className="btn btn-muted" onClick={() => handleConfirm(false)}>
          いいえ
        </button>
        <button type="button" className="btn btn-primary" onClick={() => handleConfirm(true)}>
          はい
        </button>
      </ModalFooter>
    </>
  );
}
