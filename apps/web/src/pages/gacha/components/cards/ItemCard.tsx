import { clsx } from 'clsx';
import { forwardRef, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';

import { getRarityTextPresentation } from '../../../../features/rarity/utils/rarityColorPresentation';
import { useResponsiveDashboard } from '../dashboard/useResponsiveDashboard';
import { ItemPreviewButton } from '../../../../components/ItemPreviewThumbnail';

export type ItemId = string;
export type GachaId = string;
export type RarityId = string;

export interface RarityMeta {
  rarityId: RarityId;
  label: string;
  color: string;
  emitRate?: number;
  rarityNum?: number;
  itemRate?: number;
  itemRateDisplay?: string;
}

export interface ItemCardImageAsset {
  thumbnailUrl: string | null;
  thumbnailAssetId: string | null;
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
  thumbnailAssetId: string | null;
  thumbnailUrl: string | null;
}

export interface ItemCardProps {
  model: ItemCardModel;
  rarity: RarityMeta;
  rarityRateLabel?: string;
  onToggleRiagu?: (itemId: ItemId) => void;
  onEditImage?: (itemId: ItemId) => void;
  onPreviewAsset?: (payload: ItemCardPreviewPayload) => void;
  isSelected?: boolean;
  onCardMouseDown?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onCardContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

export const ItemCard = forwardRef<HTMLDivElement, ItemCardProps>(function ItemCard(
  {
    model,
    rarity,
    rarityRateLabel,
    onEditImage,
    onPreviewAsset,
    isSelected = false,
    onCardMouseDown,
    onCardContextMenu
  },
  ref
): JSX.Element {
  const { imageAsset } = model;
  const { isMobile } = useResponsiveDashboard();
  const assetId = imageAsset?.assetHash ?? null;
  const previewAssetId = imageAsset?.thumbnailAssetId ?? null;
  const fallbackUrl = imageAsset?.thumbnailUrl ?? null;
  const canPreviewAsset = Boolean(onPreviewAsset && (assetId || previewAssetId || fallbackUrl));
  const { className: rarityClassName, style: rarityStyle } = getRarityTextPresentation(rarity.color);
  const rarityTextStyle: CSSProperties = {
    display: 'inline-block',
    maxWidth: 'fit-content',
    ...(rarityStyle ?? {})
  };

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
      assetHash: assetId,
      thumbnailAssetId: previewAssetId,
      thumbnailUrl: fallbackUrl
    });
  };

  const rateDisplay = rarityRateLabel ?? rarity.itemRateDisplay ?? '';
  const hasRate = rateDisplay.trim().length > 0;

  return (
    <article
      data-item-id={model.itemId}
      data-riagu={model.isRiagu}
      data-selected={isSelected ? 'true' : undefined}
      className={clsx(
        'item-card group/item relative overflow-visible rounded-2xl border border-border/60 bg-[var(--color-item-card)] p-[10px] shadow-sm transition-colors hover:border-accent/60 hover:bg-panel-muted',
        model.isRiagu && 'ring-1 ring-inset ring-accent/60',
        isSelected && 'ring-2 ring-offset-2 ring-offset-[rgb(var(--color-surface-deep)/1)] ring-accent/70'
      )}
      ref={ref}
      onMouseDown={onCardMouseDown}
      onContextMenu={onCardContextMenu}
    >
      <div
        className="absolute z-10 flex flex-col items-end gap-2"
        style={{ top: '-0.3rem', right: '-0.3rem' }}
      >
        {model.completeTarget ? <span className="badge badge--status badge--status-complete">コンプ対象</span> : null}
        {model.pickupTarget ? <span className="badge badge--status badge--status-pickup">ピックアップ</span> : null}
        {model.isRiagu ? <span className="badge badge--status badge--status-riagu">リアグ</span> : null}
      </div>
      <div
        className={clsx(
          'flex gap-3',
          isMobile ? 'flex-row items-start' : 'flex-col'
        )}
      >
        <ItemPreviewButton
          onClick={handlePreviewClick}
          canPreview={canPreviewAsset}
          assetId={assetId}
          previewAssetId={previewAssetId}
          fallbackUrl={fallbackUrl}
          alt={model.name}
          emptyLabel="noImage"
          aria-label={canPreviewAsset ? `${model.name}のプレビューを開く` : undefined}
          title={canPreviewAsset ? 'クリックしてプレビューを拡大' : undefined}
          className={clsx(isMobile ? 'h-24 w-24 flex-shrink-0' : 'w-full')}
        />
        <div className={clsx('flex flex-1 flex-col', isMobile ? 'gap-1' : 'gap-3')}>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-surface-foreground">{model.name}</h3>
            <span
              className={clsx(
                'flex text-[11px] font-medium text-surface-foreground',
                isMobile ? 'flex-col gap-1' : 'items-baseline justify-between gap-2'
              )}
            >
              <span className={clsx('truncate', rarityClassName)} style={rarityTextStyle}>
                {rarity.label}
              </span>
              <span
                className={clsx(
                  'text-[10px] font-normal text-muted-foreground tabular-nums',
                  isMobile ? 'ml-0 text-left' : 'ml-2 shrink-0 text-right'
                )}
              >
                {hasRate ? rateDisplay : '—'}
              </span>
            </span>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              className="badge badge--action"
              onClick={() => onEditImage?.(model.itemId)}
            >
              詳細設定
            </button>
          </div>
        </div>
      </div>
    </article>
  );
});
