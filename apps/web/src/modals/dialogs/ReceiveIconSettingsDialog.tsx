import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { ReceiveIconRegistryPanel } from './ReceiveIconRegistryPanel';
import { useReceiveIconRegistry } from '../../pages/receive/hooks/useReceiveIconRegistry';

export interface ReceiveIconSettingsDialogPayload {
  onCloseAfterSave?: boolean;
}

export function ReceiveIconSettingsDialog({
  close
}: ModalComponentProps<ReceiveIconSettingsDialogPayload>): JSX.Element {
  const { iconAssetIds, remainingSlots, isProcessing, error, addIcons, removeIcon } = useReceiveIconRegistry();

  return (
    <>
      <ModalBody className="receive-icon-settings-dialog__body rounded-2xl bg-surface/20 p-0 md:pr-0">
        <ReceiveIconRegistryPanel
          iconAssetIds={iconAssetIds}
          remainingSlots={remainingSlots}
          isProcessing={isProcessing}
          error={error}
          addIcons={addIcons}
          removeIcon={removeIcon}
        />
      </ModalBody>

      <ModalFooter className="receive-icon-settings-dialog__footer">
        <button
          type="button"
          className="receive-icon-settings-dialog__close-button btn btn-muted"
          onClick={close}
          disabled={isProcessing}
        >
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
