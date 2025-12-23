import { MusicalNoteIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { type ItemId } from '../../pages/gacha/components/cards/ItemCard';
import { useAssetPreview } from '../../features/assets/useAssetPreview';
import { getRarityTextPresentation } from '../../features/rarity/utils/rarityColorPresentation';

interface ItemAssetPreviewEntry {
  assetId: string;
  thumbnailAssetId?: string | null;
}

export interface ItemAssetPreviewDialogPayload {
  itemId: ItemId;
  itemName: string;
  gachaName: string;
  rarityLabel: string;
  rarityColor: string;
  assets?: ItemAssetPreviewEntry[];
  assetHash: string | null;
  thumbnailAssetId: string | null;
  thumbnailUrl: string | null;
}

function normalizeAssets(entries: ItemAssetPreviewEntry[] | null | undefined): ItemAssetPreviewEntry[] {
  if (!entries || entries.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: ItemAssetPreviewEntry[] = [];

  entries.forEach((entry) => {
    if (!entry?.assetId) {
      return;
    }
    if (seen.has(entry.assetId)) {
      return;
    }
    seen.add(entry.assetId);
    normalized.push({
      assetId: entry.assetId,
      thumbnailAssetId: entry.thumbnailAssetId ?? null
    });
  });

  return normalized;
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  if (index < 0) {
    return 0;
  }
  if (index >= length) {
    return length - 1;
  }
  return index;
}

interface AssetSlideProps {
  asset: ItemAssetPreviewEntry;
  itemName: string;
  isActive: boolean;
}

function AssetSlide({ asset, itemName, isActive }: AssetSlideProps): JSX.Element {
  const preview = useAssetPreview(asset.assetId, {
    loadOriginal: isActive,
    previewAssetId: asset.thumbnailAssetId ?? null
  });
  const previewUrl = preview.url ?? null;
  const previewType = preview.type ?? (previewUrl ? 'image/*' : null);
  const isImagePreview = Boolean(previewType && previewType.startsWith('image/'));
  const isVideoPreview = Boolean(previewType && previewType.startsWith('video/'));
  const isAudioPreview = Boolean(previewType && previewType.startsWith('audio/'));

  if (isImagePreview && previewUrl) {
    return (
      <div
        className="flex h-full w-full items-center justify-center transition-transform duration-200 ease-out will-change-transform"
      >
        <img
          src={previewUrl}
          alt={itemName}
          draggable={false}
          className="max-h-full w-auto max-w-full object-contain"
          style={{ transform: 'translateZ(0)' }}
        />
      </div>
    );
  }

  if (isVideoPreview && previewUrl) {
    return <video controls src={previewUrl} className="max-h-full w-full max-w-full rounded-xl bg-black" />;
  }

  if (isAudioPreview && previewUrl) {
    return (
      <div className="flex w-full max-w-2xl flex-col items-center gap-4">
        <MusicalNoteIcon className="h-16 w-16 text-muted-foreground" />
        <audio controls src={previewUrl} className="w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 text-muted-foreground">
      <PhotoIcon className="h-16 w-16" />
      <p className="text-sm">プレビューを表示できません。</p>
    </div>
  );
}

export function ItemAssetPreviewDialog({
  payload,
  close
}: ModalComponentProps<ItemAssetPreviewDialogPayload>): JSX.Element {
  if (!payload) {
    return (
      <>
        <ModalBody>
          <p className="text-sm text-muted-foreground">プレビュー情報を読み込めませんでした。</p>
        </ModalBody>
        <ModalFooter>
          <button type="button" className="btn btn-primary" onClick={close}>
            閉じる
          </button>
        </ModalFooter>
      </>
    );
  }

  const { assetHash, thumbnailAssetId, itemName, rarityColor, rarityLabel } = payload;
  const normalizedAssets = normalizeAssets(payload.assets);
  const assets =
    normalizedAssets.length > 0
      ? normalizedAssets
      : assetHash
        ? [{ assetId: assetHash, thumbnailAssetId: thumbnailAssetId ?? null }]
        : [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef<number | null>(null);
  const carouselRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveIndex((current) => clampIndex(current, assets.length));
  }, [assets.length]);

  const activeAsset = assets[activeIndex] ?? null;
  const preview = useAssetPreview(activeAsset?.assetId ?? null, {
    loadOriginal: true,
    previewAssetId: activeAsset?.thumbnailAssetId ?? null
  });
  const previewUrl = preview.url ?? null;
  const previewType = preview.type ?? (previewUrl ? 'image/*' : null);
  const isImagePreview = Boolean(previewType && previewType.startsWith('image/'));
  const isVideoPreview = Boolean(previewType && previewType.startsWith('video/'));
  const isAudioPreview = Boolean(previewType && previewType.startsWith('audio/'));
  const typeLabel = isImagePreview ? '画像' : isVideoPreview ? '動画' : isAudioPreview ? '音声' : '不明な形式';
  const assetName = preview.name ?? itemName;
  const assetIndexLabel = assets.length > 1 ? `${activeIndex + 1} / ${assets.length}` : null;
  const { className: rarityClassName, style: rarityStyle } = getRarityTextPresentation(rarityColor);

  const handleSelectIndex = useCallback(
    (index: number) => {
      setActiveIndex(clampIndex(index, assets.length));
      setDragOffset(0);
      setIsDragging(false);
      dragStartXRef.current = null;
    },
    [assets.length]
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (assets.length <= 1) {
        return;
      }
      dragStartXRef.current = event.clientX;
      setIsDragging(true);
      setDragOffset(0);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [assets.length]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDragging) {
        return;
      }
      const startX = dragStartXRef.current;
      if (startX == null) {
        return;
      }
      setDragOffset(event.clientX - startX);
    },
    [isDragging]
  );

  const finalizeSwipe = useCallback(
    (delta: number) => {
      if (assets.length <= 1) {
        return;
      }
      const width = carouselRef.current?.clientWidth ?? 280;
      const threshold = Math.max(40, Math.min(120, width * 0.2));
      if (Math.abs(delta) < threshold) {
        return;
      }
      handleSelectIndex(delta < 0 ? activeIndex + 1 : activeIndex - 1);
    },
    [activeIndex, assets.length, handleSelectIndex]
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDragging) {
        return;
      }
      const delta = dragOffset;
      setIsDragging(false);
      setDragOffset(0);
      dragStartXRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      finalizeSwipe(delta);
    },
    [dragOffset, finalizeSwipe, isDragging]
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDragging) {
        return;
      }
      setIsDragging(false);
      setDragOffset(0);
      dragStartXRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    [isDragging]
  );

  const trackStyle = {
    transform: `translateX(calc(-${activeIndex * 100}% + ${dragOffset}px))`,
    transition: isDragging ? 'none' : 'transform 320ms ease'
  } as const;

  return (
    <>
      <ModalBody className="flex flex-1 flex-col gap-6 space-y-0 overflow-y-auto">
        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{typeLabel}</span>
          {assetIndexLabel ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{assetIndexLabel}</span>
          ) : null}
          <span
            className={clsx('rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold', rarityClassName)}
            style={rarityStyle}
          >
            {rarityLabel}
          </span>
        </div>
        {assetName ? (
          <p className="text-sm text-muted-foreground">{assetName}</p>
        ) : null}
        <div
          ref={carouselRef}
          className={clsx(
            'relative flex h-[min(70vh,720px)] w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-surface-deep p-4',
            assets.length > 1 && 'cursor-grab active:cursor-grabbing'
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          style={{
            ...(assets.length > 1 ? { touchAction: 'pan-y' } : {})
          }}
        >
          {assets.length > 0 ? (
            <div
              className="flex h-full w-full"
              style={trackStyle}
            >
              {assets.map((asset, index) => (
                <div key={asset.assetId} className="flex h-full w-full flex-shrink-0 items-center justify-center">
                  <AssetSlide
                    asset={asset}
                    itemName={itemName}
                    isActive={index === activeIndex}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-muted-foreground">
              <PhotoIcon className="h-16 w-16" />
              <p className="text-sm">プレビューを表示できません。</p>
            </div>
          )}
        </div>
        {assets.length > 1 ? (
          <div className="flex items-center justify-center gap-2">
            {assets.map((asset, index) => (
              <button
                key={asset.assetId}
                type="button"
                className={clsx(
                  'h-2.5 w-2.5 rounded-full border border-surface-foreground/30 transition',
                  index === activeIndex
                    ? 'bg-surface-foreground/80'
                    : 'bg-surface-foreground/20 hover:bg-surface-foreground/40'
                )}
                aria-label={`${index + 1}枚目を表示`}
                onClick={() => handleSelectIndex(index)}
              />
            ))}
          </div>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-primary" onClick={close}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
