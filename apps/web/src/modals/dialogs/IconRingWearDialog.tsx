import { ArrowPathIcon, ExclamationTriangleIcon, PlusCircleIcon, PlusIcon } from '@heroicons/react/24/outline';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import type { ReceiveMediaItem } from '../../pages/receive/types';
import { useReceiveIconRegistry } from '../../pages/receive/hooks/useReceiveIconRegistry';
import { loadAsset, type StoredAssetRecord } from '@domain/assets/assetStorage';
import { saveReceiveItem } from '../../pages/receive/receiveSave';
import { ReceiveIconSettingsDialog } from './ReceiveIconSettingsDialog';
import { IconRingAdjustDialog, type IconRingAdjustResult } from './IconRingAdjustDialog';

export interface IconRingWearDialogPayload {
  ringItem: ReceiveMediaItem;
}

type DrawableImage = ImageBitmap | HTMLImageElement;

interface IconRingCompositeTransform {
  scale: number;
  offsetXRatio: number;
  offsetYRatio: number;
}

interface IconRingCompositeEntry {
  iconAssetId: string;
  previewUrl: string;
  blob: Blob;
  downloadName: string;
  transform: IconRingCompositeTransform;
}

interface IconRingCompositeTransformStorageSchema {
  version: 1;
  transforms: Record<string, IconRingCompositeTransform>;
}

const DEFAULT_ICON_RING_COMPOSITE_TRANSFORM: IconRingCompositeTransform = {
  scale: 1,
  offsetXRatio: 0,
  offsetYRatio: 0
};

const ICON_RING_COMPOSITE_SCALE_MIN = 0.6;
const ICON_RING_COMPOSITE_SCALE_MAX = 2.4;
const ICON_RING_COMPOSITE_OFFSET_RATIO_MIN = -1;
const ICON_RING_COMPOSITE_OFFSET_RATIO_MAX = 1;
const ICON_RING_COMPOSITE_TRANSFORM_STORAGE_KEY = 'receive-icon-ring-composite-transforms:v1';

function sanitizeFileComponent(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

function stripExtension(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) {
    return '';
  }
  const lastDotIndex = trimmed.lastIndexOf('.');
  if (lastDotIndex <= 0) {
    return trimmed;
  }
  return trimmed.slice(0, lastDotIndex);
}

function getDrawableSize(drawable: DrawableImage): { width: number; height: number } {
  if ('width' in drawable && 'height' in drawable) {
    return { width: drawable.width, height: drawable.height };
  }
  return { width: drawable.naturalWidth, height: drawable.naturalHeight };
}

async function loadDrawableFromBlob(blob: Blob): Promise<DrawableImage> {
  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(blob);
  }

  if (typeof Image === 'undefined' || typeof URL === 'undefined') {
    throw new Error('画像の読み込みに失敗しました（ブラウザ環境ではありません）');
  }

  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function closeDrawable(drawable: DrawableImage): void {
  if (typeof (drawable as ImageBitmap).close === 'function') {
    try {
      (drawable as ImageBitmap).close();
    } catch {
      // ignore
    }
  }
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function normalizeCompositeTransform(transform: Partial<IconRingCompositeTransform> | null | undefined): IconRingCompositeTransform {
  return {
    scale: clampNumber(transform?.scale ?? DEFAULT_ICON_RING_COMPOSITE_TRANSFORM.scale, ICON_RING_COMPOSITE_SCALE_MIN, ICON_RING_COMPOSITE_SCALE_MAX),
    offsetXRatio: clampNumber(
      transform?.offsetXRatio ?? DEFAULT_ICON_RING_COMPOSITE_TRANSFORM.offsetXRatio,
      ICON_RING_COMPOSITE_OFFSET_RATIO_MIN,
      ICON_RING_COMPOSITE_OFFSET_RATIO_MAX
    ),
    offsetYRatio: clampNumber(
      transform?.offsetYRatio ?? DEFAULT_ICON_RING_COMPOSITE_TRANSFORM.offsetYRatio,
      ICON_RING_COMPOSITE_OFFSET_RATIO_MIN,
      ICON_RING_COMPOSITE_OFFSET_RATIO_MAX
    )
  };
}

function loadPersistedCompositeTransforms(): Record<string, IconRingCompositeTransform> {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(ICON_RING_COMPOSITE_TRANSFORM_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Partial<IconRingCompositeTransformStorageSchema> | null;
    if (!parsed || parsed.version !== 1 || typeof parsed.transforms !== 'object' || !parsed.transforms) {
      return {};
    }

    const next: Record<string, IconRingCompositeTransform> = {};
    Object.entries(parsed.transforms).forEach(([iconAssetId, transform]) => {
      const normalizedId = iconAssetId.trim();
      if (!normalizedId) {
        return;
      }
      next[normalizedId] = normalizeCompositeTransform(transform);
    });

    return next;
  } catch (error) {
    console.warn('Failed to load icon ring composite transforms from localStorage', error);
    return {};
  }
}

function savePersistedCompositeTransforms(transforms: Record<string, IconRingCompositeTransform>): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    const normalizedTransforms: Record<string, IconRingCompositeTransform> = {};
    Object.entries(transforms).forEach(([iconAssetId, transform]) => {
      const normalizedId = iconAssetId.trim();
      if (!normalizedId) {
        return;
      }
      normalizedTransforms[normalizedId] = normalizeCompositeTransform(transform);
    });

    const payload: IconRingCompositeTransformStorageSchema = {
      version: 1,
      transforms: normalizedTransforms
    };
    window.localStorage.setItem(ICON_RING_COMPOSITE_TRANSFORM_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Failed to persist icon ring composite transforms to localStorage', error);
  }
}

function drawWhiteBackground(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: DrawableImage,
  canvasWidth: number,
  canvasHeight: number,
  transform: IconRingCompositeTransform
): void {
  const { width: imageWidth, height: imageHeight } = getDrawableSize(image);
  if (imageWidth <= 0 || imageHeight <= 0) {
    return;
  }

  const scale = Math.max(canvasWidth / imageWidth, canvasHeight / imageHeight) * transform.scale;
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const dx = (canvasWidth - drawWidth) / 2 + canvasWidth * transform.offsetXRatio;
  const dy = (canvasHeight - drawHeight) / 2 + canvasHeight * transform.offsetYRatio;
  ctx.drawImage(image as CanvasImageSource, dx, dy, drawWidth, drawHeight);
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  if (typeof canvas.toBlob === 'function') {
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error('PNGの生成に失敗しました'));
      }, 'image/png');
    });
  }

  const dataUrl = canvas.toDataURL('image/png');
  const response = await fetch(dataUrl);
  return await response.blob();
}

export function IconRingWearDialog({ payload, close, push }: ModalComponentProps<IconRingWearDialogPayload>): JSX.Element {
  const ringItem = payload?.ringItem;
  const { iconAssetIds, isProcessing: isRegistryProcessing, error: registryError } = useReceiveIconRegistry();
  const [status, setStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [composites, setComposites] = useState<Array<IconRingCompositeEntry>>([]);
  const [customTransforms, setCustomTransforms] = useState<Record<string, IconRingCompositeTransform>>(() =>
    loadPersistedCompositeTransforms()
  );
  const urlsRef = useRef<string[]>([]);

  const ringItemName = useMemo(() => {
    const base = ringItem?.metadata?.itemName ?? ringItem?.filename ?? 'icon-ring';
    return base.trim() || 'icon-ring';
  }, [ringItem?.filename, ringItem?.metadata?.itemName]);

  const canGenerate = Boolean(ringItem && ringItem.kind === 'image' && iconAssetIds.length > 0);

  // モーダルを閉じる時に object URL を必ず解放し、不要なメモリ保持を防ぐ。
  useEffect(() => {
    return () => {
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      urlsRef.current = [];
    };
  }, []);

  // 調節値をlocalStorageへ保存し、別モーダル起動時や再読み込み後も同じ見た目を再利用できるようにする。
  // 依存配列には customTransforms のみを置き、調節が変わった時だけ保存する。
  useEffect(() => {
    savePersistedCompositeTransforms(customTransforms);
  }, [customTransforms]);

  // リング画像、登録アイコン、または調節値が変わるたびにプレビューを再合成する。
  // 合成結果を object URL で保持するため、開始時に既存URLを破棄してから再生成する。
  useEffect(() => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current = [];
    setComposites([]);
    setError(null);

    if (!canGenerate) {
      setStatus('idle');
      return;
    }

    let active = true;

    const generate = async () => {
      setStatus('generating');

      try {
        const ringBlob = ringItem.blob;
        const ringDrawable = await loadDrawableFromBlob(ringBlob);
        const ringSize = getDrawableSize(ringDrawable);
        const canvasWidth = ringSize.width;
        const canvasHeight = ringSize.height;

        if (!Number.isFinite(canvasWidth) || !Number.isFinite(canvasHeight) || canvasWidth <= 0 || canvasHeight <= 0) {
          closeDrawable(ringDrawable);
          throw new Error('アイコンリング画像のサイズ取得に失敗しました。');
        }

        const nextComposites: Array<IconRingCompositeEntry> = [];
        const loadErrors: string[] = [];

        for (const iconAssetId of iconAssetIds) {
          if (!active) {
            break;
          }

          let iconAsset: StoredAssetRecord | null = null;
          try {
            iconAsset = await loadAsset(iconAssetId);
          } catch (loadError) {
            console.warn('Failed to load registered icon asset', loadError);
          }
          if (!iconAsset?.blob) {
            loadErrors.push(iconAssetId);
            continue;
          }

          const iconDrawable = await loadDrawableFromBlob(iconAsset.blob);

          const canvas = document.createElement('canvas');
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            closeDrawable(iconDrawable);
            continue;
          }

          const transform = normalizeCompositeTransform(customTransforms[iconAssetId]);

          // 最背面に白背景を敷いてから、アイコン本体とリングを重ねる。
          // こうすることで、透過画像同士を重ねても保存結果に透過が残らない。
          drawWhiteBackground(ctx, canvasWidth, canvasHeight);
          drawCover(ctx, iconDrawable, canvasWidth, canvasHeight, transform);
          ctx.drawImage(ringDrawable as CanvasImageSource, 0, 0, canvasWidth, canvasHeight);

          const blob = await canvasToPngBlob(canvas);
          const previewUrl = URL.createObjectURL(blob);
          urlsRef.current.push(previewUrl);

          const iconName = iconAsset.name ?? iconAssetId;
          const safeItem = sanitizeFileComponent(ringItemName) || 'item';
          const safeIcon = sanitizeFileComponent(stripExtension(iconName)) || 'icon';
          const downloadName = `${safeItem}_${safeIcon}.png`;

          nextComposites.push({
            iconAssetId,
            previewUrl,
            blob,
            downloadName,
            transform
          });

          closeDrawable(iconDrawable);
        }

        closeDrawable(ringDrawable);

        if (!active) {
          return;
        }

        if (nextComposites.length === 0) {
          throw new Error('合成プレビューを作成できませんでした。アイコン画像を登録し直してください。');
        }

        setComposites(nextComposites);
        if (loadErrors.length > 0) {
          setError('一部の登録アイコンを読み込めませんでした。');
          setStatus('ready');
          return;
        }
        setStatus('ready');
      } catch (composeError) {
        console.error('Failed to generate icon ring composites', composeError);
        if (!active) {
          return;
        }
        setError(composeError instanceof Error ? composeError.message : String(composeError));
        setStatus('error');
      }
    };

    void generate();

    return () => {
      active = false;
    };
  }, [canGenerate, customTransforms, iconAssetIds, ringItem, ringItemName]);

  const handleOpenIconSettings = () => {
    push(ReceiveIconSettingsDialog, {
      id: 'receive-icon-settings',
      title: 'アイコン設定',
      size: 'lg',
      payload: {
        autoOpenFilePicker: true
      }
    });
  };

  const handleOpenAdjustDialog = (entry: IconRingCompositeEntry) => {
    if (!ringItem || ringItem.kind !== 'image') {
      return;
    }

    push(IconRingAdjustDialog, {
      id: `icon-ring-adjust-${entry.iconAssetId}`,
      title: 'アイコンを調節',
      size: 'lg',
      payload: {
        ringItem,
        iconAssetId: entry.iconAssetId,
        initialTransform: entry.transform,
        onSave: (nextTransform: IconRingAdjustResult) => {
          setCustomTransforms((current) => ({
            ...current,
            [entry.iconAssetId]: normalizeCompositeTransform(nextTransform)
          }));
        }
      }
    });
  };

  const handleSaveComposite = async (entry: {
    iconAssetId: string;
    previewUrl: string;
    blob: Blob;
    downloadName: string;
  }) => {
    setSavingKey(entry.iconAssetId);
    setError(null);
    try {
      await saveReceiveItem({
        id: `icon-ring-composite-${entry.iconAssetId}`,
        path: '',
        filename: entry.downloadName,
        size: entry.blob.size,
        blob: entry.blob,
        kind: 'image',
        mimeType: entry.blob.type || 'image/png'
      });
    } catch (saveError) {
      console.error('Failed to save icon ring composite', saveError);
      setError('保存中にエラーが発生しました。もう一度お試しください。');
    } finally {
      setSavingKey((current) => (current === entry.iconAssetId ? null : current));
    }
  };

  if (!ringItem) {
    return (
      <>
        <ModalBody className="icon-ring-wear-dialog__body rounded-2xl bg-surface/20 p-0 md:pr-0">
          <div className="icon-ring-wear-dialog__error flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-500">
            <ExclamationTriangleIcon className="h-5 w-5" aria-hidden="true" />
            <span>アイコンリングの情報が見つかりません。</span>
          </div>
        </ModalBody>
        <ModalFooter className="icon-ring-wear-dialog__footer">
          <button type="button" className="icon-ring-wear-dialog__close-button btn btn-muted" onClick={close}>
            閉じる
          </button>
        </ModalFooter>
      </>
    );
  }

  const shouldPromptRegister = ringItem.kind !== 'image' || iconAssetIds.length === 0;

  return (
    <>
      <ModalBody className="icon-ring-wear-dialog__body rounded-2xl bg-surface/20 p-0 overflow-x-hidden md:pr-0">
        <div className="icon-ring-wear-dialog__header space-y-2">
          <p className="icon-ring-wear-dialog__target text-sm text-muted-foreground">
            対象アイテム: <span className="font-semibold text-surface-foreground">{ringItemName}</span>
          </p>
          {registryError ? (
            <div className="icon-ring-wear-dialog__registry-error rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
              {registryError}
            </div>
          ) : null}
        </div>

        {shouldPromptRegister ? (
          <div className="icon-ring-wear-dialog__empty mt-4 space-y-3 rounded-2xl border border-border/60 bg-surface/30 p-4">
            <p className="icon-ring-wear-dialog__empty-text text-sm text-muted-foreground">
              普段から利用しているIRIAMアイコンを登録すると、アイコンリングを即座に装着出来ます。
            </p>
            <button
              type="button"
              className="icon-ring-wear-dialog__open-settings-button btn btn-primary inline-flex items-center gap-2"
              onClick={handleOpenIconSettings}
              disabled={isRegistryProcessing}
            >
              <PlusCircleIcon className="h-4 w-4" />
              アイコンを登録する
            </button>
          </div>
        ) : null}

        {status === 'generating' ? (
          <div className="icon-ring-wear-dialog__loading mt-4 flex items-center gap-2 rounded-xl border border-border/60 bg-surface/30 px-4 py-3 text-sm text-muted-foreground">
            <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>合成プレビューを作成しています…</span>
          </div>
        ) : null}

        {error ? (
          <div className="icon-ring-wear-dialog__error-banner mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
            {error}
          </div>
        ) : null}

        {status === 'ready' && composites.length > 0 ? (
          <div className="icon-ring-wear-dialog__cards-scroll mt-4 overflow-x-auto pb-2 snap-x snap-mandatory overscroll-x-contain" aria-label="装着プレビュー一覧">
            <div className="icon-ring-wear-dialog__cards-track flex w-max gap-3">
              {composites.map((entry) => (
                <div
                  key={entry.iconAssetId}
                  className="icon-ring-wear-dialog__card w-40 flex-shrink-0 snap-start rounded-2xl border border-border/60 bg-surface/20 p-2"
                >
                  <div className="icon-ring-wear-dialog__preview-container aspect-square w-full overflow-hidden rounded-xl border border-border/60 bg-panel-muted/70">
                    <img
                      src={entry.previewUrl}
                      alt={entry.downloadName}
                      className="icon-ring-wear-dialog__preview-image h-full w-full object-contain"
                    />
                  </div>
                  <button
                    type="button"
                    className="icon-ring-wear-dialog__save-button btn btn-primary mt-2 h-9 w-full px-3 text-xs"
                    onClick={() => {
                      void handleSaveComposite(entry);
                    }}
                    disabled={savingKey === entry.iconAssetId}
                  >
                    {savingKey === entry.iconAssetId ? '保存中…' : '保存する'}
                  </button>
                  <button
                    type="button"
                    className="icon-ring-wear-dialog__adjust-button btn btn-muted mt-2 h-9 w-full px-3 text-xs"
                    onClick={() => {
                      handleOpenAdjustDialog(entry);
                    }}
                  >
                    調節する
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="icon-ring-wear-dialog__register-card icon-ring-wear-dialog__card icon-ring-wear-dialog__register-button w-40 flex-shrink-0 snap-start rounded-2xl border border-dashed border-rose-500/60 bg-rose-500/10 p-2 text-rose-500 transition hover:bg-rose-500/20"
                onClick={handleOpenIconSettings}
                disabled={isRegistryProcessing}
              >
                <div className="icon-ring-wear-dialog__register-preview-container aspect-square w-full overflow-hidden rounded-xl border border-rose-500/50 bg-rose-500/5">
                  <div className="icon-ring-wear-dialog__register-preview-inner flex h-full w-full items-center justify-center text-rose-500">
                    <PlusIcon className="icon-ring-wear-dialog__register-plus-icon h-12 w-12" aria-hidden="true" />
                  </div>
                </div>
                <span className="icon-ring-wear-dialog__register-label mt-2 block text-xs font-semibold">
                  アイコンを登録
                </span>
              </button>
            </div>
          </div>
        ) : null}
      </ModalBody>

      <ModalFooter className="icon-ring-wear-dialog__footer">
        <button type="button" className="icon-ring-wear-dialog__close-button btn btn-muted" onClick={close}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
