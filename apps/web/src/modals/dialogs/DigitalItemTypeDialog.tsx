import { useState } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import {
  DIGITAL_ITEM_TYPE_OPTIONS,
  type DigitalItemTypeKey,
  getDigitalItemTypeLabel
} from '@domain/digital-items/digitalItemTypes';

export interface DigitalItemTypeDialogPayload {
  assetId: string;
  assetName: string;
  currentType: DigitalItemTypeKey;
  onSave?: (data: { assetId: string; digitalItemType: DigitalItemTypeKey }) => void;
}

export function DigitalItemTypeDialog({
  payload,
  close
}: ModalComponentProps<DigitalItemTypeDialogPayload>): JSX.Element {
  const [selectedType, setSelectedType] = useState<DigitalItemTypeKey>(payload?.currentType ?? 'other');

  const handleSave = () => {
    if (!payload) {
      close();
      return;
    }
    payload.onSave?.({ assetId: payload.assetId, digitalItemType: selectedType });
    close();
  };

  return (
    <>
      <ModalBody className="digital-item-type-dialog__body rounded-2xl bg-surface/20 p-0 md:pr-0">
        <p className="digital-item-type-dialog__target-row flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <span className="digital-item-type-dialog__target-label shrink-0">対象ファイル:</span>
          <span className="digital-item-type-dialog__target-name min-w-0 flex-1 truncate font-medium text-surface-foreground">
            {payload?.assetName ?? '-'}
          </span>
        </p>

        <div className="digital-item-type-dialog__type-section mt-4 space-y-4">
          <p className="digital-item-type-dialog__field-label text-sm font-medium text-surface-foreground">
            デジタルアイテムタイプ
          </p>

          <div className="digital-item-type-dialog__suggestions space-y-1">
            <p className="digital-item-type-dialog__suggestions-label text-xs font-semibold text-muted-foreground">候補</p>
            <div className="digital-item-type-dialog__suggestion-list flex flex-wrap content-start gap-2">
              {DIGITAL_ITEM_TYPE_OPTIONS.map((option) => {
                const isSelected = option.value === selectedType;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setSelectedType(option.value);
                    }}
                    className={`digital-item-type-dialog__suggestion-chip inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-accent/40 ${
                      isSelected
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border/60 text-muted-foreground hover:border-accent hover:text-accent'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="digital-item-type-dialog__selected-label text-xs text-muted-foreground">
            選択中: {getDigitalItemTypeLabel(selectedType)}
          </p>
        </div>
      </ModalBody>

      <ModalFooter className="digital-item-type-dialog__footer">
        <button type="button" className="digital-item-type-dialog__save-button btn btn-primary" onClick={handleSave}>
          保存する
        </button>
        <button type="button" className="digital-item-type-dialog__close-button btn btn-muted" onClick={close}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
