import { MusicalNoteIcon, PhotoIcon, PlusCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { deleteAsset, saveAsset } from '@domain/assets/assetStorage';
import { useAssetPreview } from '../../features/assets/useAssetPreview';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import type { OriginalPrizeAssetV1 } from '@domain/app-persistence';
import type { OriginalPrizeInstance } from '@domain/originalPrize';

export interface OriginalPrizeItemEntry {
  itemId: string;
  itemName: string;
  rarityLabel: string;
  count: number;
  instances: OriginalPrizeInstance[];
}

export interface OriginalPrizeSettingsDialogPayload {
  userId: string;
  userName: string;
  inventoryId: string;
  gachaId: string;
  gachaName: string;
  items: OriginalPrizeItemEntry[];
}

function normalizeOriginalPrizeInstances(instances: OriginalPrizeInstance[]): OriginalPrizeInstance[] {
  const seen = new Set<string>();
  const normalized: OriginalPrizeInstance[] = [];

  instances.forEach((instance) => {
    if (!instance?.instanceId || seen.has(instance.instanceId)) {
      return;
    }
    seen.add(instance.instanceId);
    normalized.push({
      ...instance,
      index: Number.isFinite(instance.index) ? instance.index : -1,
      asset: instance.asset ?? null
    });
  });

  return normalized;
}

function formatAcquiredAt(value: string | undefined): string {
  if (!value) {
    return '不明';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return '不明';
  }

  return parsed.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

interface AssetPreviewItemProps {
  asset: OriginalPrizeAssetV1;
  onRemove?: (assetId: string) => void;
}

function AssetPreviewItem({ asset, onRemove }: AssetPreviewItemProps): JSX.Element {
  const preview = useAssetPreview(asset.assetId, {
    previewAssetId: asset.thumbnailAssetId ?? null
  });
  const previewUrl = preview.url ?? null;
  const previewType = preview.previewType ?? preview.type ?? (previewUrl ? 'image/*' : null);
  const isImagePreview = Boolean(previewType && previewType.startsWith('image/'));
  const isVideoPreview = Boolean(previewType && previewType.startsWith('video/'));
  const isAudioPreview = Boolean(previewType && previewType.startsWith('audio/'));
  const typeLabel = isImagePreview ? '画像' : isVideoPreview ? '動画' : isAudioPreview ? '音声' : 'ファイル';

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface/20 px-3 py-2">
      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-border/20">
        {previewUrl ? (
          isImagePreview ? (
            <img src={previewUrl} alt={preview.name ?? asset.assetId} className="h-full w-full object-contain" />
          ) : isVideoPreview ? (
            <video src={previewUrl} className="max-h-full max-w-full" />
          ) : isAudioPreview ? (
            <MusicalNoteIcon className="h-6 w-6 text-muted-foreground" />
          ) : (
            <PhotoIcon className="h-6 w-6 text-muted-foreground" />
          )
        ) : (
          <PhotoIcon className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-surface-foreground">
          {preview.name ?? asset.assetId}
        </p>
        <span className="mt-1 text-[10px] text-muted-foreground">{typeLabel}</span>
      </div>
      {onRemove ? (
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg border border-border/60 p-2 text-muted-foreground transition hover:border-accent/60 hover:text-surface-foreground"
          onClick={() => onRemove(asset.assetId)}
        >
          <XMarkIcon className="h-4 w-4" />
          <span className="sr-only">削除</span>
        </button>
      ) : null}
    </div>
  );
}

interface OriginalPrizeInstanceRowProps {
  instance: OriginalPrizeInstance;
  position: number;
  onAddAsset: (instance: OriginalPrizeInstance, file: File | null) => void;
  onRemoveAsset: (instance: OriginalPrizeInstance) => void;
  disabled?: boolean;
}

function OriginalPrizeInstanceRow({
  instance,
  position,
  onAddAsset,
  onRemoveAsset,
  disabled
}: OriginalPrizeInstanceRowProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canEdit = Boolean(instance.pullId) && instance.index >= 0 && !instance.isPlaceholder;
  const hasAsset = Boolean(instance.asset?.assetId);

  const handleClickAdd = () => {
    if (!canEdit || disabled) {
      return;
    }
    inputRef.current?.click();
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    onAddAsset(instance, file);
    event.target.value = '';
  };

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-surface/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-surface-foreground">{position}個目</p>
          <p className="text-[11px] text-muted-foreground">取得日時: {formatAcquiredAt(instance.acquiredAt)}</p>
        </div>
        <button
          type="button"
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-full border border-accent/60 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition hover:border-accent hover:bg-accent/20',
            (disabled || !canEdit) && 'cursor-not-allowed opacity-60'
          )}
          onClick={handleClickAdd}
          disabled={disabled || !canEdit}
        >
          <PlusCircleIcon className="h-4 w-4" />
          {hasAsset ? '差し替え' : 'ファイル追加'}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          onChange={handleInputChange}
          disabled={disabled || !canEdit}
        />
      </div>
      <div className="space-y-2">
        {hasAsset && instance.asset ? (
          <AssetPreviewItem
            asset={instance.asset}
            onRemove={disabled || !canEdit ? undefined : (_assetId) => onRemoveAsset(instance)}
          />
        ) : (
          <p className="text-xs text-muted-foreground">まだファイルが設定されていません。</p>
        )}
        {!canEdit ? (
          <p className="text-[11px] text-muted-foreground">履歴がないため保存できません。</p>
        ) : null}
      </div>
    </div>
  );
}

interface OriginalPrizeItemRowProps {
  item: OriginalPrizeItemEntry;
  instances: OriginalPrizeInstance[];
  onAddAsset: (instance: OriginalPrizeInstance, file: File | null) => void;
  onRemoveAsset: (instance: OriginalPrizeInstance) => void;
  disabled?: boolean;
}

function OriginalPrizeItemRow({
  item,
  instances,
  onAddAsset,
  onRemoveAsset,
  disabled
}: OriginalPrizeItemRowProps): JSX.Element {
  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-panel-contrast p-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-surface-foreground">{item.itemName}</p>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span>{item.rarityLabel}</span>
          <span className="rounded-full border border-border/60 px-2 py-0.5">所持 {item.count}個</span>
        </div>
      </div>
      <div className="space-y-3">
        {instances.length === 0 ? (
          <p className="text-xs text-muted-foreground">獲得履歴がありません。</p>
        ) : (
          instances.map((instance, index) => (
            <OriginalPrizeInstanceRow
              key={instance.instanceId}
              instance={instance}
              position={index + 1}
              onAddAsset={onAddAsset}
              onRemoveAsset={onRemoveAsset}
              disabled={disabled}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function OriginalPrizeSettingsDialog({
  payload,
  close
}: ModalComponentProps<OriginalPrizeSettingsDialogPayload>): JSX.Element {
  const { pullHistory: pullHistoryStore } = useDomainStores();
  const [isProcessingAsset, setIsProcessingAsset] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);

  const sortedItems = useMemo(() => {
    return (payload?.items ?? []).slice().sort((a, b) => a.itemName.localeCompare(b.itemName, 'ja'));
  }, [payload?.items]);

  const [instancesByItemId, setInstancesByItemId] = useState<Record<string, OriginalPrizeInstance[]>>(() => {
    const initial: Record<string, OriginalPrizeInstance[]> = {};
    sortedItems.forEach((item) => {
      initial[item.itemId] = normalizeOriginalPrizeInstances(item.instances ?? []);
    });
    return initial;
  });

  const updateInstanceAssetState = useCallback(
    (itemId: string, instanceId: string, asset: OriginalPrizeAssetV1 | null) => {
      setInstancesByItemId((previous) => {
        const current = previous[itemId] ?? [];
        if (current.length === 0) {
          return previous;
        }
        const nextInstances = current.map((instance) =>
          instance.instanceId === instanceId ? { ...instance, asset } : instance
        );
        return { ...previous, [itemId]: nextInstances };
      });
    },
    []
  );

  const persistAssignment = useCallback(
    (instance: OriginalPrizeInstance, asset: OriginalPrizeAssetV1 | null) => {
      if (!instance.pullId || instance.index < 0) {
        return;
      }
      pullHistoryStore.updateOriginalPrizeAssignment(
        {
          pullId: instance.pullId,
          itemId: instance.itemId,
          index: instance.index,
          asset
        },
        { persist: 'debounced' }
      );
    },
    [pullHistoryStore]
  );

  const handleAddAsset = useCallback(
    async (instance: OriginalPrizeInstance, file: File | null) => {
      if (!file) {
        return;
      }
      if (!instance.pullId || instance.index < 0) {
        setAssetError('履歴がないため保存できません。');
        return;
      }

      setAssetError(null);
      setIsProcessingAsset(true);
      const previousAssetId = instance.asset?.assetId ?? null;

      try {
        const record = await saveAsset(file);
        const newAsset: OriginalPrizeAssetV1 = {
          assetId: record.id,
          thumbnailAssetId: record.previewId ?? null
        };

        updateInstanceAssetState(instance.itemId, instance.instanceId, newAsset);
        persistAssignment(instance, newAsset);

        if (previousAssetId) {
          try {
            await deleteAsset(previousAssetId);
          } catch (error) {
            console.warn('オリジナル景品ファイルの削除に失敗しました', error);
          }
        }
      } catch (error) {
        console.error('オリジナル景品ファイルの保存に失敗しました', error);
        setAssetError('ファイルの保存に失敗しました。もう一度お試しください。');
      } finally {
        setIsProcessingAsset(false);
      }
    },
    [persistAssignment, updateInstanceAssetState]
  );

  const handleRemoveAsset = useCallback(
    async (instance: OriginalPrizeInstance) => {
      const assetId = instance.asset?.assetId ?? '';
      if (!assetId) {
        return;
      }
      if (!instance.pullId || instance.index < 0) {
        setAssetError('履歴がないため保存できません。');
        return;
      }

      setAssetError(null);
      setIsProcessingAsset(true);
      updateInstanceAssetState(instance.itemId, instance.instanceId, null);
      persistAssignment(instance, null);

      try {
        await deleteAsset(assetId);
      } catch (error) {
        console.warn('オリジナル景品ファイルの削除に失敗しました', error);
      } finally {
        setIsProcessingAsset(false);
      }
    },
    [persistAssignment, updateInstanceAssetState]
  );

  return (
    <>
      <ModalBody className="space-y-4 rounded-2xl bg-surface/20 p-6">
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            対象ユーザー: <span className="font-semibold text-surface-foreground">{payload?.userName ?? '-'}</span>
          </p>
          <p>
            対象ガチャ: <span className="font-semibold text-surface-foreground">{payload?.gachaName ?? '-'}</span>
          </p>
        </div>
        {sortedItems.length === 0 ? (
          <p className="rounded-xl border border-border/60 bg-panel-contrast p-4 text-sm text-muted-foreground">
            このユーザーが所持しているオリジナル景品はありません。
          </p>
        ) : (
          <div className="space-y-4">
            {sortedItems.map((item) => (
              <OriginalPrizeItemRow
                key={item.itemId}
                item={item}
                instances={instancesByItemId[item.itemId] ?? []}
                onAddAsset={handleAddAsset}
                onRemoveAsset={handleRemoveAsset}
                disabled={isProcessingAsset}
              />
            ))}
          </div>
        )}
        {assetError ? <p className="text-xs text-red-400">{assetError}</p> : null}
      </ModalBody>
      <p className="modal-description mt-6 w-full text-xs text-muted-foreground">
        追加したファイルはユーザーごとのオリジナル景品として保存されます。
      </p>
      <ModalFooter>
        <button type="button" className="btn btn-muted" onClick={close}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
