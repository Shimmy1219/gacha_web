import { PhotoIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

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

export interface ItemCardProps {
  model: ItemCardModel;
  rarity: RarityMeta;
  onToggleRiagu?: (itemId: ItemId) => void;
  onEditImage?: (itemId: ItemId) => void;
}

export function ItemCard({ model, rarity, onEditImage }: ItemCardProps): JSX.Element {
  const { imageAsset } = model;
  const hasImage = Boolean(imageAsset?.hasImage && imageAsset?.thumbnailUrl);

  return (
    <article
      data-item-id={model.itemId}
      data-riagu={model.isRiagu}
      className={clsx(
        'item-card group relative overflow-visible rounded-2xl border border-white/5 bg-surface/20 p-[10px] shadow-[0_12px_32px_rgba(0,0,0,0.5)] transition hover:border-accent/60',
        model.isRiagu && 'ring-1 ring-inset ring-accent/60'
      )}
    >
      <div
        className="absolute flex flex-col items-end gap-2"
        style={{ top: '-0.3rem', right: '-0.3rem' }}
      >
        {model.completeTarget ? <span className="badge badge--status badge--status-complete">完走対象</span> : null}
        {model.pickupTarget ? <span className="badge badge--status badge--status-pickup">ピックアップ</span> : null}
        {model.isRiagu ? <span className="badge badge--status badge--status-riagu">リアグ</span> : null}
      </div>
      <div className="space-y-3">
        <div
          className={clsx(
            'flex aspect-square items-center justify-center rounded-xl border border-border/60 bg-[#1b1b22] text-muted-foreground',
            hasImage && 'border-transparent'
          )}
          style={
            hasImage
              ? {
                  backgroundImage: `url(${imageAsset.thumbnailUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }
              : undefined
          }
        >
          {!hasImage ? <PhotoIcon className="h-10 w-10" /> : null}
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-surface-foreground">{model.name}</h3>
          <span className="text-[11px] font-medium" style={{ color: rarity.color }}>
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
}
