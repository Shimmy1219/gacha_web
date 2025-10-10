import { CheckCircleIcon, PhotoIcon, SparklesIcon, StarIcon, TrashIcon } from '@heroicons/react/24/outline';
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
  onToggleCompleteTarget?: (itemId: ItemId) => void;
  onTogglePickupTarget?: (itemId: ItemId) => void;
  onToggleRiagu?: (itemId: ItemId) => void;
  onEditImage?: (itemId: ItemId) => void;
  onRequestDelete?: (itemId: ItemId) => void;
}

export function ItemCard({
  model,
  rarity,
  onToggleCompleteTarget,
  onTogglePickupTarget,
  onToggleRiagu,
  onEditImage,
  onRequestDelete
}: ItemCardProps): JSX.Element {
  const { imageAsset } = model;
  const hasImage = Boolean(imageAsset?.hasImage && imageAsset?.thumbnailUrl);

  return (
    <article
      data-riagu={model.isRiagu}
      className={clsx(
        'relative overflow-hidden rounded-2xl border border-white/5 bg-surface/20 p-4 shadow-[0_12px_32px_rgba(0,0,0,0.5)] transition hover:border-accent/60',
        model.isRiagu && 'ring-1 ring-inset ring-accent/60'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="badge" style={{ color: rarity.color }}>
            {rarity.label}
          </span>
          {model.gachaDisplayName ? (
            <span className="chip border-border/60 text-[11px] text-muted-foreground">
              {model.gachaDisplayName}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {model.completeTarget ? <span className="chip border-emerald-400/40 bg-emerald-400/10 text-emerald-200">完走対象</span> : null}
          {model.pickupTarget ? <span className="chip border-amber-400/40 bg-amber-400/10 text-amber-200">ピックアップ</span> : null}
          {model.isRiagu ? (
            <span className="chip border-accent/40 bg-accent/10 text-accent">
              <SparklesIcon className="h-4 w-4" />
              リアグ
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <div
          className={clsx(
            'flex aspect-video items-center justify-center rounded-xl border border-border/60 bg-[#11111a] text-muted-foreground',
            hasImage && 'border-transparent'
          )}
          style={
            hasImage
              ? {
                  backgroundImage: `linear-gradient(135deg, rgba(255,47,93,0.55), rgba(12,12,20,0.9)), url(${imageAsset.thumbnailUrl})`,
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
          <p className="text-xs text-muted-foreground">{model.itemId}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            className="chip"
            onClick={() => onEditImage?.(model.itemId)}
          >
            画像を設定
          </button>
          <button
            type="button"
            className={clsx('chip', model.isRiagu && 'border-accent/40 bg-accent/10 text-accent')}
            data-active={model.isRiagu}
            onClick={() => onToggleRiagu?.(model.itemId)}
          >
            <SparklesIcon className="h-4 w-4" />
            リアグを設定
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => onRequestDelete?.(model.itemId)}
          >
            <TrashIcon className="h-4 w-4" />
            削除
          </button>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            className={clsx('chip', model.completeTarget && 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200')}
            data-active={model.completeTarget}
            onClick={() => onToggleCompleteTarget?.(model.itemId)}
          >
            <CheckCircleIcon className="h-4 w-4" />
            コンプリ対象
          </button>
          <button
            type="button"
            className={clsx('chip', model.pickupTarget && 'border-amber-400/40 bg-amber-400/10 text-amber-200')}
            data-active={model.pickupTarget}
            onClick={() => onTogglePickupTarget?.(model.itemId)}
          >
            <StarIcon className="h-4 w-4" />
            ピックアップ対象
          </button>
        </div>
      </div>
    </article>
  );
}
