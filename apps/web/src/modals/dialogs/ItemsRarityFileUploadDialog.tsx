import { useCallback, useRef, useState } from 'react';

import { RarityFileUploadControls, type RarityFileUploadOption } from '../../components/RarityFileUploadControls';
import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

export interface ItemsRarityFileUploadDialogPayload {
  rarityOptions: ReadonlyArray<RarityFileUploadOption>;
  onSelectFiles?: (params: { files: File[]; rarityId: string | null }) => Promise<void> | void;
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
        await onSelectFiles({ files, rarityId: selectedRarityId });
        setSuccessMessage(`${files.length}件のファイルを追加しました。`);
      } catch (error) {
        console.error('景品ファイルの追加に失敗しました', error);
        setErrorMessage('ファイルの追加に失敗しました。もう一度お試しください。');
      } finally {
        setIsProcessing(false);
      }
    },
    [payload]
  );

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
