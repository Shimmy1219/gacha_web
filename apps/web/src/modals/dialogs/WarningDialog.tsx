import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useMemo } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

export interface WarningDialogPayload {
  message?: string;
  confirmLabel?: string;
  onConfirm?: () => void;
}

export function WarningDialog({ payload, close }: ModalComponentProps<WarningDialogPayload>): JSX.Element {
  const { message, confirmLabel, onConfirm } = useMemo(() => {
    return {
      message: payload?.message ?? '警告内容を確認してください。',
      confirmLabel: payload?.confirmLabel ?? '閉じる',
      onConfirm: payload?.onConfirm
    };
  }, [payload]);

  return (
    <>
      <ModalBody className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-700">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 text-amber-500" aria-hidden="true" />
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
