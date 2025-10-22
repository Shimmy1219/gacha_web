import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

export interface RiaguDisableConfirmDialogPayload {
  itemName: string;
  assignmentCount?: number;
  onConfirm?: () => void;
}

export function RiaguDisableConfirmDialog({
  payload,
  close
}: ModalComponentProps<RiaguDisableConfirmDialogPayload>): JSX.Element {
  const itemName = payload?.itemName ?? '対象アイテム';
  const assignmentCount = payload?.assignmentCount ?? 0;
  const hasAssignments = assignmentCount > 0;

  const message = hasAssignments
    ? `既に${assignmentCount}人が「${itemName}」をリアグとして当てています。リアグ設定を解除するとリアグ当選者の表示からも除外されます。`
    : `「${itemName}」にはリアグカードが設定されています。リアグ設定を解除するとリアグセクションから非表示になります。`;

  return (
    <>
      <ModalBody className="space-y-3">
        <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          解除後に再びリアグとして設定する場合は、景品設定モーダルから再度有効化してください。
        </p>
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-muted" onClick={close}>
          キャンセル
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            payload?.onConfirm?.();
            close();
          }}
        >
          リアグを解除
        </button>
      </ModalFooter>
    </>
  );
}
