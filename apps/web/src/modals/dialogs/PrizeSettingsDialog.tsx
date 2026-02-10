import { MusicalNoteIcon, PhotoIcon, PlusCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

import { SwitchField } from '../../pages/gacha/components/form/SwitchField';
import { SingleSelectDropdown, type SingleSelectOption } from '../../pages/gacha/components/select/SingleSelectDropdown';
import { ConfirmDialog, ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { ItemDeleteConfirmDialog } from './ItemDeleteConfirmDialog';
import { type RiaguConfigDialogPayload, RiaguConfigDialog } from './RiaguConfigDialog';
import { GOLD_HEX, RAINBOW_VALUE, SILVER_HEX } from '../../pages/gacha/components/rarity/color-picker/palette';
import { getRarityTextPresentation } from '../../features/rarity/utils/rarityColorPresentation';
import { RiaguDisableConfirmDialog } from './RiaguDisableConfirmDialog';
import { deleteAsset, saveAsset } from '@domain/assets/assetStorage';
import { useAssetPreview } from '../../features/assets/useAssetPreview';
import {
  type DigitalItemTypeKey,
  getDigitalItemTypeLabel,
  inferDigitalItemTypeFromImageUrl,
  normalizeDigitalItemType
} from '@domain/digital-items/digitalItemTypes';
import { DigitalItemTypeDialog } from './DigitalItemTypeDialog';

interface RarityOption {
  id: string;
  label: string;
  color?: string | null;
}

interface PrizeSettingsAsset {
  assetId: string;
  thumbnailAssetId?: string | null;
  digitalItemType?: DigitalItemTypeKey | null;
}

export interface PrizeSettingsDialogPayload {
  gachaId: string;
  itemId: string;
  itemName: string;
  gachaName: string;
  rarityId: string;
  rarityLabel: string;
  rarityOptions: RarityOption[];
  pickupTarget: boolean;
  completeTarget: boolean;
  originalPrize: boolean;
  isRiagu: boolean;
  hasRiaguCard?: boolean;
  riaguAssignmentCount?: number;
  stockCount?: number | null;
  assets?: PrizeSettingsAsset[];
  rarityColor?: string;
  riaguPrice?: number;
  riaguType?: string;
  assignmentUsers?: Array<{ userId: string; displayName: string }>;
  onSave?: (data: {
    itemId: string;
    name: string;
    rarityId: string;
    pickupTarget: boolean;
    completeTarget: boolean;
    originalPrize: boolean;
    riagu: boolean;
    stockCount: number | null;
    assets: PrizeSettingsAsset[];
  }) => void;
  onDelete?: (data: { itemId: string; gachaId: string }) => void;
}

const INPUT_CLASSNAME =
  'w-full rounded-xl border border-border/60 bg-surface/30 px-3 py-2 text-sm text-surface-foreground placeholder:text-muted-foreground focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/30';

function getBadgeBackground(color?: string | null): string | undefined {
  if (!color) {
    return undefined;
  }

  const normalized = color.trim().toLowerCase();
  if (normalized.startsWith('#')) {
    return `${color}30`;
  }
  if (normalized === RAINBOW_VALUE) {
    return 'rgba(244, 114, 182, 0.25)';
  }
  if (normalized === GOLD_HEX) {
    return 'rgba(250, 204, 21, 0.25)';
  }
  if (normalized === SILVER_HEX) {
    return 'rgba(209, 213, 219, 0.25)';
  }
  return undefined;
}

function normalizeAssets(entries: PrizeSettingsAsset[] | undefined): PrizeSettingsAsset[] {
  if (!entries || entries.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: PrizeSettingsAsset[] = [];

  entries.forEach((asset) => {
    if (!asset?.assetId) {
      return;
    }
    if (seen.has(asset.assetId)) {
      return;
    }
    seen.add(asset.assetId);
    normalized.push({
      assetId: asset.assetId,
      thumbnailAssetId: asset.thumbnailAssetId ?? null,
      digitalItemType: normalizeDigitalItemType(asset.digitalItemType) ?? null
    });
  });

  return normalized;
}

function areAssetsEqual(left: PrizeSettingsAsset[], right: PrizeSettingsAsset[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftEntry = left[index];
    const rightEntry = right[index];
    if (leftEntry?.assetId !== rightEntry?.assetId) {
      return false;
    }
    const leftPreview = leftEntry?.thumbnailAssetId ?? null;
    const rightPreview = rightEntry?.thumbnailAssetId ?? null;
    if (leftPreview !== rightPreview) {
      return false;
    }
    const leftType = normalizeDigitalItemType(leftEntry?.digitalItemType) ?? null;
    const rightType = normalizeDigitalItemType(rightEntry?.digitalItemType) ?? null;
    if (leftType !== rightType) {
      return false;
    }
  }

  return true;
}

interface AssetPreviewItemProps {
  asset: PrizeSettingsAsset;
  isPrimary: boolean;
  onRemove?: (assetId: string) => void;
  onRequestDigitalItemTypeChange?: (assetId: string, currentType: DigitalItemTypeKey, assetName: string) => void;
  onInferredDigitalItemType?: (assetId: string, inferredType: DigitalItemTypeKey) => void;
}

function AssetPreviewItem({
  asset,
  isPrimary,
  onRemove,
  onRequestDigitalItemTypeChange,
  onInferredDigitalItemType
}: AssetPreviewItemProps): JSX.Element {
  const preview = useAssetPreview(asset.assetId, {
    previewAssetId: asset.thumbnailAssetId ?? null
  });
  const previewUrl = preview.url ?? null;
  const previewType = preview.previewType ?? preview.type ?? (previewUrl ? 'image/*' : null);
  const isImagePreview = Boolean(previewType && previewType.startsWith('image/'));
  const isVideoPreview = Boolean(previewType && previewType.startsWith('video/'));
  const isAudioPreview = Boolean(previewType && previewType.startsWith('audio/'));
  // kind label intentionally omitted in UI (画像/動画/音声などは表示しない)
  const normalizedExplicitType = normalizeDigitalItemType(asset.digitalItemType);
  const [inferredType, setInferredType] = useState<DigitalItemTypeKey | null>(null);

  useEffect(() => {
    if (normalizedExplicitType) {
      setInferredType(null);
      return;
    }

    let active = true;

    // 推定用途ではオリジナルのMIME(type)を優先し、プレビューのMIME(previewType)は補助として扱う。
    const mimeType = preview.type ?? preview.previewType ?? null;
    const fallback =
      isAudioPreview ? ('audio' satisfies DigitalItemTypeKey) : isVideoPreview ? ('video' satisfies DigitalItemTypeKey) : null;

    if (fallback) {
      setInferredType(fallback);
      onInferredDigitalItemType?.(asset.assetId, fallback);
      return () => {
        active = false;
      };
    }

    const compute = async () => {
      if (!isImagePreview || !previewUrl) {
        if (!active) {
          return;
        }
        setInferredType('other');
        onInferredDigitalItemType?.(asset.assetId, 'other');
        return;
      }

      const next = await inferDigitalItemTypeFromImageUrl({ url: previewUrl, mimeType });
      if (!active) {
        return;
      }
      setInferredType(next);
      onInferredDigitalItemType?.(asset.assetId, next);
    };

    void compute();

    return () => {
      active = false;
    };
  }, [
    asset.assetId,
    isAudioPreview,
    isImagePreview,
    isVideoPreview,
    normalizedExplicitType,
    onInferredDigitalItemType,
    preview.previewType,
    preview.type,
    previewUrl
  ]);

  const resolvedDigitalItemType = normalizedExplicitType ?? inferredType ?? 'other';
  const digitalItemTypeLabel = getDigitalItemTypeLabel(resolvedDigitalItemType);
  const resolvedAssetName = (preview.name ?? asset.assetId).trim() || asset.assetId;

  return (
    <div className="prize-settings-dialog__asset-row flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-border/60 bg-surface/20 px-3 py-2">
      <div className="prize-settings-dialog__asset-thumbnail flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-border/20">
        {previewUrl ? (
          isImagePreview ? (
            <img
              src={previewUrl}
              alt={preview.name ?? asset.assetId}
              className="prize-settings-dialog__asset-thumbnail-image h-full w-full object-contain"
            />
          ) : isVideoPreview ? (
            <video src={previewUrl} className="prize-settings-dialog__asset-thumbnail-video max-h-full max-w-full" />
          ) : isAudioPreview ? (
            <MusicalNoteIcon className="prize-settings-dialog__asset-thumbnail-audio-icon h-6 w-6 text-muted-foreground" />
          ) : (
            <PhotoIcon className="prize-settings-dialog__asset-thumbnail-unknown-icon h-6 w-6 text-muted-foreground" />
          )
        ) : (
          <PhotoIcon className="prize-settings-dialog__asset-thumbnail-empty-icon h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <div className="prize-settings-dialog__asset-content min-w-0 flex-1 overflow-hidden">
        <p className="prize-settings-dialog__asset-name truncate text-xs font-semibold text-surface-foreground">
          {preview.name ?? asset.assetId}
        </p>
        <div className="prize-settings-dialog__asset-meta-row mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
          {isPrimary ? (
            <span className="prize-settings-dialog__asset-primary-badge rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent">
              メイン
            </span>
          ) : null}
          <button
            type="button"
            className="prize-settings-dialog__asset-digital-type-button inline-flex items-center rounded-full border border-border/60 bg-surface/40 px-2 py-0.5 text-[10px] font-semibold text-surface-foreground transition hover:border-accent/60 hover:text-accent"
            onClick={() => onRequestDigitalItemTypeChange?.(asset.assetId, resolvedDigitalItemType, resolvedAssetName)}
          >
            {digitalItemTypeLabel}
          </button>
        </div>
      </div>
      {onRemove ? (
        <button
          type="button"
          className="prize-settings-dialog__asset-remove-button inline-flex items-center justify-center rounded-lg border border-border/60 p-2 text-muted-foreground transition hover:border-accent/60 hover:text-surface-foreground"
          onClick={() => onRemove(asset.assetId)}
        >
          <XMarkIcon className="h-4 w-4" />
          <span className="sr-only">削除</span>
        </button>
      ) : null}
    </div>
  );
}

export function PrizeSettingsDialog({ payload, close, push }: ModalComponentProps<PrizeSettingsDialogPayload>): JSX.Element {
  const initialState = useMemo(
    () => ({
      name: payload?.itemName ?? '',
      rarityId: payload?.rarityId ?? '',
      pickup: payload?.pickupTarget ?? false,
      complete: payload?.completeTarget ?? false,
      originalPrize: payload?.originalPrize ?? false,
      riagu: payload?.isRiagu ?? false,
      assets: normalizeAssets(payload?.assets),
      stockCount:
        typeof payload?.stockCount === 'number' && Number.isFinite(payload.stockCount)
          ? Math.max(0, Math.floor(payload.stockCount))
          : null
    }),
    [payload]
  );

  const [name, setName] = useState(initialState.name);
  const [rarityId, setRarityId] = useState(initialState.rarityId);
  const [pickupTarget, setPickupTarget] = useState(initialState.pickup);
  const [completeTarget, setCompleteTarget] = useState(initialState.complete);
  const [originalPrize, setOriginalPrize] = useState(initialState.originalPrize);
  const [riaguTarget, setRiaguTarget] = useState(initialState.riagu);
  const [assetEntries, setAssetEntries] = useState<PrizeSettingsAsset[]>(initialState.assets);
  const [stockCountInput, setStockCountInput] = useState<string>(
    initialState.stockCount !== null ? String(initialState.stockCount) : ''
  );
  const [isProcessingAsset, setIsProcessingAsset] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);
  const assetRequestIdRef = useRef(0);
  const unsavedAssetIdsRef = useRef<Set<string>>(new Set());
  const inferredDigitalItemTypesRef = useRef<Map<string, DigitalItemTypeKey>>(new Map());

  const rarityOptionMap = useMemo(() => {
    const map = new Map<string, RarityOption>();
    payload?.rarityOptions?.forEach((option) => {
      map.set(option.id, option);
    });
    return map;
  }, [payload?.rarityOptions]);

  const raritySelectOptions = useMemo<SingleSelectOption<string>[]>(
    () =>
      (payload?.rarityOptions ?? []).map((option) => ({
        value: option.id,
        label: option.label
      })),
    [payload?.rarityOptions]
  );

  const selectedRarityOption = rarityId ? rarityOptionMap.get(rarityId) : undefined;

  const currentRarityLabel = selectedRarityOption?.label ?? payload?.rarityLabel ?? '未分類';
  const currentRarityColor = selectedRarityOption?.color ??
    (rarityId === payload?.rarityId ? payload?.rarityColor : undefined);

  const handleRiaguToggleChange = (nextValue: boolean) => {
    if (!payload) {
      setRiaguTarget(nextValue);
      return;
    }

    const wasEnabled = riaguTarget;
    const isDisabling = wasEnabled && !nextValue;
    const shouldConfirmDisable =
      isDisabling && (payload.hasRiaguCard || (payload.riaguAssignmentCount ?? 0) > 0);

    if (shouldConfirmDisable) {
      const assignmentCount = payload.riaguAssignmentCount ?? 0;

      push(RiaguDisableConfirmDialog, {
        id: `${payload.itemId}-confirm-riagu-disable`,
        title: 'リアグ設定の解除',
        size: 'sm',
        payload: {
          itemName: payload.itemName,
          assignmentCount,
          onConfirm: () => {
            setRiaguTarget(false);
          }
        }
      });
      return;
    }

    setRiaguTarget(nextValue);
  };

  const handleOriginalPrizeToggleChange = useCallback(
    (nextValue: boolean) => {
      setOriginalPrize(nextValue);
      if (!nextValue || assetEntries.length === 0) {
        return;
      }

      const assetIds = assetEntries.map((entry) => entry.assetId).filter((assetId) => assetId);
      setAssetEntries([]);
      unsavedAssetIdsRef.current.clear();
      setAssetError(null);

      void Promise.allSettled(assetIds.map((assetId) => deleteAsset(assetId))).then((results) => {
        const failedCount = results.filter((result) => result.status === 'rejected').length;
        if (failedCount > 0) {
          setAssetError('プレビューのファイル削除に失敗しました。');
        }
      });
    },
    [assetEntries]
  );

  useEffect(() => {
    return () => {
      const pendingIds = Array.from(unsavedAssetIdsRef.current);
      if (pendingIds.length > 0) {
        void Promise.allSettled(pendingIds.map((assetId) => deleteAsset(assetId)));
      }
    };
  }, []);

  const previewAssetEntries = originalPrize ? [] : assetEntries;
  const primaryAsset = previewAssetEntries[0] ?? null;
  const primaryPreview = useAssetPreview(primaryAsset?.assetId ?? null, {
    previewAssetId: primaryAsset?.thumbnailAssetId ?? null
  });
  const currentPreview = primaryPreview.url ?? null;
  const previewType = primaryPreview.previewType ?? primaryPreview.type ?? (currentPreview ? 'image/*' : null);
  const isImagePreview = Boolean(previewType && previewType.startsWith('image/'));
  const isVideoPreview = Boolean(previewType && previewType.startsWith('video/'));
  const isAudioPreview = Boolean(previewType && previewType.startsWith('audio/'));
  const canRemoveImage = previewAssetEntries.length > 0;

  const handleRemoveAsset = useCallback(async (assetId: string) => {
    setAssetEntries((previous) => previous.filter((entry) => entry.assetId !== assetId));

    if (unsavedAssetIdsRef.current.has(assetId)) {
      unsavedAssetIdsRef.current.delete(assetId);
      await deleteAsset(assetId);
    }
  }, []);

  const handleFilesAdd = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0 || originalPrize) {
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

        const newAssets: PrizeSettingsAsset[] = successful.map((record) => ({
          assetId: record.id,
          thumbnailAssetId: record.previewId ?? null
        }));

        setAssetEntries((previous) => normalizeAssets([...previous, ...newAssets]));
        newAssets.forEach((asset) => unsavedAssetIdsRef.current.add(asset.assetId));
      } catch (error) {
        console.error('ファイルの保存に失敗しました', error);
        setAssetError('ファイルの保存に失敗しました。もう一度お試しください。');
      } finally {
        if (assetRequestIdRef.current === requestId) {
          setIsProcessingAsset(false);
        }
      }
    },
    [originalPrize]
  );

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    void handleFilesAdd(files);
    event.target.value = '';
  };

  const hasChanges =
    name !== initialState.name ||
    rarityId !== initialState.rarityId ||
    pickupTarget !== initialState.pickup ||
    completeTarget !== initialState.complete ||
    originalPrize !== initialState.originalPrize ||
    riaguTarget !== initialState.riagu ||
    !areAssetsEqual(assetEntries, initialState.assets) ||
    stockCountInput !== (initialState.stockCount !== null ? String(initialState.stockCount) : '');

  const rarityColor = currentRarityColor ?? '#ff4f89';
  const rarityPreviewPresentation = getRarityTextPresentation(rarityColor);
  const rarityBadgeBackground = getBadgeBackground(rarityColor);
  const rarityBadgeStyle = {
    ...(rarityPreviewPresentation.style ?? {}),
    ...(rarityBadgeBackground ? { backgroundColor: rarityBadgeBackground } : {})
  };

  const handleSave = () => {
    if (isProcessingAsset) {
      return;
    }
    if (!payload) {
      close();
      return;
    }

    payload.onSave?.({
      itemId: payload.itemId,
      name,
      rarityId,
      pickupTarget,
      completeTarget,
      originalPrize,
      riagu: riaguTarget,
      stockCount: (() => {
        const normalized = stockCountInput.trim();
        if (!normalized) {
          return null;
        }
        const parsed = Number(normalized);
        if (!Number.isFinite(parsed)) {
          return null;
        }
        return Math.max(0, Math.floor(parsed));
      })(),
      assets:
        originalPrize
          ? []
          : normalizeAssets(assetEntries).map((entry) => ({
              ...entry,
              digitalItemType:
                normalizeDigitalItemType(entry.digitalItemType) ??
                inferredDigitalItemTypesRef.current.get(entry.assetId) ??
                'other'
            }))
    });

    unsavedAssetIdsRef.current.clear();
    close();
  };

  const handleRequestClose = () => {
    if (!hasChanges) {
      close();
      return;
    }

    push(ConfirmDialog, {
      id: `${payload?.itemId ?? 'prize'}-confirm-close`,
      title: '変更を破棄しますか？',
      size: 'sm',
      payload: {
        message: '保存されていない変更があります。破棄すると直前の状態に戻ります。',
        confirmLabel: '破棄する',
        cancelLabel: '編集に戻る',
        onConfirm: () => {
          close();
        }
      }
    });
  };

  const handleDeleteItem = () => {
    if (!payload) {
      return;
    }

    const winnerNames = payload.assignmentUsers?.map((entry) => entry.displayName.trim()).filter((name) => name.length > 0);

    push(ItemDeleteConfirmDialog, {
      id: `${payload.itemId}-confirm-delete`,
      title: 'アイテムを削除',
      size: 'sm',
      intent: 'warning',
      payload: {
        itemId: payload.itemId,
        itemName: payload.itemName,
        gachaName: payload.gachaName,
        hasUserReferences: (payload.assignmentUsers?.length ?? 0) > 0,
        winnerNames,
        onConfirm: () => {
          payload.onDelete?.({ itemId: payload.itemId, gachaId: payload.gachaId });
          close();
        }
      }
    });
  };

  const handleOpenRiaguDialog = () => {
    if (!payload) {
      return;
    }

    if (!riaguTarget) {
      return;
    }

    const riaguPayload: RiaguConfigDialogPayload = {
      gachaId: payload.gachaId,
      itemId: payload.itemId,
      itemName: payload.itemName,
      defaultPrice: payload.riaguPrice,
      defaultType: payload.riaguType,
      onSave: (data) => {
        console.info('リアグ設定の保存（ダミー）', data);
      }
    };

    push(RiaguConfigDialog, {
      id: `${payload.itemId}-riagu`,
      title: 'リアルグッズ設定',
      size: 'sm',
      payload: riaguPayload
    });
  };

  const handleRequestDigitalItemTypeChange = useCallback(
    (assetId: string, currentType: DigitalItemTypeKey, assetName: string) => {
      push(DigitalItemTypeDialog, {
        id: `digital-item-type-${assetId}`,
        title: 'デジタルアイテムタイプ',
        size: 'sm',
        payload: {
          assetId,
          assetName,
          currentType,
          onSave: ({ assetId: savedAssetId, digitalItemType }) => {
            inferredDigitalItemTypesRef.current.set(savedAssetId, digitalItemType);
            setAssetEntries((previous) =>
              previous.map((entry) =>
                entry.assetId === savedAssetId ? { ...entry, digitalItemType } : entry
              )
            );
          }
        }
      });
    },
    [push]
  );

  const renderFileSelectionContent = () => {
    if (originalPrize) {
      return (
        <>
          <p className="text-sm font-medium text-surface-foreground">メディアファイルを選択</p>
          <p className="mt-2 text-xs text-muted-foreground">
            オリジナル景品はこの画面でファイルを設定できません。ユーザーごとの割り当て画面から設定してください。
          </p>
        </>
      );
    }

    return (
      <>
        <p className="text-sm font-medium text-surface-foreground">メディアファイルを選択</p>
        <p className="mt-2 text-xs text-muted-foreground">
          画像（PNG / JPG / WEBP）に加え、動画や音声ファイルも登録できます。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <label className="inline-flex items-center gap-2 rounded-xl border border-accent/60 bg-accent/20 px-3 py-2 text-sm font-semibold text-accent">
            <PlusCircleIcon className="h-4 w-4" />
            ファイルを追加
            <input
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.m4a,audio/mp4"
              className="sr-only"
              onChange={handleFileInputChange}
              disabled={isProcessingAsset}
            />
          </label>
          {canRemoveImage ? (
            <span className="inline-flex items-center rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">
              登録済み: {assetEntries.length}件
            </span>
          ) : null}
        </div>
        {assetEntries.length > 0 ? (
          <div className="mt-3 w-full max-w-full space-y-2 overflow-hidden">
            {assetEntries.map((asset, index) => (
              <AssetPreviewItem
                key={asset.assetId}
                asset={asset}
                isPrimary={index === 0}
                onRemove={handleRemoveAsset}
                onRequestDigitalItemTypeChange={handleRequestDigitalItemTypeChange}
                onInferredDigitalItemType={(assetId, inferredType) => {
                  inferredDigitalItemTypesRef.current.set(assetId, inferredType);
                }}
              />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">まだファイルが登録されていません。</p>
        )}
        {assetError ? <p className="mt-2 text-[11px] text-red-200">{assetError}</p> : null}
        {isProcessingAsset ? (
          <p className="mt-1 text-[11px] text-accent">ファイルを保存しています…</p>
        ) : null}
      </>
    );
  };

  return (
    <>
      <ModalBody className="rounded-2xl p-2">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <label className="flex-1 min-w-0 space-y-2">
            <span className="block text-sm font-medium text-surface-foreground">対象アイテム</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={INPUT_CLASSNAME}
              placeholder="煌めく星屑ブレスレット"
            />
          </label>
          <div className="flex w-full shrink-0 flex-col gap-2 lg:w-auto lg:min-w-[11rem] lg:max-w-[14rem]">
            <span className="text-sm font-medium text-surface-foreground">レアリティ</span>
            <SingleSelectDropdown<string>
              value={rarityId}
              options={raritySelectOptions}
              onChange={setRarityId}
              placeholder="レアリティを選択"
              fallbackToFirstOption={false}
              classNames={{
                root: 'w-full',
                button:
                  'w-full justify-between rounded-xl border border-border/60 bg-surface/30 px-3 py-2 text-sm font-semibold text-surface-foreground',
                buttonOpen: 'border-accent/70 text-accent',
                buttonClosed: 'hover:border-accent/70',
                menu:
                  'w-full space-y-1 rounded-xl border border-border/60 bg-panel/95 p-2 backdrop-blur-sm',
                option: 'flex w-full items-center justify-between rounded-lg px-3 py-2',
                optionLabel: 'flex-1 truncate text-left',
                checkIcon: 'h-4 w-4 text-accent'
              }}
              renderButtonLabel={() => {
                if (!rarityId) {
                  return <span className="text-muted-foreground">レアリティを選択</span>;
                }
                return (
                  <span
                    className={clsx('block truncate text-left', rarityPreviewPresentation.className)}
                    style={rarityPreviewPresentation.style}
                  >
                    {currentRarityLabel}
                  </span>
                );
              }}
              renderOptionContent={(option) => {
                const optionMeta = rarityOptionMap.get(option.value) ?? null;
                const presentation = getRarityTextPresentation(optionMeta?.color);
                return (
                  <span
                    className={clsx('block truncate text-left font-medium', presentation.className)}
                    style={presentation.style}
                  >
                    {optionMeta?.label ?? option.label}
                  </span>
                );
              }}
            />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[240px,minmax(0,1fr)]">
          <div className="min-w-0 space-y-5">
            <div className="rounded-2xl">
              <p className="text-sm font-medium text-surface-foreground">プレビュー</p>
              <div className="mt-3 flex flex-col gap-4 lg:items-center lg:text-center">
                <div className="flex w-full items-start gap-4 lg:flex-col lg:items-center">
                  <div className="relative flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-border/20 lg:h-40 lg:w-40">
                    {currentPreview ? (
                      isImagePreview ? (
                        <img
                          src={currentPreview}
                          alt="プレビュー"
                          className="h-full w-full object-contain"
                        />
                      ) : isVideoPreview ? (
                        <video src={currentPreview} controls className="max-h-full max-w-full" />
                      ) : isAudioPreview ? (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <MusicalNoteIcon className="h-10 w-10" />
                          <span className="text-xs font-medium">音声ファイル</span>
                        </div>
                      ) : (
                        <PhotoIcon className="h-12 w-12 text-muted-foreground" />
                      )
                    ) : (
                      <PhotoIcon className="h-12 w-12 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex w-full flex-1 flex-col gap-3 text-left lg:mt-4 lg:w-auto lg:items-center lg:text-center">
                    <div className="min-w-0 space-y-1">
                      <p className="break-all text-sm font-semibold text-surface-foreground">
                        {name || '未設定'}
                      </p>
                      <span
                        className={clsx(
                          'inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold',
                          rarityPreviewPresentation.className
                        )}
                        style={rarityBadgeStyle}
                      >
                        {currentRarityLabel}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 space-y-2 lg:hidden">{renderFileSelectionContent()}</div>
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-1">
            <div className="hidden rounded-2xl p-3 lg:block">{renderFileSelectionContent()}</div>
            <div className="rounded-2xl">
              <div className="flex flex-col gap-3">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-surface-foreground">在庫数</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={stockCountInput}
                    onChange={(event) => setStockCountInput(event.target.value)}
                    className={INPUT_CLASSNAME}
                    placeholder="未設定"
                  />
                  <span className="text-xs text-muted-foreground">
                    空欄にすると在庫制限なしで排出されます。
                  </span>
                </label>
                <SwitchField
                  label="ピックアップ対象"
                  description="同レアリティのアイテムより排出率が少し上がります"
                  checked={pickupTarget}
                  onChange={setPickupTarget}
                  name="pickupTarget"
                />
                <SwitchField
                  label="コンプリート対象"
                  description="コンプリート判定に含めます"
                  checked={completeTarget}
                  onChange={setCompleteTarget}
                  name="completeTarget"
                />
                <SwitchField
                  label="ユーザー毎にオリジナル景品"
                  description="ユーザーごとにオリジナルの景品ファイルを割り当てます。リクエストボイスやメッセージ入りの景品はこちらをONにしてください。画像の設定はユーザーのメニューから出来ます。このオプションを有効にした場合、この画面のプレビューに登録されているファイルは削除されます。"
                  checked={originalPrize}
                  onChange={handleOriginalPrizeToggleChange}
                  name="originalPrize"
                />
                <SwitchField
                  label="リアグとして設定"
                  description="リアグ情報の設定を有効にします"
                  checked={riaguTarget}
                  onChange={handleRiaguToggleChange}
                  name="riaguTarget"
                />
                <button
                  type="button"
                  className={clsx(
                    'btn border border-accent/60 bg-accent/10 text-accent transition hover:border-accent hover:bg-accent/20',
                    'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold',
                    'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-accent/60 disabled:hover:bg-accent/10'
                  )}
                  onClick={handleOpenRiaguDialog}
                  disabled={!riaguTarget}
                >
                  リアグ設定
                </button>
              </div>
            </div>
          </div>
        </div>
      </ModalBody>
      <p className="modal-description mt-6 w-full text-xs text-muted-foreground">
        画像を保存すると、自動的にカタログの該当アイテムへ反映されます。ZIP出力時は登録済みの全ファイルが含まれます。
      </p>
      <ModalFooter className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          className={clsx(
            'btn prize-settings__delete-button border-red-500/60 bg-red-500/15 text-red-100 transition hover:border-red-400 hover:bg-red-500/25',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
          onClick={handleDeleteItem}
          disabled={!payload?.onDelete}
        >
          景品を削除
        </button>
        <button
          type="button"
          className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-70"
          onClick={handleSave}
          disabled={isProcessingAsset}
        >
          {isProcessingAsset ? '保存中…' : '保存'}
        </button>
        <button type="button" className="btn btn-muted" onClick={handleRequestClose}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
