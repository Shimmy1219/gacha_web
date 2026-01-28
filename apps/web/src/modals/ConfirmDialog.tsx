import { ModalBody, ModalFooter } from './ModalComponents';
import { type ModalComponentProps } from './ModalTypes';

interface ConfirmDialogPayload {
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export function ConfirmDialog({ payload, close }: ModalComponentProps<ConfirmDialogPayload>): JSX.Element {
  const {
    message,
    confirmLabel = '確定',
    cancelLabel = 'キャンセル',
    onConfirm,
    onCancel
  } = payload ?? {};

  return (
    <>
      <ModalBody>
        {message ? <p className="text-sm leading-relaxed text-muted-foreground">{message}</p> : null}
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          className="btn btn-muted"
          onClick={() => {
            onCancel?.();
            close();
          }}
        >
          {cancelLabel}
        </button>
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
