import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { useMemo } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

export interface GuideInfoDialogPayload {
  message?: string;
  confirmLabel?: string;
  onConfirm?: () => void;
}

export function GuideInfoDialog({ payload, close }: ModalComponentProps<GuideInfoDialogPayload>): JSX.Element {
  const { message, confirmLabel, onConfirm } = useMemo(() => {
    return {
      message:
        payload?.message ??
        'ガチャ結果は画面上部の「手動入力」ボタンを押してペーストしてください。',
      confirmLabel: payload?.confirmLabel ?? '了解',
      onConfirm: payload?.onConfirm
    };
  }, [payload]);

  return (
    <>
      <ModalBody className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-white/5 bg-surface/40 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          <InformationCircleIcon className="mt-0.5 h-5 w-5 text-accent" aria-hidden="true" />
          <p>{message}</p>
        </div>
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            onConfirm?.();
            close();
          }}
        >
          {confirmLabel}
        </button>
      </ModalFooter>
    </>
  );
}
