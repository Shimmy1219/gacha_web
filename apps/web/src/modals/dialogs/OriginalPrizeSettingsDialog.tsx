import { MusicalNoteIcon, PhotoIcon, PlusCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { deleteAsset, saveAsset } from '@domain/assets/assetStorage';
import { useAssetPreview } from '../../features/assets/useAssetPreview';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import type { OriginalPrizeAssetV1 } from '@domain/app-persistence';

export interface OriginalPrizeItemEntry {
  itemId: string;
  itemName: string;
  rarityLabel: string;
  count: number;
  assets: OriginalPrizeAssetV1[];
}

export interface OriginalPrizeSettingsDialogPayload {
  userId: string;
  userName: string;
  inventoryId: string;
  gachaId: string;
  gachaName: string;
  items: OriginalPrizeItemEntry[];
}

function normalizeOriginalPrizeAssets(assets: OriginalPrizeAssetV1[]): OriginalPrizeAssetV1[] {
  const seen = new Set<string>();
  const normalized: OriginalPrizeAssetV1[] = [];

  assets.forEach((asset) => {
    if (!asset?.assetId || seen.has(asset.assetId)) {
      return;
    }
    seen.add(asset.assetId);
    normalized.push({
      assetId: asset.assetId,
      thumbnailAssetId: asset.thumbnailAssetId ?? null
    });
  });

  return normalized;
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

interface OriginalPrizeItemRowProps {
  item: OriginalPrizeItemEntry;
  assets: OriginalPrizeAssetV1[];
  onAddAssets: (itemId: string, files: FileList | null) => void;
  onRemoveAsset: (itemId: string, assetId: string) => void;
  disabled?: boolean;
}

function OriginalPrizeItemRow({
  item,
  assets,
  onAddAssets,
  onRemoveAsset,
  disabled
}: OriginalPrizeItemRowProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleClickAdd = () => {
    inputRef.current?.click();
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    onAddAssets(item.itemId, event.target.files);
    event.target.value = '';
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-panel-contrast p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-surface-foreground">{item.itemName}</p>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>{item.rarityLabel}</span>
            <span className="rounded-full border border-border/60 px-2 py-0.5">所持 {item.count}個</span>
          </div>
        </div>
        <button
          type="button"
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-full border border-accent/60 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition hover:border-accent hover:bg-accent/20',
            disabled && 'cursor-not-allowed opacity-60'
          )}
          onClick={handleClickAdd}
          disabled={disabled}
        >
          <PlusCircleIcon className="h-4 w-4" />
          ファイル追加
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={handleInputChange}
        />
      </div>
      <div className="space-y-2">
        {assets.length === 0 ? (
          <p className="text-xs text-muted-foreground">まだファイルが設定されていません。</p>
        ) : (
          assets.map((asset) => (
            <AssetPreviewItem
              key={asset.assetId}
              asset={asset}
              onRemove={(assetId) => onRemoveAsset(item.itemId, assetId)}
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
  const { userInventories: userInventoriesStore } = useDomainStores();
  const [isProcessingAsset, setIsProcessingAsset] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);
  const assetRequestIdRef = useRef(0);

  const sortedItems = useMemo(() => {
    return (payload?.items ?? []).slice().sort((a, b) => a.itemName.localeCompare(b.itemName, 'ja'));
  }, [payload?.items]);

  const [assetsByItemId, setAssetsByItemId] = useState<Record<string, OriginalPrizeAssetV1[]>>(() => {
    const initial: Record<string, OriginalPrizeAssetV1[]> = {};
    sortedItems.forEach((item) => {
      const normalized = normalizeOriginalPrizeAssets(item.assets ?? []);
      if (normalized.length > 0) {
        initial[item.itemId] = normalized;
      }
    });
    return initial;
  });

  const updateAssetsForItem = useCallback(
    (itemId: string, assets: OriginalPrizeAssetV1[]) => {
      if (!payload) {
        return;
      }
      userInventoriesStore.updateOriginalPrizeAssets(
        {
          userId: payload.userId,
          inventoryId: payload.inventoryId,
          itemId,
          assets
        },
        { persist: 'debounced' }
      );
    },
    [payload, userInventoriesStore]
  );

  const handleAddAssets = useCallback(
    async (itemId: string, fileList: FileList | null) => {
      if (!fileList || fileList.length === 0 || !payload) {
        return;
      }

      setAssetError(null);
      const requestId = assetRequestIdRef.current + 1;
      assetRequestIdRef.current = requestId;
      setIsProcessingAsset(true);

      try {
        const results = await Promise.allSettled(
          Array.from(fileList, async (file) => saveAsset(file))
        );

        const successful: Awaited<ReturnType<typeof saveAsset>>[] = [];
        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            successful.push(result.value);
          }
        });

        const failedCount = results.length - successful.length;

        if (assetRequestIdRef.current !== requestId) {
          await Promise.all(successful.map((record) => deleteAsset(record.id)));
          return;
        }

        if (failedCount > 0) {
          setAssetError('一部のファイル保存に失敗しました。');
        }

        const newAssets: OriginalPrizeAssetV1[] = successful.map((record) => ({
          assetId: record.id,
          thumbnailAssetId: record.previewId ?? null
        }));

        setAssetsByItemId((previous) => {
          const current = previous[itemId] ?? [];
          const nextAssets = normalizeOriginalPrizeAssets([...current, ...newAssets]);
          const nextState = { ...previous };
          if (nextAssets.length > 0) {
            nextState[itemId] = nextAssets;
          } else {
            delete nextState[itemId];
          }
          updateAssetsForItem(itemId, nextAssets);
          return nextState;
        });
      } catch (error) {
        console.error('オリジナル景品ファイルの保存に失敗しました', error);
        setAssetError('ファイルの保存に失敗しました。もう一度お試しください。');
      } finally {
        if (assetRequestIdRef.current === requestId) {
          setIsProcessingAsset(false);
        }
      }
    },
    [payload, updateAssetsForItem]
  );

  const handleRemoveAsset = useCallback(
    async (itemId: string, assetId: string) => {
      setAssetsByItemId((previous) => {
        const current = previous[itemId] ?? [];
        const nextAssets = current.filter((asset) => asset.assetId !== assetId);
        const nextState = { ...previous };
        if (nextAssets.length > 0) {
          nextState[itemId] = nextAssets;
        } else {
          delete nextState[itemId];
        }
        updateAssetsForItem(itemId, nextAssets);
        return nextState;
      });

      try {
        await deleteAsset(assetId);
      } catch (error) {
        console.warn('オリジナル景品ファイルの削除に失敗しました', error);
      }
    },
    [updateAssetsForItem]
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
                assets={assetsByItemId[item.itemId] ?? []}
                onAddAssets={handleAddAssets}
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
