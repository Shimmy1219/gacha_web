import { ArrowPathIcon, ExclamationTriangleIcon, PlusCircleIcon, PlusIcon } from '@heroicons/react/24/outline';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import type { ReceiveMediaItem } from '../../pages/receive/types';
import { useReceiveIconRegistry } from '../../pages/receive/hooks/useReceiveIconRegistry';
import { loadAsset, type StoredAssetRecord } from '@domain/assets/assetStorage';
import { saveReceiveItem } from '../../pages/receive/receiveSave';
import { ReceiveIconSettingsDialog } from './ReceiveIconSettingsDialog';

export interface IconRingWearDialogPayload {
  ringItem: ReceiveMediaItem;
}

type DrawableImage = ImageBitmap | HTMLImageElement;

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

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: DrawableImage,
  canvasWidth: number,
  canvasHeight: number
): void {
  const { width: imageWidth, height: imageHeight } = getDrawableSize(image);
  if (imageWidth <= 0 || imageHeight <= 0) {
    return;
  }

  const scale = Math.max(canvasWidth / imageWidth, canvasHeight / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const dx = (canvasWidth - drawWidth) / 2;
  const dy = (canvasHeight - drawHeight) / 2;
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
  const [composites, setComposites] = useState<
    Array<{ iconAssetId: string; previewUrl: string; blob: Blob; downloadName: string }>
  >([]);
  const urlsRef = useRef<string[]>([]);

  const ringItemName = useMemo(() => {
    const base = ringItem?.metadata?.itemName ?? ringItem?.filename ?? 'icon-ring';
    return base.trim() || 'icon-ring';
  }, [ringItem?.filename, ringItem?.metadata?.itemName]);

  const canGenerate = Boolean(ringItem && ringItem.kind === 'image' && iconAssetIds.length > 0);

  useEffect(() => {
    return () => {
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      urlsRef.current = [];
    };
  }, []);

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

        const nextComposites: Array<{ iconAssetId: string; previewUrl: string; blob: Blob; downloadName: string }> = [];
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

          // base icon -> ring overlay (ring size defines output size)
          drawCover(ctx, iconDrawable, canvasWidth, canvasHeight);
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
            downloadName
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
  }, [canGenerate, iconAssetIds, ringItem, ringItemName]);

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
