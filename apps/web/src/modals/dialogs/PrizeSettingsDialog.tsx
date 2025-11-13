import { MusicalNoteIcon, PhotoIcon, PlusCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

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

interface RarityOption {
  id: string;
  label: string;
  color?: string | null;
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
  isRiagu: boolean;
  hasRiaguCard?: boolean;
  riaguAssignmentCount?: number;
  thumbnailAssetId?: string | null;
  thumbnailUrl: string | null;
  imageAssetId: string | null;
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
    riagu: boolean;
    imageAssetId: string | null;
    thumbnailAssetId: string | null;
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

export function PrizeSettingsDialog({ payload, close, push }: ModalComponentProps<PrizeSettingsDialogPayload>): JSX.Element {
  const initialState = useMemo(
    () => ({
      name: payload?.itemName ?? '',
      rarityId: payload?.rarityId ?? '',
      pickup: payload?.pickupTarget ?? false,
      complete: payload?.completeTarget ?? false,
      riagu: payload?.isRiagu ?? false,
      thumbnailAssetId: payload?.thumbnailAssetId ?? null,
      thumbnailUrl: payload?.thumbnailUrl ?? null,
      assetId: payload?.imageAssetId ?? null
    }),
    [payload]
  );

  const [name, setName] = useState(initialState.name);
  const [rarityId, setRarityId] = useState(initialState.rarityId);
  const [pickupTarget, setPickupTarget] = useState(initialState.pickup);
  const [completeTarget, setCompleteTarget] = useState(initialState.complete);
  const [riaguTarget, setRiaguTarget] = useState(initialState.riagu);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [currentAssetId, setCurrentAssetId] = useState<string | null>(initialState.assetId);
  const [currentThumbnailAssetId, setCurrentThumbnailAssetId] = useState<string | null>(
    initialState.thumbnailAssetId
  );
  const [unsavedAssetId, setUnsavedAssetId] = useState<string | null>(null);
  const [isProcessingAsset, setIsProcessingAsset] = useState(false);
  const assetRequestIdRef = useRef(0);
  const unsavedAssetIdRef = useRef<string | null>(null);
  const existingAssetPreview = useAssetPreview(payload?.imageAssetId ?? null, {
    previewAssetId: payload?.thumbnailAssetId ?? null
  });

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

  const revokePreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

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

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    unsavedAssetIdRef.current = unsavedAssetId;
  }, [unsavedAssetId]);

  useEffect(() => {
    return () => {
      const pendingId = unsavedAssetIdRef.current;
      if (pendingId) {
        void deleteAsset(pendingId);
      }
    };
  }, []);

  const currentPreview = previewUrl ?? existingAssetPreview.url ?? payload?.thumbnailUrl ?? null;
  const previewType = selectedFile?.type ?? existingAssetPreview.type ?? (currentPreview ? 'image/*' : null);
  const isImagePreview = Boolean(previewType && previewType.startsWith('image/'));
  const isVideoPreview = Boolean(previewType && previewType.startsWith('video/'));
  const isAudioPreview = Boolean(previewType && previewType.startsWith('audio/'));

  const handleFileChange = async (file: File | null) => {
    revokePreview();

    if (!file) {
      const requestId = assetRequestIdRef.current + 1;
      assetRequestIdRef.current = requestId;
      setSelectedFile(null);
      if (unsavedAssetId) {
        await deleteAsset(unsavedAssetId);
        setUnsavedAssetId(null);
        unsavedAssetIdRef.current = null;
      }
      setCurrentAssetId(initialState.assetId ?? null);
      setCurrentThumbnailAssetId(initialState.thumbnailAssetId ?? null);
      setIsProcessingAsset(false);
      return;
    }

    const requestId = assetRequestIdRef.current + 1;
    assetRequestIdRef.current = requestId;
    setIsProcessingAsset(true);
    setSelectedFile(file);
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);

    try {
      if (unsavedAssetId) {
        await deleteAsset(unsavedAssetId);
        setUnsavedAssetId(null);
        unsavedAssetIdRef.current = null;
      }
      const record = await saveAsset(file);
      if (assetRequestIdRef.current !== requestId) {
        await deleteAsset(record.id);
        return;
      }
      setUnsavedAssetId(record.id);
      unsavedAssetIdRef.current = record.id;
      setCurrentAssetId(record.id);
      setCurrentThumbnailAssetId(record.previewId ?? null);
    } catch (error) {
      console.error('ファイルの保存に失敗しました', error);
      if (assetRequestIdRef.current === requestId) {
        setSelectedFile(null);
        setCurrentAssetId(initialState.assetId ?? null);
        setCurrentThumbnailAssetId(initialState.thumbnailAssetId ?? null);
        revokePreview();
      }
    } finally {
      if (assetRequestIdRef.current === requestId) {
        setIsProcessingAsset(false);
      }
    }
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    void handleFileChange(file);
    event.target.value = '';
  };

  const handleClearImage = () => {
    void handleFileChange(null);
  };

  const hasChanges =
    name !== initialState.name ||
    rarityId !== initialState.rarityId ||
    pickupTarget !== initialState.pickup ||
    completeTarget !== initialState.complete ||
    riaguTarget !== initialState.riagu ||
    (currentAssetId ?? null) !== (initialState.assetId ?? null) ||
    (currentThumbnailAssetId ?? null) !== (initialState.thumbnailAssetId ?? null);

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
      riagu: riaguTarget,
      imageAssetId: currentAssetId ?? null,
      thumbnailAssetId: currentThumbnailAssetId ?? null
    });

    if (unsavedAssetId) {
      setUnsavedAssetId(null);
      unsavedAssetIdRef.current = null;
    }
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

  const renderFileSelectionContent = () => (
    <>
      <p className="text-sm font-medium text-surface-foreground">メディアファイルを選択</p>
      <p className="mt-2 text-xs text-muted-foreground">
        画像（PNG / JPG / WEBP）に加え、動画や音声ファイルも登録できます。
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <label className="inline-flex items-center gap-2 rounded-xl border border-accent/60 bg-accent/20 px-3 py-2 text-sm font-semibold text-accent">
          <PlusCircleIcon className="h-4 w-4" />
          ファイルを選ぶ
          <input
            type="file"
            accept="image/*,video/*,audio/*,.m4a,audio/mp4"
            className="sr-only"
            onChange={handleFileInputChange}
          />
        </label>
        {selectedFile ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-xs text-muted-foreground transition hover:border-accent/60 hover:text-surface-foreground"
            onClick={handleClearImage}
          >
            <XMarkIcon className="h-4 w-4" />
            取り消す
          </button>
        ) : null}
      </div>
      {selectedFile ? (
        <p className="mt-2 text-xs text-muted-foreground">選択中: {selectedFile.name}</p>
      ) : existingAssetPreview.name ? (
        <p className="mt-2 text-xs text-muted-foreground">現在のファイル: {existingAssetPreview.name}</p>
      ) : null}
      {isProcessingAsset ? (
        <p className="mt-1 text-[11px] text-accent">ファイルを保存しています…</p>
      ) : null}
    </>
  );

  return (
    <>
      <ModalBody className="rounded-2xl p-2">
        <div className="flex flex-row items-end gap-4 lg:justify-between">
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
          <div className="flex min-w-[11rem] shrink-0 flex-col gap-2 lg:max-w-[14rem]">
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
          <div className="space-y-5">
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
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-surface-foreground">{name || '未設定'}</p>
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
                    <div className="space-y-2 lg:hidden">{renderFileSelectionContent()}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="hidden rounded-2xl p-3 lg:block">{renderFileSelectionContent()}</div>
            <div className="rounded-2xl p-2">
              <div className="flex flex-col gap-3">
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
        画像を保存すると、自動的にカタログの該当アイテムへ反映されます。ZIP出力時は最新の画像が含まれます。
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
