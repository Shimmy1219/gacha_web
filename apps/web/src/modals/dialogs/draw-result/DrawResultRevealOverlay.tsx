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
const DRAW_RESULT_CANVAS_FONT_FAMILY = "'Hiragino Sans', 'Noto Sans JP', sans-serif"
const DRAW_RESULT_TRANSPARENT_PIXEL_DATA_URL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

interface RectMetrics {
  x: number
  y: number
  width: number
  height: number
}

interface CopyHeaderSnapshot {
  dividerY: number | null
  titleRect: RectMetrics | null
  titleText: string
  progressRect: RectMetrics | null
  progressText: string
  totalRect: RectMetrics | null
  totalText: string
}

interface CopyCardSnapshot {
  thumbRect: RectMetrics
  rarityRect: RectMetrics | null
  rarityText: string
  rarityColor: string
  quantityRect: RectMetrics | null
  quantityText: string
  nameRect: RectMetrics | null
  nameText: string
  imageUrl: string | null
  isAudio: boolean
}

interface ForeignObjectLayerOptions {
  inlineImageSources: boolean
  transparentRootBackground: boolean
  hideThumbnailImages: boolean
  hideAudioSymbols: boolean
}

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

  // blob URL は CSP の connect-src 制約で fetch 失敗しやすいため、Image 経由で data URL 化する。
  if (sourceUrl.startsWith('blob:')) {
    return await convertImageUrlToDataUrl(sourceUrl)
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
 * コピー対象ルートの座標をキャプチャ用に正規化する。
 *
 * @param clonedRootElement クローン済みルート要素
 */
function normalizeCaptureRootElementPosition(clonedRootElement: HTMLElement): void {
  // コピー面は普段「left:-100000px」で画面外に逃がしている。
  // 計算済みスタイルをそのまま転写すると foreignObject 描画時も画面外に飛び、空画像になるため原点へ戻す。
  clonedRootElement.style.position = 'static'
  clonedRootElement.style.left = '0px'
  clonedRootElement.style.top = '0px'
  clonedRootElement.style.right = 'auto'
  clonedRootElement.style.bottom = 'auto'
  clonedRootElement.style.transform = 'none'
  clonedRootElement.style.zIndex = '0'
}

/**
 * foreignObject レイヤー向けにサムネイル内の画像を不可視化する。
 * 画像は別 Canvas レイヤーで描画するため、ここではレイアウトだけを保持する。
 *
 * @param clonedElement クローン済み DOM 要素
 */
function hideThumbnailImagesForForeignObject(clonedElement: HTMLElement): void {
  const thumbnailImageElements = Array.from(clonedElement.querySelectorAll<HTMLImageElement>('.draw-gacha-result-card__thumb img'))
  thumbnailImageElements.forEach((thumbnailImageElement) => {
    // Safari の foreignObject は参照先画像が不安定なため、最小 data URL に置き換える。
    thumbnailImageElement.src = DRAW_RESULT_TRANSPARENT_PIXEL_DATA_URL
    thumbnailImageElement.srcset = ''
    thumbnailImageElement.style.visibility = 'hidden'
    thumbnailImageElement.style.opacity = '0'
  })
}

/**
 * foreignObject レイヤー向けに音声サムネイルの記号だけを非表示にする。
 * 音声記号は Canvas 側で描画し、文字欠けを回避する。
 *
 * @param clonedElement クローン済み DOM 要素
 */
function hideAudioSymbolsForForeignObject(clonedElement: HTMLElement): void {
  const audioSymbolElements = Array.from(clonedElement.querySelectorAll<HTMLElement>('.draw-gacha-result-card__audio-symbol'))
  audioSymbolElements.forEach((audioSymbolElement) => {
    audioSymbolElement.style.visibility = 'hidden'
    audioSymbolElement.style.opacity = '0'
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
 * クローンDOMを SVG + foreignObject へ変換し、描画済み Image として返す。
 *
 * @param clonedRootElement foreignObject 化するルート要素
 * @param targetWidth 出力幅
 * @param targetHeight 出力高さ
 * @returns 描画済み Image 要素
 */
async function renderForeignObjectCloneToImage(
  clonedRootElement: HTMLElement,
  targetWidth: number,
  targetHeight: number
): Promise<HTMLImageElement> {
  const serializedHtml = new XMLSerializer().serializeToString(clonedRootElement)
  const svgText = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth}" height="${targetHeight}" viewBox="0 0 ${targetWidth} ${targetHeight}">`,
    '<foreignObject x="0" y="0" width="100%" height="100%">',
    serializedHtml,
    '</foreignObject>',
    '</svg>'
  ].join('')
  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`
  return await loadImageFromUrl(svgDataUrl)
}

/**
 * コピー面DOMから foreignObject 用のクローンを作成し、レイヤー画像へ変換する。
 *
 * @param sourceElement 元のコピー面ルート
 * @param targetWidth 出力幅
 * @param targetHeight 出力高さ
 * @param options レイヤー生成オプション
 * @returns 描画済み Image 要素
 */
async function createForeignObjectLayerImage(
  sourceElement: HTMLElement,
  targetWidth: number,
  targetHeight: number,
  options: ForeignObjectLayerOptions
): Promise<HTMLImageElement> {
  const clonedRootElement = sourceElement.cloneNode(true) as HTMLElement
  inlineComputedStyles(sourceElement, clonedRootElement)
  if (options.inlineImageSources) {
    await inlineCloneImageSources(sourceElement, clonedRootElement)
  }

  if (options.hideThumbnailImages) {
    hideThumbnailImagesForForeignObject(clonedRootElement)
  }
  if (options.hideAudioSymbols) {
    hideAudioSymbolsForForeignObject(clonedRootElement)
  }

  clonedRootElement.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  normalizeCaptureRootElementPosition(clonedRootElement)
  clonedRootElement.style.margin = '0'
  if (options.transparentRootBackground) {
    clonedRootElement.style.backgroundColor = 'transparent'
    clonedRootElement.style.backgroundImage = 'none'
  }

  return await renderForeignObjectCloneToImage(clonedRootElement, targetWidth, targetHeight)
}

/**
 * 画像 URL を読み込み、Canvas へ描画可能な Image 要素へ変換する。
 *
 * @param sourceUrl 画像 URL（data/blob/http(s) を含む）
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
 * 画像 URL を Image->Canvas 経由で data URL 化する。
 * fetch を使わないため、blob URL の connect-src 制約を回避しやすい。
 *
 * @param sourceUrl 変換元 URL
 * @returns data URL。変換不可の場合は null
 */
async function convertImageUrlToDataUrl(sourceUrl: string): Promise<string | null> {
  if (!sourceUrl) {
    return null
  }
  if (sourceUrl.startsWith('data:')) {
    return sourceUrl
  }

  try {
    const imageElement = await loadImageFromUrl(sourceUrl)
    const width = Math.max(1, imageElement.naturalWidth || imageElement.width)
    const height = Math.max(1, imageElement.naturalHeight || imageElement.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) {
      return null
    }

    context.drawImage(imageElement, 0, 0, width, height)
    return canvas.toDataURL(DRAW_RESULT_COPY_IMAGE_MIME_TYPE)
  } catch {
    return null
  }
}

/**
 * Safari 系ブラウザかどうかを判定する。
 * iOS Safari では foreignObject を含む描画で画像が欠落しやすいため、Canvas 直接描画へフォールバックする。
 *
 * @returns Safari 系ブラウザなら true
 */
function isSafariLikeBrowser(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }

  const userAgent = navigator.userAgent
  const isWebkitSafari = /Safari/i.test(userAgent) && /AppleWebKit/i.test(userAgent)
  const isOtherEngine = /Chrome|CriOS|Chromium|Edg|EdgiOS|OPR|OPiOS|FxiOS/i.test(userAgent)
  return isWebkitSafari && !isOtherEngine
}

/**
 * ルート要素を基準にした相対矩形を取得する。
 *
 * @param element 対象要素
 * @param rootRect ルート要素の絶対矩形
 * @returns 相対矩形。取得できない場合は null
 */
function createRelativeRect(element: Element | null, rootRect: DOMRect): RectMetrics | null {
  if (!element) {
    return null
  }

  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return null
  }

  return {
    x: rect.left - rootRect.left,
    y: rect.top - rootRect.top,
    width: rect.width,
    height: rect.height
  }
}

/**
 * 矩形を内側へ縮めた結果を返す。
 *
 * @param rect 元の矩形
 * @param inset 縮小量
 * @returns 縮小後の矩形
 */
function insetRect(rect: RectMetrics, inset: number): RectMetrics {
  const width = Math.max(1, rect.width - inset * 2)
  const height = Math.max(1, rect.height - inset * 2)
  return {
    x: rect.x + inset,
    y: rect.y + inset,
    width,
    height
  }
}

/**
 * 角丸矩形のパスを Canvas へ設定する。
 *
 * @param context Canvas 2D コンテキスト
 * @param rect 対象矩形
 * @param radius 角丸半径
 */
function buildRoundedRectPath(context: CanvasRenderingContext2D, rect: RectMetrics, radius: number): void {
  const safeRadius = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2))
  context.beginPath()
  context.moveTo(rect.x + safeRadius, rect.y)
  context.lineTo(rect.x + rect.width - safeRadius, rect.y)
  context.quadraticCurveTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + safeRadius)
  context.lineTo(rect.x + rect.width, rect.y + rect.height - safeRadius)
  context.quadraticCurveTo(rect.x + rect.width, rect.y + rect.height, rect.x + rect.width - safeRadius, rect.y + rect.height)
  context.lineTo(rect.x + safeRadius, rect.y + rect.height)
  context.quadraticCurveTo(rect.x, rect.y + rect.height, rect.x, rect.y + rect.height - safeRadius)
  context.lineTo(rect.x, rect.y + safeRadius)
  context.quadraticCurveTo(rect.x, rect.y, rect.x + safeRadius, rect.y)
  context.closePath()
}

/**
 * 最大幅に収まるようにテキストを省略する。
 *
 * @param context Canvas 2D コンテキスト
 * @param text 元テキスト
 * @param maxWidth 最大幅
 * @returns 省略後テキスト
 */
function truncateTextToWidth(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) {
    return text
  }

  const ellipsis = '…'
  let current = text
  while (current.length > 0 && context.measureText(`${current}${ellipsis}`).width > maxWidth) {
    current = current.slice(0, -1)
  }
  return current.length > 0 ? `${current}${ellipsis}` : ''
}

/**
 * バッジ背景とテキストを描画する。
 *
 * @param context Canvas 2D コンテキスト
 * @param rect 描画先矩形
 * @param text テキスト
 * @param textColor 文字色
 * @param fontWeight フォントウェイト
 */
function drawBadge(
  context: CanvasRenderingContext2D,
  rect: RectMetrics,
  text: string,
  textColor: string,
  fontWeight: number
): void {
  buildRoundedRectPath(context, rect, rect.height / 2)
  context.fillStyle = 'rgba(0, 0, 0, 0.65)'
  context.fill()
  context.strokeStyle = 'rgba(255, 255, 255, 0.4)'
  context.lineWidth = 1
  context.stroke()

  const fontSize = Math.max(9, Math.min(12, Math.floor(rect.height * 0.58)))
  context.font = `${fontWeight} ${fontSize}px ${DRAW_RESULT_CANVAS_FONT_FAMILY}`
  context.textBaseline = 'middle'
  context.textAlign = 'left'
  context.fillStyle = textColor
  const textPadding = 8
  const visibleText = truncateTextToWidth(context, text, Math.max(0, rect.width - textPadding * 2))
  context.fillText(visibleText, rect.x + textPadding, rect.y + rect.height / 2)
}

/**
 * コピー面ヘッダーの描画情報を取得する。
 *
 * @param rootElement コピー面ルート
 * @param rootRect ルート矩形
 * @returns 描画情報
 */
function collectCopyHeaderSnapshot(rootElement: HTMLElement, rootRect: DOMRect): CopyHeaderSnapshot {
  const headerElement = rootElement.querySelector('.draw-gacha-result-overlay__copy-header')
  const titleElement = rootElement.querySelector('.draw-gacha-result-overlay__copy-title')
  const progressElement = rootElement.querySelector('.draw-gacha-result-overlay__copy-progress')
  const totalElement = rootElement.querySelector('.draw-gacha-result-overlay__copy-total')

  const headerRect = createRelativeRect(headerElement, rootRect)
  return {
    dividerY: headerRect ? headerRect.y + headerRect.height : null,
    titleRect: createRelativeRect(titleElement, rootRect),
    titleText: titleElement?.textContent?.trim() ?? '',
    progressRect: createRelativeRect(progressElement, rootRect),
    progressText: progressElement?.textContent?.trim() ?? '',
    totalRect: createRelativeRect(totalElement, rootRect),
    totalText: totalElement?.textContent?.trim() ?? ''
  }
}

/**
 * コピー面カードの描画情報を収集する。
 *
 * @param rootElement コピー面ルート
 * @param rootRect ルート矩形
 * @returns カード描画情報配列
 */
function collectCopyCardSnapshots(rootElement: HTMLElement, rootRect: DOMRect): CopyCardSnapshot[] {
  const gridItemElements = Array.from(rootElement.querySelectorAll('.draw-gacha-result-overlay__copy-grid .draw-gacha-result-overlay__grid-item'))
  const snapshots: CopyCardSnapshot[] = []

  gridItemElements.forEach((gridItemElement) => {
    const thumbElement = gridItemElement.querySelector('.draw-gacha-result-card__thumb')
    const thumbRect = createRelativeRect(thumbElement, rootRect)
    if (!thumbRect) {
      return
    }

    const rarityElement = gridItemElement.querySelector('.draw-gacha-result-card__rarity')
    const quantityElement = gridItemElement.querySelector('.draw-gacha-result-card__quantity-badge')
    const nameElement = gridItemElement.querySelector('.draw-gacha-result-card__name')
    const imageElement = gridItemElement.querySelector('img')
    const audioSymbolElement = gridItemElement.querySelector('.draw-gacha-result-card__audio-symbol')
    const rarityTextColorSource = rarityElement?.querySelector('span') ?? rarityElement

    snapshots.push({
      thumbRect,
      rarityRect: createRelativeRect(rarityElement, rootRect),
      rarityText: rarityElement?.textContent?.trim() ?? '',
      rarityColor: rarityTextColorSource ? window.getComputedStyle(rarityTextColorSource).color : '#ffffff',
      quantityRect: createRelativeRect(quantityElement, rootRect),
      quantityText: quantityElement?.textContent?.trim() ?? '',
      nameRect: createRelativeRect(nameElement, rootRect),
      nameText: nameElement?.textContent?.trim() ?? '',
      imageUrl: imageElement ? imageElement.currentSrc || imageElement.src : null,
      isAudio: Boolean(audioSymbolElement)
    })
  })

  return snapshots
}

/**
 * サムネイル画像を Canvas 描画用に読み込む。
 *
 * @param sourceUrl 画像 URL
 * @returns 読み込み済み画像。失敗時は null
 */
async function resolveCanvasImage(sourceUrl: string): Promise<HTMLImageElement | null> {
  if (!sourceUrl) {
    return null
  }

  try {
    const resolvedSourceUrl = sourceUrl.startsWith('blob:') ? (await convertImageUrlToDataUrl(sourceUrl)) ?? sourceUrl : sourceUrl
    return await Promise.race([
      loadImageFromUrl(resolvedSourceUrl).catch(() => null),
      new Promise<HTMLImageElement | null>((resolve) => {
        setTimeout(() => resolve(null), DRAW_RESULT_IMAGE_FETCH_TIMEOUT_MS)
      })
    ])
  } catch {
    return null
  }
}

/**
 * object-contain 相当で画像を描画する。
 *
 * @param context Canvas 2D コンテキスト
 * @param image 描画画像
 * @param targetRect 描画領域
 */
function drawContainImage(context: CanvasRenderingContext2D, image: HTMLImageElement, targetRect: RectMetrics): void {
  const sourceWidth = Math.max(1, image.naturalWidth || image.width)
  const sourceHeight = Math.max(1, image.naturalHeight || image.height)
  const scale = Math.min(targetRect.width / sourceWidth, targetRect.height / sourceHeight)
  const drawWidth = Math.max(1, sourceWidth * scale)
  const drawHeight = Math.max(1, sourceHeight * scale)
  const drawX = targetRect.x + (targetRect.width - drawWidth) / 2
  const drawY = targetRect.y + (targetRect.height - drawHeight) / 2
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight)
}

/**
 * 指定サイズと DPR で描画用 Canvas を初期化する。
 *
 * @param targetWidth 論理解像度の幅
 * @param targetHeight 論理解像度の高さ
 * @param devicePixelRatio 使用する DPR
 * @returns 初期化済み Canvas と 2D コンテキスト
 */
function createScaledCanvasContext(
  targetWidth: number,
  targetHeight: number,
  devicePixelRatio: number
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(targetWidth * devicePixelRatio))
  canvas.height = Math.max(1, Math.ceil(targetHeight * devicePixelRatio))

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('画像描画コンテキストを作成できませんでした。')
  }

  context.scale(devicePixelRatio, devicePixelRatio)
  return { canvas, context }
}

/**
 * 画像・音声サムネイルだけを Canvas レイヤーとして描画する。
 *
 * @param rootElement コピー面ルート要素
 * @param targetWidth 論理解像度の幅
 * @param targetHeight 論理解像度の高さ
 * @param devicePixelRatio 使用する DPR
 * @returns サムネイル描画済み Canvas
 */
async function renderThumbnailLayerToCanvas(
  rootElement: HTMLElement,
  targetWidth: number,
  targetHeight: number,
  devicePixelRatio: number
): Promise<HTMLCanvasElement> {
  const rootRect = rootElement.getBoundingClientRect()
  const cardSnapshots = collectCopyCardSnapshots(rootElement, rootRect)
  const { canvas, context } = createScaledCanvasContext(targetWidth, targetHeight, devicePixelRatio)

  const imageCache = new Map<string, Promise<HTMLImageElement | null>>()
  const resolveCachedImage = (imageUrl: string): Promise<HTMLImageElement | null> => {
    const cachedImagePromise = imageCache.get(imageUrl)
    if (cachedImagePromise) {
      return cachedImagePromise
    }

    const imagePromise = resolveCanvasImage(imageUrl)
    imageCache.set(imageUrl, imagePromise)
    return imagePromise
  }

  for (const cardSnapshot of cardSnapshots) {
    if (cardSnapshot.imageUrl) {
      const resolvedImage = await resolveCachedImage(cardSnapshot.imageUrl)
      if (resolvedImage) {
        drawContainImage(context, resolvedImage, insetRect(cardSnapshot.thumbRect, 1))
      }
      continue
    }

    if (!cardSnapshot.isAudio) {
      continue
    }

    context.fillStyle = '#ffffff'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = `700 ${Math.max(22, Math.floor(cardSnapshot.thumbRect.height * 0.5))}px ${DRAW_RESULT_CANVAS_FONT_FAMILY}`
    context.fillText('♫', cardSnapshot.thumbRect.x + cardSnapshot.thumbRect.width / 2, cardSnapshot.thumbRect.y + cardSnapshot.thumbRect.height / 2)
  }

  return canvas
}

/**
 * Safari 向けに、サムネイルは Canvas 描画・その他は foreignObject 描画で合成し PNG を生成する。
 *
 * @param rootElement 変換対象のコピー面ルート要素
 * @returns PNG Blob
 */
async function renderElementToPngBlobByHybridLayerComposition(rootElement: HTMLElement): Promise<Blob> {
  if (document.fonts?.ready) {
    await document.fonts.ready
  }
  await waitForImageCompletion(rootElement)

  const targetWidth = Math.max(1, Math.ceil(rootElement.scrollWidth))
  const targetHeight = Math.max(1, Math.ceil(rootElement.scrollHeight))
  const devicePixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2)
  const { canvas: composedCanvas, context: composedContext } = createScaledCanvasContext(
    targetWidth,
    targetHeight,
    devicePixelRatio
  )

  const rootComputedStyle = window.getComputedStyle(rootElement)
  const backgroundColor = rootComputedStyle.backgroundColor
  composedContext.fillStyle = backgroundColor && backgroundColor !== 'rgba(0, 0, 0, 0)' ? backgroundColor : '#000000'
  composedContext.fillRect(0, 0, targetWidth, targetHeight)

  const thumbnailLayerCanvas = await renderThumbnailLayerToCanvas(rootElement, targetWidth, targetHeight, devicePixelRatio)
  composedContext.drawImage(thumbnailLayerCanvas, 0, 0, targetWidth, targetHeight)

  const foregroundLayerImage = await createForeignObjectLayerImage(rootElement, targetWidth, targetHeight, {
    inlineImageSources: false,
    transparentRootBackground: true,
    hideThumbnailImages: true,
    hideAudioSymbols: true
  })
  composedContext.drawImage(foregroundLayerImage, 0, 0, targetWidth, targetHeight)

  const pngBlob = await new Promise<Blob | null>((resolve) => {
    composedCanvas.toBlob((blob) => resolve(blob), DRAW_RESULT_COPY_IMAGE_MIME_TYPE)
  })

  if (!pngBlob) {
    throw new Error('画像の生成に失敗しました。')
  }

  return pngBlob
}

/**
 * Safari 向けに、DOM 座標を使って Canvas へ直接描画して PNG を生成する。
 *
 * @param rootElement 変換対象のコピー面ルート要素
 * @returns PNG Blob
 */
async function renderElementToPngBlobByCanvasRasterization(rootElement: HTMLElement): Promise<Blob> {
  if (document.fonts?.ready) {
    await document.fonts.ready
  }
  await waitForImageCompletion(rootElement)

  const targetWidth = Math.max(1, Math.ceil(rootElement.scrollWidth))
  const targetHeight = Math.max(1, Math.ceil(rootElement.scrollHeight))
  const rootRect = rootElement.getBoundingClientRect()
  const headerSnapshot = collectCopyHeaderSnapshot(rootElement, rootRect)
  const cardSnapshots = collectCopyCardSnapshots(rootElement, rootRect)

  const devicePixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(targetWidth * devicePixelRatio))
  canvas.height = Math.max(1, Math.ceil(targetHeight * devicePixelRatio))

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('画像描画コンテキストを作成できませんでした。')
  }

  context.scale(devicePixelRatio, devicePixelRatio)
  context.fillStyle = '#000000'
  context.fillRect(0, 0, targetWidth, targetHeight)

  if (headerSnapshot.dividerY !== null) {
    context.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(0, headerSnapshot.dividerY)
    context.lineTo(targetWidth, headerSnapshot.dividerY)
    context.stroke()
  }
  if (headerSnapshot.titleRect && headerSnapshot.titleText) {
    context.fillStyle = '#ffffff'
    context.textBaseline = 'top'
    context.textAlign = 'left'
    context.font = `600 ${Math.max(13, Math.floor(headerSnapshot.titleRect.height * 0.85))}px ${DRAW_RESULT_CANVAS_FONT_FAMILY}`
    context.fillText(headerSnapshot.titleText, headerSnapshot.titleRect.x, headerSnapshot.titleRect.y)
  }
  if (headerSnapshot.progressRect && headerSnapshot.progressText) {
    drawBadge(context, headerSnapshot.progressRect, headerSnapshot.progressText, '#ffffff', 500)
  }
  if (headerSnapshot.totalRect && headerSnapshot.totalText) {
    drawBadge(context, headerSnapshot.totalRect, headerSnapshot.totalText, '#ffffff', 500)
  }

  const imageCache = new Map<string, Promise<HTMLImageElement | null>>()
  const resolveCachedImage = (imageUrl: string): Promise<HTMLImageElement | null> => {
    const cached = imageCache.get(imageUrl)
    if (cached) {
      return cached
    }
    const imagePromise = resolveCanvasImage(imageUrl)
    imageCache.set(imageUrl, imagePromise)
    return imagePromise
  }

  for (const cardSnapshot of cardSnapshots) {
    if (cardSnapshot.imageUrl) {
      const resolvedImage = await resolveCachedImage(cardSnapshot.imageUrl)
      if (resolvedImage) {
        drawContainImage(context, resolvedImage, insetRect(cardSnapshot.thumbRect, 1))
      }
    } else if (cardSnapshot.isAudio) {
      context.fillStyle = '#ffffff'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.font = `700 ${Math.max(22, Math.floor(cardSnapshot.thumbRect.height * 0.5))}px ${DRAW_RESULT_CANVAS_FONT_FAMILY}`
      context.fillText('♫', cardSnapshot.thumbRect.x + cardSnapshot.thumbRect.width / 2, cardSnapshot.thumbRect.y + cardSnapshot.thumbRect.height / 2)
    }

    if (cardSnapshot.rarityRect && cardSnapshot.rarityText) {
      drawBadge(context, cardSnapshot.rarityRect, cardSnapshot.rarityText, cardSnapshot.rarityColor || '#ffffff', 600)
    }
    if (cardSnapshot.quantityRect && cardSnapshot.quantityText) {
      drawBadge(context, cardSnapshot.quantityRect, cardSnapshot.quantityText, '#ffffff', 600)
    }
    if (cardSnapshot.nameRect && cardSnapshot.nameText) {
      context.fillStyle = '#ffffff'
      context.textAlign = 'left'
      context.textBaseline = 'top'
      context.font = `500 ${Math.max(11, Math.floor(cardSnapshot.nameRect.height * 0.95))}px ${DRAW_RESULT_CANVAS_FONT_FAMILY}`
      const visibleName = truncateTextToWidth(context, cardSnapshot.nameText, cardSnapshot.nameRect.width)
      context.fillText(visibleName, cardSnapshot.nameRect.x, cardSnapshot.nameRect.y)
    }
  }

  const pngBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), DRAW_RESULT_COPY_IMAGE_MIME_TYPE)
  })

  if (!pngBlob) {
    throw new Error('画像の生成に失敗しました。')
  }

  return pngBlob
}

/**
 * 指定した要素を PNG Blob に変換する。
 *
 * @param rootElement 変換対象のルート要素
 * @returns PNG Blob
 */
async function renderElementToPngBlob(rootElement: HTMLElement): Promise<Blob> {
  // iOS Safari は foreignObject 内の画像描画が不安定なため、
  // サムネイルだけ Canvas で描画するハイブリッド方式を優先し、失敗時にフル Canvas へフォールバックする。
  if (isSafariLikeBrowser()) {
    try {
      return await renderElementToPngBlobByHybridLayerComposition(rootElement)
    } catch (hybridError) {
      console.warn('ハイブリッド画像合成に失敗したため、Canvas全面描画へフォールバックします。', hybridError)
      return await renderElementToPngBlobByCanvasRasterization(rootElement)
    }
  }

  if (document.fonts?.ready) {
    await document.fonts.ready
  }
  await waitForImageCompletion(rootElement)

  const targetWidth = Math.max(1, Math.ceil(rootElement.scrollWidth))
  const targetHeight = Math.max(1, Math.ceil(rootElement.scrollHeight))
  const devicePixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2)
  const { canvas, context } = createScaledCanvasContext(targetWidth, targetHeight, devicePixelRatio)
  const renderedImage = await createForeignObjectLayerImage(rootElement, targetWidth, targetHeight, {
    inlineImageSources: true,
    transparentRootBackground: false,
    hideThumbnailImages: false,
    hideAudioSymbols: false
  })
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

  // iOS Safari では click/tap から write() までの間に await を挟むと、
  // ユーザー操作コンテキストが失われて NotAllowedError になりやすい。
  // Promise<Blob> を ClipboardItem に渡し、write() 自体は同期的に呼び出す。
  const pngBlobPromise = renderElementToPngBlob(rootElement)
  await navigator.clipboard.write([new ClipboardItem({ [DRAW_RESULT_COPY_IMAGE_MIME_TYPE]: pngBlobPromise })])
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
