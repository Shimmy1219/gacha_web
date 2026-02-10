import { useMemo, useState } from 'react';

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

const INPUT_CLASSNAME =
  'w-full rounded-xl border border-border/60 bg-surface/30 px-3 py-2 text-sm text-surface-foreground placeholder:text-muted-foreground focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/30';

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

export function DigitalItemTypeDialog({
  payload,
  close
}: ModalComponentProps<DigitalItemTypeDialogPayload>): JSX.Element {
  const [query, setQuery] = useState<string>(() => getDigitalItemTypeLabel(payload?.currentType ?? 'other'));
  const [selectedType, setSelectedType] = useState<DigitalItemTypeKey>(payload?.currentType ?? 'other');

  const normalizedQuery = useMemo(() => normalizeText(query), [query]);

  const suggestions = useMemo(() => {
    if (!normalizedQuery) {
      return DIGITAL_ITEM_TYPE_OPTIONS;
    }
    return DIGITAL_ITEM_TYPE_OPTIONS.filter((option) => {
      const keys = [option.label, option.value];
      return keys.some((key) => normalizeText(key).includes(normalizedQuery));
    });
  }, [normalizedQuery]);

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
          <label className="digital-item-type-dialog__field digital-item-type-dialog__field--type space-y-2">
            <span className="digital-item-type-dialog__field-label text-sm font-medium text-surface-foreground">
              デジタルアイテムタイプ
            </span>
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={`digital-item-type-dialog__input digital-item-type-dialog__input--type ${INPUT_CLASSNAME}`}
              placeholder="アイコンリング / スマホ壁紙 など"
            />
          </label>

          <div className="digital-item-type-dialog__suggestions space-y-1">
            <p className="digital-item-type-dialog__suggestions-label text-xs font-semibold text-muted-foreground">候補</p>
            <div className="digital-item-type-dialog__suggestion-list flex max-h-[88px] min-h-[64px] flex-wrap content-start gap-2 overflow-hidden">
              {suggestions.length > 0 ? (
                suggestions.map((option) => {
                  const isSelected = option.value === selectedType;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setSelectedType(option.value);
                        setQuery(option.label);
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
                })
              ) : normalizedQuery ? (
                <p className="digital-item-type-dialog__suggestion-empty text-xs text-muted-foreground">
                  一致する候補はありません。
                </p>
              ) : null}
            </div>
          </div>
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

