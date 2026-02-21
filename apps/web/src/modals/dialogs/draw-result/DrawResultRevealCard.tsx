import { PhotoIcon, VideoCameraIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'

import { useAssetPreview } from '../../../features/assets/useAssetPreview'
import { getRarityTextPresentation } from '../../../features/rarity/utils/rarityColorPresentation'

import type { DrawResultRevealCardModel } from './revealCards'

export interface DrawResultRevealCardProps {
  card: DrawResultRevealCardModel
}

/**
 * ガチャ結果演出で表示するサムネイルカード。
 * 画像・動画・音声で表示を切り替え、常時 `×N` の倍率バッジを表示する。
 *
 * @param props 演出カードデータ
 * @returns 結果演出カード要素
 */
export function DrawResultRevealCard({ card }: DrawResultRevealCardProps): JSX.Element {
  const preview = useAssetPreview(card.assetId, {
    previewAssetId: card.thumbnailAssetId
  })

  const previewType = preview.type ?? preview.previewType ?? null
  const hasImagePreview = Boolean(preview.url) && !previewType?.startsWith('audio/')
  const isAudio = card.digitalItemType === 'audio' || Boolean(previewType?.startsWith('audio/'))
  const isVideo = Boolean(previewType?.startsWith('video/'))
  const { className: rarityTextClassName, style: rarityTextStyle } = getRarityTextPresentation(card.rarityColor)

  return (
    <article className="draw-gacha-result-card draw-gacha-result-card--reveal rounded-xl border border-border/60 bg-surface-alt/90 p-2">
      <div className="draw-gacha-result-card__thumb-wrapper relative">
        <div className="draw-gacha-result-card__thumb flex items-center justify-center overflow-hidden rounded-lg border border-border/50 bg-panel-muted">
          {isAudio ? (
            <div className="draw-gacha-result-card__audio-placeholder flex h-full w-full items-center justify-center" aria-label="音声アイテム">
              <span className="draw-gacha-result-card__audio-symbol text-3xl font-bold text-muted-foreground">♫</span>
            </div>
          ) : hasImagePreview && preview.url ? (
            <img
              src={preview.url}
              alt={card.name}
              loading="lazy"
              decoding="async"
              className="draw-gacha-result-card__image h-full w-full object-cover"
            />
          ) : isVideo ? (
            <VideoCameraIcon className="draw-gacha-result-card__video-icon h-9 w-9 text-muted-foreground" aria-hidden="true" />
          ) : (
            <PhotoIcon className="draw-gacha-result-card__photo-icon h-9 w-9 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <span className="draw-gacha-result-card__quantity-badge rounded-full border border-black/10 bg-black/75 px-2 py-0.5 text-[11px] font-semibold text-white">
          ×{card.quantity}
        </span>
        {card.guaranteedQuantity > 0 ? (
          <span className="draw-gacha-result-card__guaranteed-badge absolute left-1.5 top-1.5 rounded-full border border-amber-500/35 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
            保証×{card.guaranteedQuantity}
          </span>
        ) : null}
      </div>

      <div className="draw-gacha-result-card__meta mt-2 space-y-1">
        <span
          className={clsx(
            'draw-gacha-result-card__rarity inline-flex items-center rounded-full border border-border/50 px-2 py-0.5 text-[10px] font-semibold',
            rarityTextClassName
          )}
          style={rarityTextStyle}
        >
          {card.rarityLabel}
        </span>
        <span className="draw-gacha-result-card__name block truncate text-xs font-medium text-surface-foreground" title={card.name}>
          {card.name}
        </span>
      </div>
    </article>
  )
}
