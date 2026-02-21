import { PhotoIcon, VideoCameraIcon } from '@heroicons/react/24/outline'

import { RarityLabel } from '../../../components/RarityLabel'
import { useAssetPreview } from '../../../features/assets/useAssetPreview'

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

  return (
    <article className="draw-gacha-result-card draw-gacha-result-card--reveal">
      <div className="draw-gacha-result-card__thumb-wrapper relative">
        <span className="draw-gacha-result-card__rarity absolute left-1.5 top-1.5 z-[1] inline-flex max-w-[calc(100%-1.25rem)] items-center rounded-full border border-white/45 bg-black/25 px-2 py-0.5 text-[10px] font-semibold text-white">
          <RarityLabel label={card.rarityLabel} color={card.rarityColor} className="max-w-full text-[10px] font-semibold" />
        </span>
        <div className="draw-gacha-result-card__thumb flex items-center justify-center overflow-hidden bg-transparent">
          {isAudio ? (
            <div className="draw-gacha-result-card__audio-placeholder flex h-full w-full items-center justify-center" aria-label="音声アイテム">
              <span className="draw-gacha-result-card__audio-symbol text-3xl font-bold text-white">♫</span>
            </div>
          ) : hasImagePreview && preview.url ? (
            <img
              src={preview.url}
              alt={card.name}
              loading="lazy"
              decoding="async"
              className="draw-gacha-result-card__image h-full w-full object-contain"
            />
          ) : isVideo ? (
            <VideoCameraIcon className="draw-gacha-result-card__video-icon h-9 w-9 text-white/80" aria-hidden="true" />
          ) : (
            <PhotoIcon className="draw-gacha-result-card__photo-icon h-9 w-9 text-white/80" aria-hidden="true" />
          )}
        </div>
        <span className="draw-gacha-result-card__quantity-badge rounded-full border border-white/40 bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white">
          ×{card.quantity}
        </span>
        {card.guaranteedQuantity > 0 ? (
          <span className="draw-gacha-result-card__guaranteed-badge absolute right-1.5 top-1.5 rounded-full border border-amber-300/45 bg-amber-300/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100">
            保証×{card.guaranteedQuantity}
          </span>
        ) : null}
      </div>

      <div className="draw-gacha-result-card__meta mt-2 space-y-1 text-white">
        <span className="draw-gacha-result-card__name block truncate text-xs font-medium text-white" title={card.name}>
          {card.name}
        </span>
      </div>
    </article>
  )
}
