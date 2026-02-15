import { PlusCircleIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useEffect, useMemo, useRef } from 'react';

import { useAssetPreview } from '../../features/assets/useAssetPreview';
import { MAX_RECEIVE_ICON_COUNT } from '../../pages/receive/hooks/useReceiveIconRegistry';

function RegisteredIconRow({
  assetId,
  onRemove,
  disabled
}: {
  assetId: string;
  onRemove: (assetId: string) => void;
  disabled: boolean;
}): JSX.Element {
  const preview = useAssetPreview(assetId, {});
  const previewUrl = preview.url ?? null;
  const name = preview.name ?? assetId;

  return (
    <div className="receive-icon-registry-panel__icon-row flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-border/60 bg-surface/20 px-3 py-2">
      <div className="receive-icon-registry-panel__icon-thumbnail flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-border/20">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={name}
            className="receive-icon-registry-panel__icon-thumbnail-image h-full w-full object-cover"
          />
        ) : (
          <div className="receive-icon-registry-panel__icon-thumbnail-empty text-[10px] text-muted-foreground">
            no image
          </div>
        )}
      </div>
      <div className="receive-icon-registry-panel__icon-content min-w-0 flex-1 overflow-hidden">
        <p className="receive-icon-registry-panel__icon-name truncate text-xs font-semibold text-surface-foreground">
          {name}
        </p>
        <p className="receive-icon-registry-panel__icon-id mt-1 truncate text-[10px] text-muted-foreground">
          {assetId}
        </p>
      </div>
      <button
        type="button"
        className="receive-icon-registry-panel__icon-remove-button inline-flex items-center justify-center rounded-lg border border-border/60 p-2 text-muted-foreground transition hover:border-rose-500/60 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => onRemove(assetId)}
        disabled={disabled}
      >
        <TrashIcon className="h-4 w-4" />
        <span className="sr-only">削除</span>
      </button>
    </div>
  );
}

export interface ReceiveIconRegistryPanelProps {
  iconAssetIds: string[];
  remainingSlots: number;
  isProcessing: boolean;
  error: string | null;
  addIcons: (files: FileList | File[] | null) => Promise<void>;
  removeIcon: (assetId: string) => Promise<void>;
  autoOpenFilePicker?: boolean;
}

export function ReceiveIconRegistryPanel({
  iconAssetIds,
  remainingSlots,
  isProcessing,
  error,
  addIcons,
  removeIcon,
  autoOpenFilePicker = false
}: ReceiveIconRegistryPanelProps): JSX.Element {
  const canAdd = remainingSlots > 0 && !isProcessing;
  const registeredCount = iconAssetIds.length;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const helperText = useMemo(() => {
    if (registeredCount >= MAX_RECEIVE_ICON_COUNT) {
      return `最大${MAX_RECEIVE_ICON_COUNT}枚まで登録できます（上限に達しています）。`;
    }
    return `最大${MAX_RECEIVE_ICON_COUNT}枚まで登録できます（残り${remainingSlots}枚）。`;
  }, [registeredCount, remainingSlots]);

  useEffect(() => {
    if (!autoOpenFilePicker || !canAdd) {
      return;
    }
    const handle = window.requestAnimationFrame(() => {
      fileInputRef.current?.click();
    });
    return () => {
      window.cancelAnimationFrame(handle);
    };
  }, [autoOpenFilePicker, canAdd]);

  return (
    <div className="receive-icon-registry-panel__root">
      <div className="receive-icon-registry-panel__header space-y-2">
        <p className="receive-icon-registry-panel__description text-sm text-muted-foreground">
          普段使っているアイコン画像を登録しておくと、「アイコンリング」景品の装着プレビューを自動で作成できます。
        </p>
        <p className="receive-icon-registry-panel__helper text-xs text-muted-foreground">{helperText}</p>
      </div>

      <div className="receive-icon-registry-panel__actions mt-4 flex flex-wrap items-center gap-2">
        <label className="receive-icon-registry-panel__add-button inline-flex items-center gap-2 rounded-xl border border-accent/60 bg-accent/20 px-3 py-2 text-sm font-semibold text-accent">
          <PlusCircleIcon className="h-4 w-4" />
          <span className="receive-icon-registry-panel__add-button-text">アイコン画像を追加</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="receive-icon-registry-panel__file-input sr-only"
            onChange={(event) => {
              void addIcons(event.target.files);
              event.target.value = '';
            }}
            disabled={!canAdd}
          />
        </label>
        <span className="receive-icon-registry-panel__count-chip inline-flex items-center rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">
          登録済み: {registeredCount}/{MAX_RECEIVE_ICON_COUNT}
        </span>
      </div>

      {error ? (
        <div className="receive-icon-registry-panel__error-banner mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
          {error}
        </div>
      ) : null}

      {registeredCount > 0 ? (
        <div className="receive-icon-registry-panel__list mt-4 space-y-2">
          {iconAssetIds.map((assetId) => (
            <RegisteredIconRow
              key={assetId}
              assetId={assetId}
              onRemove={(targetId) => void removeIcon(targetId)}
              disabled={isProcessing}
            />
          ))}
        </div>
      ) : (
        <p className="receive-icon-registry-panel__empty mt-4 text-xs text-muted-foreground">
          まだアイコンが登録されていません。
        </p>
      )}
    </div>
  );
}
