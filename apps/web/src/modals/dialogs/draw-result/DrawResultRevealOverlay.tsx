import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

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
 * @returns 画面全体に重ねて表示する演出 UI
 */
export function DrawResultRevealOverlay({
  cards,
  revealedCount,
  isAnimating,
  onSkip,
  onClose
}: DrawResultRevealOverlayProps): JSX.Element {
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null)
  const [viewport, setViewport] = useState(() => {
    if (typeof window === 'undefined') {
      return { width: 1366, height: 768 }
    }

    return { width: window.innerWidth, height: window.innerHeight }
  })

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    setPortalElement(document.body)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const updateViewport = (): void => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }

    updateViewport()
    window.addEventListener('resize', updateViewport)

    return () => {
      window.removeEventListener('resize', updateViewport)
    }
  }, [])

  const visibleCards = useMemo(() => {
    const safeCount = Math.max(0, Math.min(revealedCount, cards.length))
    return cards.slice(0, safeCount)
  }, [cards, revealedCount])

  const totalQuantity = useMemo(() => {
    return cards.reduce((total, card) => total + card.quantity, 0)
  }, [cards])

  const overlayStyle = useMemo<CSSProperties>(() => {
    const totalCards = Math.max(1, cards.length)
    const defaultCardSize = 118
    const minMobileCardSize = 64
    const mobileBreakpoint = 768
    const availableWidth = Math.max(240, viewport.width - 40)
    const availableHeight = Math.max(220, viewport.height - 40 - 136)
    const horizontalGap = 12
    const verticalGap = 14
    const cardMetaHeight = 30

    if (viewport.width >= mobileBreakpoint) {
      return {
        '--draw-result-card-size': `${defaultCardSize}px`
      } as CSSProperties
    }

    const estimateContentHeight = (cardSize: number): number => {
      const columns = Math.max(1, Math.floor((availableWidth + horizontalGap) / (cardSize + horizontalGap)))
      const rows = Math.ceil(totalCards / columns)
      const cardBlockHeight = cardSize + cardMetaHeight
      return rows * cardBlockHeight + Math.max(0, rows - 1) * verticalGap
    }

    const willOverflowAtDefaultSize = estimateContentHeight(defaultCardSize) > availableHeight
    const mobileCardSize = willOverflowAtDefaultSize ? minMobileCardSize : defaultCardSize

    return {
      '--draw-result-card-size': `${mobileCardSize}px`
    } as CSSProperties
  }, [cards.length, viewport.height, viewport.width])

  if (!portalElement) {
    return null
  }

  return createPortal(
    <section
      id="draw-gacha-result-overlay"
      className="draw-gacha-result-overlay fixed inset-0 z-[80]"
      aria-label="ガチャ結果の演出表示"
      style={overlayStyle}
    >
      <div className="draw-gacha-result-overlay__backdrop absolute inset-0 bg-black/65 backdrop-blur-sm" aria-hidden="true" />

      <div className="draw-gacha-result-overlay__content relative z-[1] flex h-full min-h-0 flex-col p-3 sm:p-4">
        <div className="draw-gacha-result-overlay__header mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-white/30 pb-2 text-white">
          <div className="draw-gacha-result-overlay__title-group space-y-1">
            <h3 className="draw-gacha-result-overlay__title text-sm font-semibold text-white">抽選結果表示</h3>
            <div className="draw-gacha-result-overlay__summary flex flex-wrap items-center gap-2 text-xs text-white/90">
              <span className="draw-gacha-result-overlay__progress inline-flex items-center rounded-full border border-white/45 bg-black/25 px-2 py-0.5">
                表示カード {visibleCards.length}/{cards.length}
              </span>
              <span className="draw-gacha-result-overlay__total inline-flex items-center rounded-full border border-white/45 bg-black/25 px-2 py-0.5">
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
                className="draw-gacha-result-overlay__skip-button inline-flex h-8 items-center rounded-md border border-white/45 bg-black/25 px-3 text-xs font-medium text-white transition hover:bg-black/45"
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

        <div className="draw-gacha-result-overlay__grid min-h-0 flex-1 content-start overflow-y-auto overflow-x-hidden pb-2 pr-1">
          {visibleCards.map((card) => (
            <div key={`${card.itemId}-${card.revealIndex}`} className="draw-gacha-result-overlay__grid-item">
              <DrawResultRevealCard card={card} />
            </div>
          ))}
        </div>
      </div>
    </section>,
    portalElement
  )
}
