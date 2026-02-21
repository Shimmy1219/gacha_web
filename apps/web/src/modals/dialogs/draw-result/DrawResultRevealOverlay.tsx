import { useMemo } from 'react'

import { DrawResultRevealCard } from './DrawResultRevealCard'
import type { DrawResultRevealCardModel } from './revealCards'

export interface DrawResultRevealOverlayProps {
  cards: DrawResultRevealCardModel[]
  revealedCount: number
  isAnimating: boolean
  onSkip: () => void
  onClose: () => void
}

/**
 * ガチャ結果サムネイル演出のオーバーレイ本体。
 *
 * @param props 演出カード配列と操作ハンドラ
 * @returns モーダル内に重ねて表示する演出 UI
 */
export function DrawResultRevealOverlay({
  cards,
  revealedCount,
  isAnimating,
  onSkip,
  onClose
}: DrawResultRevealOverlayProps): JSX.Element {
  const visibleCards = useMemo(() => {
    const safeCount = Math.max(0, Math.min(revealedCount, cards.length))
    return cards.slice(0, safeCount)
  }, [cards, revealedCount])

  const totalQuantity = useMemo(() => {
    return cards.reduce((total, card) => total + card.quantity, 0)
  }, [cards])

  return (
    <section
      id="draw-gacha-result-overlay"
      className="draw-gacha-result-overlay absolute inset-0 z-30"
      aria-label="ガチャ結果の演出表示"
    >
      <div className="draw-gacha-result-overlay__backdrop absolute inset-0 rounded-2xl bg-black/55" aria-hidden="true" />

      <div className="draw-gacha-result-overlay__panel relative flex h-full min-h-0 flex-col rounded-2xl border border-border/70 bg-overlay/85 p-3">
        <div className="draw-gacha-result-overlay__header mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-2">
          <div className="draw-gacha-result-overlay__title-group space-y-1">
            <h3 className="draw-gacha-result-overlay__title text-sm font-semibold text-surface-foreground">抽選結果表示</h3>
            <div className="draw-gacha-result-overlay__summary flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="draw-gacha-result-overlay__progress inline-flex items-center rounded-full border border-border/50 px-2 py-0.5">
                表示カード {visibleCards.length}/{cards.length}
              </span>
              <span className="draw-gacha-result-overlay__total inline-flex items-center rounded-full border border-border/50 px-2 py-0.5">
                総排出 ×{totalQuantity}
              </span>
            </div>
          </div>

          <div className="draw-gacha-result-overlay__actions flex items-center gap-2">
            {isAnimating ? (
              <button
                id="draw-gacha-result-skip-button"
                type="button"
                onClick={onSkip}
                className="draw-gacha-result-overlay__skip-button btn btn-muted !min-h-0 h-8 px-3 text-xs"
              >
                スキップ
              </button>
            ) : null}
            <button
              id="draw-gacha-result-close-button"
              type="button"
              onClick={onClose}
              className="draw-gacha-result-overlay__close-button btn btn-primary !min-h-0 h-8 px-3 text-xs"
            >
              閉じる
            </button>
          </div>
        </div>

        <div className="draw-gacha-result-overlay__grid min-h-0 flex-1 content-start overflow-y-auto overflow-x-hidden pr-1">
          {visibleCards.map((card) => (
            <div key={`${card.itemId}-${card.revealIndex}`} className="draw-gacha-result-overlay__grid-item">
              <DrawResultRevealCard card={card} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
