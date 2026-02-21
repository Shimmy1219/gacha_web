import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

import { DrawResultRevealCard } from './DrawResultRevealCard'
import type { DrawResultRevealCardModel } from './revealCards'

export interface DrawResultRevealOverlayProps {
  title: string
  cards: DrawResultRevealCardModel[]
  revealedCount: number
  isAnimating: boolean
  onSkip: () => void
  onClose: () => void
}

const DRAW_RESULT_COPY_IMAGE_MIME_TYPE = 'image/png'
const DRAW_RESULT_COPY_FEEDBACK_RESET_MS = 2000
const DRAW_RESULT_IMAGE_FETCH_TIMEOUT_MS = 8000
const DRAW_RESULT_IMAGE_WAIT_TIMEOUT_MS = 12000

/**
 * 画像の読み込み完了まで待機する。
 *
 * @param rootElement 画像要素を含むルート要素
 * @returns 全画像が load/error で完了した時点で resolve される Promise
 */
async function waitForImageCompletion(rootElement: HTMLElement): Promise<void> {
  const imageElements = Array.from(rootElement.querySelectorAll('img'))
  if (imageElements.length === 0) {
    return
  }

  await Promise.all(
    imageElements.map(
      (imageElement) =>
        new Promise<void>((resolve) => {
          // src が未設定の画像は load が発火しないため、待機対象から除外する。
          if (!imageElement.currentSrc && !imageElement.src) {
            resolve()
            return
          }

          if (imageElement.complete) {
            resolve()
            return
          }

          // オフスクリーン描画面でも確実に読み込みを開始させるため、コピー用途では eager を強制する。
          imageElement.loading = 'eager'
          imageElement.setAttribute('loading', 'eager')

          let timeoutId: ReturnType<typeof setTimeout> | null = null
          const handleDone = (): void => {
            if (timeoutId) {
              clearTimeout(timeoutId)
              timeoutId = null
            }
            imageElement.removeEventListener('load', handleDone)
            imageElement.removeEventListener('error', handleDone)
            resolve()
          }

          timeoutId = setTimeout(() => {
            imageElement.removeEventListener('load', handleDone)
            imageElement.removeEventListener('error', handleDone)
            resolve()
          }, DRAW_RESULT_IMAGE_WAIT_TIMEOUT_MS)

          imageElement.addEventListener('load', handleDone, { once: true })
          imageElement.addEventListener('error', handleDone, { once: true })
        })
    )
  )
}

/**
 * Blob を data URL へ変換する。
 *
 * @param blob 変換対象 Blob
 * @returns data URL 文字列
 */
function convertBlobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('画像データの変換に失敗しました。'))
    }
    reader.onerror = () => {
      reject(new Error('画像データの読み込みに失敗しました。'))
    }
    reader.readAsDataURL(blob)
  })
}

/**
 * 読み込み済みの画像要素を Canvas 描画で data URL 化する。
 * blob URL を fetch できない CSP 環境でも、表示済み画像から埋め込み用データを作るために利用する。
 *
 * @param imageElement 変換元の画像要素
 * @returns 変換済み data URL。変換できない場合は null
 */
function convertImageElementToDataUrl(imageElement: HTMLImageElement): string | null {
  const sourceUrl = imageElement.currentSrc || imageElement.src
  if (!sourceUrl) {
    return null
  }
  if (sourceUrl.startsWith('data:')) {
    return sourceUrl
  }
  if (!imageElement.complete || imageElement.naturalWidth <= 0 || imageElement.naturalHeight <= 0) {
    return null
  }

  const canvas = document.createElement('canvas')
  canvas.width = imageElement.naturalWidth
  canvas.height = imageElement.naturalHeight

  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }

  try {
    context.drawImage(imageElement, 0, 0)
    return canvas.toDataURL(DRAW_RESULT_COPY_IMAGE_MIME_TYPE)
  } catch {
    // cross-origin 制約で Canvas を読み出せない場合は、呼び出し側で別手段へフォールバックする。
    return null
  }
}

/**
 * 画像 URL を fetch して data URL 化する。
 *
 * @param sourceUrl 画像 URL
 * @param sourceImageElement 変換元画像要素（blob/data を直接解決するために使用）
 * @returns data URL。変換不可の場合は null
 */
async function resolveImageDataUrl(sourceUrl: string, sourceImageElement: HTMLImageElement): Promise<string | null> {
  if (!sourceUrl) {
    return null
  }

  // まずは描画済み画像から直接 data URL を作る。これにより blob URL の fetch を回避できる。
  const resolvedFromElement = convertImageElementToDataUrl(sourceImageElement)
  if (resolvedFromElement) {
    return resolvedFromElement
  }

  // blob URL は CSP の connect-src 制約で fetch 失敗しやすいため、ここでは fetch を試みない。
  if (sourceUrl.startsWith('blob:')) {
    return null
  }

  const abortController = new AbortController()
  const timeoutId = setTimeout(() => {
    abortController.abort()
  }, DRAW_RESULT_IMAGE_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(sourceUrl, {
      mode: 'cors',
      credentials: 'omit',
      signal: abortController.signal,
      cache: 'force-cache'
    })
    if (!response.ok) {
      return null
    }
    const blob = await response.blob()
    return await convertBlobToDataUrl(blob)
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * DOM ノードの見た目を維持するため、計算済みスタイルをクローン側へインライン転写する。
 *
 * @param sourceElement 元の DOM 要素
 * @param clonedElement クローン済み DOM 要素
 */
function inlineComputedStyles(sourceElement: HTMLElement, clonedElement: HTMLElement): void {
  const sourceElements = [sourceElement, ...Array.from(sourceElement.querySelectorAll<HTMLElement>('*'))]
  const clonedElements = [clonedElement, ...Array.from(clonedElement.querySelectorAll<HTMLElement>('*'))]

  sourceElements.forEach((sourceNode, index) => {
    const clonedNode = clonedElements[index]
    if (!clonedNode) {
      return
    }

    const computedStyle = window.getComputedStyle(sourceNode)
    const inlineStyleText = Array.from(computedStyle)
      .map((propertyName) => `${propertyName}:${computedStyle.getPropertyValue(propertyName)};`)
      .join('')
    clonedNode.setAttribute('style', inlineStyleText)
  })
}

/**
 * クローン内の画像ソースを data URL 化して埋め込み、foreignObject 描画時の欠落を回避する。
 *
 * @param sourceElement 元の DOM 要素
 * @param clonedElement クローン済み DOM 要素
 */
async function inlineCloneImageSources(sourceElement: HTMLElement, clonedElement: HTMLElement): Promise<void> {
  const sourceImageElements = Array.from(sourceElement.querySelectorAll('img'))
  const clonedImageElements = Array.from(clonedElement.querySelectorAll('img'))

  await Promise.all(
    sourceImageElements.map(async (sourceImageElement, index) => {
      const clonedImageElement = clonedImageElements[index]
      if (!clonedImageElement) {
        return
      }

      const sourceUrl = sourceImageElement.currentSrc || sourceImageElement.src
      const dataUrl = await resolveImageDataUrl(sourceUrl, sourceImageElement)
      clonedImageElement.src = dataUrl ?? sourceUrl
    })
  )
}

/**
 * SVG データ URL を読み込み、Canvas へ描画可能な Image 要素へ変換する。
 *
 * @param sourceUrl SVG データ URL
 * @returns 読み込み済み Image 要素
 */
function loadImageFromUrl(sourceUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      resolve(image)
    }
    image.onerror = () => {
      reject(new Error('画像の読み込みに失敗しました。'))
    }
    image.src = sourceUrl
  })
}

/**
 * 指定した要素を PNG Blob に変換する。
 *
 * @param rootElement 変換対象のルート要素
 * @returns PNG Blob
 */
async function renderElementToPngBlob(rootElement: HTMLElement): Promise<Blob> {
  if (document.fonts?.ready) {
    await document.fonts.ready
  }
  await waitForImageCompletion(rootElement)

  const targetWidth = Math.max(1, Math.ceil(rootElement.scrollWidth))
  const targetHeight = Math.max(1, Math.ceil(rootElement.scrollHeight))
  const clonedRootElement = rootElement.cloneNode(true) as HTMLElement
  inlineComputedStyles(rootElement, clonedRootElement)
  await inlineCloneImageSources(rootElement, clonedRootElement)
  clonedRootElement.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  clonedRootElement.style.margin = '0'

  const serializedHtml = new XMLSerializer().serializeToString(clonedRootElement)
  const svgText = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth}" height="${targetHeight}" viewBox="0 0 ${targetWidth} ${targetHeight}">`,
    '<foreignObject x="0" y="0" width="100%" height="100%">',
    serializedHtml,
    '</foreignObject>',
    '</svg>'
  ].join('')
  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`
  const renderedImage = await loadImageFromUrl(svgDataUrl)

  const devicePixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(targetWidth * devicePixelRatio))
  canvas.height = Math.max(1, Math.ceil(targetHeight * devicePixelRatio))

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('画像描画コンテキストを作成できませんでした。')
  }

  context.scale(devicePixelRatio, devicePixelRatio)
  context.drawImage(renderedImage, 0, 0, targetWidth, targetHeight)

  const pngBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), DRAW_RESULT_COPY_IMAGE_MIME_TYPE)
  })

  if (!pngBlob) {
    throw new Error('画像の生成に失敗しました。')
  }

  return pngBlob
}

/**
 * ルート要素を PNG 化してクリップボードへ書き込む。
 *
 * @param rootElement コピー対象のルート要素
 */
async function copyElementAsImage(rootElement: HTMLElement): Promise<void> {
  if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function' || typeof ClipboardItem === 'undefined') {
    throw new Error('このブラウザでは画像コピーに対応していません。')
  }

  const pngBlob = await renderElementToPngBlob(rootElement)
  await navigator.clipboard.write([new ClipboardItem({ [DRAW_RESULT_COPY_IMAGE_MIME_TYPE]: pngBlob })])
}

/**
 * ガチャ結果サムネイル演出のオーバーレイ本体。
 *
 * @param props 演出カード配列と操作ハンドラ
 * @returns 画面全体に重ねて表示する演出 UI
 */
export function DrawResultRevealOverlay({
  title,
  cards,
  revealedCount,
  isAnimating,
  onSkip,
  onClose
}: DrawResultRevealOverlayProps): JSX.Element {
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null)
  const copySurfaceRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isCopyingImage, setIsCopyingImage] = useState(false)
  const [copyButtonLabel, setCopyButtonLabel] = useState('画像としてコピー')
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

  useEffect(() => {
    const gridElement = gridRef.current
    if (!gridElement) {
      return
    }
    if (gridElement.scrollHeight <= gridElement.clientHeight) {
      return
    }

    // 追加表示でスクロール領域が伸びるたびに末尾へ追従し、最新の演出カードを見切れさせない。
    // visibleCards.length と isAnimating に反応して、段階表示中は滑らかに追従する。
    const frameId = window.requestAnimationFrame(() => {
      gridElement.scrollTo({
        top: gridElement.scrollHeight,
        behavior: isAnimating ? 'smooth' : 'auto'
      })
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [isAnimating, visibleCards.length])

  const totalQuantity = useMemo(() => {
    return cards.reduce((total, card) => total + card.quantity, 0)
  }, [cards])
  const overlayTitle = useMemo(() => {
    const normalizedTitle = title.trim()
    return normalizedTitle.length > 0 ? normalizedTitle : '抽選結果表示'
  }, [title])

  const resetCopyFeedbackLabel = useCallback((): void => {
    if (copyFeedbackTimerRef.current) {
      clearTimeout(copyFeedbackTimerRef.current)
    }

    copyFeedbackTimerRef.current = setTimeout(() => {
      setCopyButtonLabel('画像としてコピー')
      copyFeedbackTimerRef.current = null
    }, DRAW_RESULT_COPY_FEEDBACK_RESET_MS)
  }, [])

  const handleCopyImage = useCallback(async (): Promise<void> => {
    const copySurfaceElement = copySurfaceRef.current
    if (!copySurfaceElement || isCopyingImage) {
      return
    }

    setIsCopyingImage(true)
    setCopyButtonLabel('コピー中...')
    try {
      await copyElementAsImage(copySurfaceElement)
      setCopyButtonLabel('コピーしました')
    } catch (error) {
      console.error('抽選結果表示画面の画像コピーに失敗しました', error)
      setCopyButtonLabel('コピー失敗')
    } finally {
      setIsCopyingImage(false)
      resetCopyFeedbackLabel()
    }
  }, [isCopyingImage, resetCopyFeedbackLabel])

  useEffect(() => {
    // 画面破棄時にラベル復帰タイマーを解放し、アンマウント後の state 更新を防ぐ。
    // copyFeedbackTimerRef はこの effect 内でのみ clear するため依存配列は空にする。
    return () => {
      if (copyFeedbackTimerRef.current) {
        clearTimeout(copyFeedbackTimerRef.current)
        copyFeedbackTimerRef.current = null
      }
    }
  }, [])

  const overlayStyle = useMemo<CSSProperties>(() => {
    const totalCards = Math.max(1, cards.length)
    const defaultCardSize = 118
    const mobileBreakpoint = 768
    const tabletBreakpoint = 1100
    const availableWidth = Math.max(240, viewport.width - 40)
    const availableHeight = Math.max(220, viewport.height - 40 - 136)
    const horizontalGap = 12
    const verticalGap = 14
    const cardMetaHeight = 30

    const resolveMinimumCardSize = (): number => {
      if (viewport.width < mobileBreakpoint) {
        return Math.max(52, Math.floor(viewport.width / 5))
      }
      if (viewport.width < tabletBreakpoint) {
        return Math.max(52, Math.floor(viewport.width / 7))
      }
      return defaultCardSize
    }

    const minimumCardSize = Math.min(defaultCardSize, resolveMinimumCardSize())

    const resolveLayoutForMinSize = (
      minimumSize: number
    ): { columns: number; cardSize: number; contentHeight: number } => {
      const estimatedColumns = Math.max(1, Math.floor((availableWidth + horizontalGap) / (minimumSize + horizontalGap)))
      const columns = Math.max(1, Math.min(totalCards, estimatedColumns))
      const cardSize = Math.max(
        1,
        Math.floor((availableWidth - horizontalGap * Math.max(0, columns - 1)) / columns)
      )
      const rows = Math.ceil(totalCards / columns)
      const cardBlockHeight = cardSize + cardMetaHeight
      const contentHeight = rows * cardBlockHeight + Math.max(0, rows - 1) * verticalGap
      return { columns, cardSize, contentHeight }
    }

    const defaultLayout = resolveLayoutForMinSize(defaultCardSize)
    const minimumLayout = resolveLayoutForMinSize(minimumCardSize)
    const shouldUseMinimumLayout =
      minimumCardSize < defaultCardSize && defaultLayout.contentHeight > availableHeight
    const selectedLayout = shouldUseMinimumLayout ? minimumLayout : defaultLayout

    return {
      '--draw-result-columns': `${selectedLayout.columns}`
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
            <h3 className="draw-gacha-result-overlay__title text-sm font-semibold text-white">{overlayTitle}</h3>
            <div className="draw-gacha-result-overlay__summary flex flex-wrap items-center gap-2 text-xs text-white/90">
              <span className="draw-gacha-result-overlay__progress inline-flex items-center rounded-full border border-white/45 bg-black/25 px-2 py-0.5">
                表示カード {visibleCards.length}/{cards.length}
              </span>
              <span className="draw-gacha-result-overlay__total inline-flex items-center rounded-full border border-white/45 bg-black/25 px-2 py-0.5">
                計 {totalQuantity}連
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
              id="draw-gacha-result-copy-image-button"
              type="button"
              onClick={() => {
                void handleCopyImage()
              }}
              disabled={isCopyingImage}
              className="draw-gacha-result-overlay__copy-image-button inline-flex h-8 items-center rounded-md border border-white/45 bg-black/25 px-3 text-xs font-medium text-white transition hover:bg-black/45 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {copyButtonLabel}
            </button>
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

        <div
          ref={gridRef}
          className="draw-gacha-result-overlay__grid min-h-0 flex-1 content-start overflow-y-auto overflow-x-hidden pb-2 pr-1"
        >
          {visibleCards.map((card) => (
            <div key={`${card.itemId}-${card.revealIndex}`} className="draw-gacha-result-overlay__grid-item">
              <DrawResultRevealCard card={card} />
            </div>
          ))}
        </div>
      </div>

      <div
        ref={copySurfaceRef}
        className="draw-gacha-result-overlay__copy-surface fixed left-[-100000px] top-0 z-[-1] bg-black/95 p-4 text-white"
        style={{ width: `${Math.max(280, viewport.width - 40)}px` }}
      >
        <div className="draw-gacha-result-overlay__copy-header mb-3 border-b border-white/30 pb-2">
          <h3 className="draw-gacha-result-overlay__copy-title text-sm font-semibold text-white">{overlayTitle}</h3>
          <div className="draw-gacha-result-overlay__copy-summary mt-1 flex flex-wrap items-center gap-2 text-xs text-white/90">
            <span className="draw-gacha-result-overlay__copy-progress inline-flex items-center rounded-full border border-white/45 bg-black/25 px-2 py-0.5">
              表示カード {visibleCards.length}/{cards.length}
            </span>
            <span className="draw-gacha-result-overlay__copy-total inline-flex items-center rounded-full border border-white/45 bg-black/25 px-2 py-0.5">
              計 {totalQuantity}連
            </span>
          </div>
        </div>

        <div className="draw-gacha-result-overlay__copy-grid draw-gacha-result-overlay__grid content-start overflow-visible pb-0 pr-0">
          {visibleCards.map((card) => (
            <div key={`copy-${card.itemId}-${card.revealIndex}`} className="draw-gacha-result-overlay__grid-item">
              <DrawResultRevealCard card={card} imageLoading="eager" />
            </div>
          ))}
        </div>
      </div>
    </section>,
    portalElement
  )
}
