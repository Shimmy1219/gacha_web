import { MusicalNoteIcon, PhotoIcon, VideoCameraIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { forwardRef, type MouseEvent as ReactMouseEvent } from 'react';

import { getRarityTextPresentation } from '../../features/rarity/utils/rarityColorPresentation';
import { useAssetPreview } from '../../features/assets/useAssetPreview';

export type ItemId = string;
export type GachaId = string;
export type RarityId = string;

export interface RarityMeta {
  rarityId: RarityId;
  label: string;
  color: string;
  emitRate?: string;
  rarityNum?: number;
}

export interface ItemCardImageAsset {
  thumbnailUrl: string | null;
  assetHash: string | null;
  hasImage: boolean;
}

export interface ItemCardModel {
  itemId: ItemId;
  gachaId: GachaId;
  gachaDisplayName: string;
  rarityId: RarityId;
  name: string;
  imageAsset: ItemCardImageAsset;
  isRiagu: boolean;
  completeTarget: boolean;
  pickupTarget: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ItemCardPreviewPayload {
  itemId: ItemId;
  itemName: string;
  gachaId: GachaId;
  gachaDisplayName: string;
  assetHash: string | null;
  thumbnailUrl: string | null;
}

export interface ItemCardProps {
  model: ItemCardModel;
  rarity: RarityMeta;
  onToggleRiagu?: (itemId: ItemId) => void;
  onEditImage?: (itemId: ItemId) => void;
  onPreviewAsset?: (payload: ItemCardPreviewPayload) => void;
  isSelected?: boolean;
  onCardMouseDown?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onCardContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

export const ItemCard = forwardRef<HTMLDivElement, ItemCardProps>(function ItemCard(
  { model, rarity, onEditImage, onPreviewAsset, isSelected = false, onCardMouseDown, onCardContextMenu },
  ref
): JSX.Element {
  const { imageAsset } = model;
  const preview = useAssetPreview(imageAsset?.assetHash ?? null);
  const isImageAsset = Boolean(preview.type?.startsWith('image/'));
  const isVideoAsset = Boolean(preview.type?.startsWith('video/'));
  const isAudioAsset = Boolean(preview.type?.startsWith('audio/'));
  const fallbackUrl = imageAsset?.thumbnailUrl ?? null;
  const previewUrl = preview.url ?? fallbackUrl;
  const hasImage = Boolean(imageAsset?.hasImage && (isImageAsset ? previewUrl : fallbackUrl));
  const canPreviewAsset = Boolean(onPreviewAsset && (previewUrl || fallbackUrl));
  const { className: rarityClassName, style: rarityStyle } = getRarityTextPresentation(rarity.color);

  const handlePreviewClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      return;
    }

    if (!canPreviewAsset) {
      return;
    }

    onPreviewAsset?.({
      itemId: model.itemId,
      itemName: model.name,
      gachaId: model.gachaId,
      gachaDisplayName: model.gachaDisplayName,
      assetHash: imageAsset?.assetHash ?? null,
      thumbnailUrl: fallbackUrl
    });
  };

  return (
    <article
      data-item-id={model.itemId}
      data-riagu={model.isRiagu}
      data-selected={isSelected ? 'true' : undefined}
      className={clsx(
        'item-card group relative overflow-visible rounded-2xl border border-white/5 bg-[rgb(var(--site-color-8)_/_0.2)] p-[10px] transition hover:border-accent/60',
        model.isRiagu && 'ring-1 ring-inset ring-accent/60',
        isSelected && 'ring-2 ring-offset-2 ring-offset-[#09090f] ring-accent/70'
      )}
      ref={ref}
      onMouseDown={onCardMouseDown}
      onContextMenu={onCardContextMenu}
    >
      <div
        className="absolute z-10 flex flex-col items-end gap-2"
        style={{ top: '-0.3rem', right: '-0.3rem' }}
      >
        {model.completeTarget ? <span className="badge badge--status badge--status-complete">完走対象</span> : null}
        {model.pickupTarget ? <span className="badge badge--status badge--status-pickup">ピックアップ</span> : null}
        {model.isRiagu ? <span className="badge badge--status badge--status-riagu">リアグ</span> : null}
      </div>
      <div className="space-y-3">
        <button
          type="button"
          onClick={handlePreviewClick}
          disabled={!canPreviewAsset}
          aria-label={canPreviewAsset ? `${model.name}のプレビューを開く` : undefined}
          title={canPreviewAsset ? 'クリックしてプレビューを拡大' : undefined}
          className={clsx(
            'flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-panel-muted text-muted-foreground transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-deep disabled:cursor-default disabled:opacity-90',
            hasImage && isImageAsset && previewUrl && 'border-transparent',
            canPreviewAsset && 'cursor-zoom-in'
          )}
          data-preview-button="true"
        >
          {isImageAsset && previewUrl ? (
            <img src={previewUrl} alt={model.name} className="h-full w-full object-contain" />
          ) : isVideoAsset ? (
            <VideoCameraIcon className="h-10 w-10" />
          ) : isAudioAsset ? (
            <MusicalNoteIcon className="h-10 w-10" />
          ) : (
            <PhotoIcon className="h-10 w-10" />
          )}
        </button>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-surface-foreground">{model.name}</h3>
          <span className={clsx('text-[11px] font-medium', rarityClassName)} style={rarityStyle}>
            {rarity.label}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            className="badge badge--action"
            onClick={() => onEditImage?.(model.itemId)}
          >
            画像を設定
          </button>
        </div>
      </div>
    </article>
  );
});
