import { useCallback, useRef, useState } from 'react';

import { RarityFileUploadControls, type RarityFileUploadOption } from '../../components/RarityFileUploadControls';
import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

export interface ItemsRarityFileUploadDialogPayload {
  rarityOptions: ReadonlyArray<RarityFileUploadOption>;
  onSelectFiles?: (params: {
    files: File[];
    rarityId: string | null;
    useFilenameAsItemName: boolean;
  }) => Promise<void> | void;
  onAddItemWithoutFile?: () => Promise<void> | void;
}

export function ItemsRarityFileUploadDialog({
  payload,
  close
}: ModalComponentProps<ItemsRarityFileUploadDialogPayload>): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingRarityIdRef = useRef<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [useFilenameAsItemName, setUseFilenameAsItemName] = useState(false);

  const rarityOptions = payload?.rarityOptions ?? [];

  const handleRequestSelection = useCallback((rarityId: string | null) => {
    pendingRarityIdRef.current = rarityId;
    fileInputRef.current?.click();
  }, []);

  const handleSelectFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      const onSelectFiles = payload?.onSelectFiles;
      if (!onSelectFiles) {
        return;
      }

      const selectedRarityId = pendingRarityIdRef.current;
      pendingRarityIdRef.current = null;

      setIsProcessing(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      try {
        await onSelectFiles({
          files,
          rarityId: selectedRarityId,
          useFilenameAsItemName
        });
        setSuccessMessage(`${files.length}件のファイルを追加しました。`);
      } catch (error) {
        console.error('景品ファイルの追加に失敗しました', error);
        setErrorMessage('ファイルの追加に失敗しました。もう一度お試しください。');
      } finally {
        setIsProcessing(false);
      }
    },
    [payload, useFilenameAsItemName]
  );

  const handleAddItemWithoutFile = useCallback(async () => {
    const onAddItemWithoutFile = payload?.onAddItemWithoutFile;
    if (!onAddItemWithoutFile) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await onAddItemWithoutFile();
      setSuccessMessage('ファイル無しで追加しました。');
    } catch (error) {
      console.error('ファイル無しの追加に失敗しました', error);
      setErrorMessage('ファイル無しの追加に失敗しました。もう一度お試しください。');
    } finally {
      setIsProcessing(false);
    }
  }, [payload]);

  return (
    <>
      <ModalBody className="items-rarity-upload-dialog__body space-y-4">
        {errorMessage ? (
          <div className="items-rarity-upload-dialog__error rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : null}
        {successMessage ? (
          <div className="items-rarity-upload-dialog__success rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {successMessage}
          </div>
        ) : null}
        <RarityFileUploadControls
          options={rarityOptions}
          isProcessing={isProcessing}
          onSelectAll={() => handleRequestSelection(null)}
          onSelectRarity={handleRequestSelection}
        />
        <div className="items-rarity-upload-dialog__actions flex flex-wrap items-center gap-2 sm:justify-end sm:gap-4">
          <label className="items-rarity-upload-dialog__filename-toggle inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input
              id="items-rarity-upload-dialog-filename-toggle"
              type="checkbox"
              className="items-rarity-upload-dialog__filename-toggle-input h-4 w-4 rounded border-border/60 bg-transparent text-accent focus:ring-accent"
              checked={useFilenameAsItemName}
              onChange={(event) => setUseFilenameAsItemName(event.target.checked)}
              disabled={isProcessing}
            />
            <span className="items-rarity-upload-dialog__filename-toggle-label">ファイル名をアイテム名として使う</span>
          </label>
          <button
            type="button"
            id="items-rarity-upload-dialog-add-empty-button"
            className="items-rarity-upload-dialog__add-empty-button inline-flex items-center gap-2 rounded-xl border border-border/70 bg-surface/40 px-3 py-2 text-xs text-muted-foreground transition hover:border-accent/60 hover:text-surface-foreground disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => {
              void handleAddItemWithoutFile();
            }}
            disabled={isProcessing}
          >
            ファイル無しで追加
          </button>
        </div>
        <p className="items-rarity-upload-dialog__description text-xs text-muted-foreground">
          各ボタンで複数ファイルを選択できます。
        </p>
      </ModalBody>
      <ModalFooter className="items-rarity-upload-dialog__footer">
        <button
          type="button"
          id="items-rarity-upload-dialog-close-button"
          className="items-rarity-upload-dialog__close-button btn btn-primary"
          onClick={close}
          disabled={isProcessing}
        >
          閉じる
        </button>
      </ModalFooter>
      <input
        ref={fileInputRef}
        id="items-rarity-upload-dialog-file-input"
        type="file"
        accept="image/*,video/*,audio/*,.m4a,audio/mp4"
        multiple
        className="items-rarity-upload-dialog__file-input sr-only"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          void handleSelectFiles(files);
          event.currentTarget.value = '';
        }}
      />
    </>
  );
}
