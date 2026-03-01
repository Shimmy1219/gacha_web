import type { DigitalItemTypeKey } from '@domain/digital-items/digitalItemTypes'

export interface DrawResultRevealAssetMeta {
  assetId: string | null
  thumbnailAssetId: string | null
  digitalItemType: DigitalItemTypeKey | null
}

export interface DrawResultAggregatedItem {
  itemId: string
  name: string
  rarityId: string
  rarityLabel: string
  rarityColor?: string
  count: number
  guaranteedCount?: number
}

export interface DrawResultRevealCardModel {
  revealIndex: number
  itemId: string
  name: string
  rarityId: string
  rarityLabel: string
  rarityColor?: string
  guaranteed: boolean
  quantity: number
  guaranteedQuantity: number
  assetId: string | null
  thumbnailAssetId: string | null
  digitalItemType: DigitalItemTypeKey | null
}

export interface BuildRevealCardsFromAggregatedItemsArgs {
  aggregatedItems: DrawResultAggregatedItem[]
  itemAssetById: Map<string, DrawResultRevealAssetMeta>
  rarityOrderIndex: Map<string, number>
  itemOrderIndex: Map<string, number>
}

function sanitizeCount(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.floor(value))
}

/**
 * 抽選の集計結果を、演出表示用のカード配列へ変換する。
 *
 * 常に「1アイテム=1カード」で扱い、`quantity` へ件数を保持する。
 * これにより大量連数でも描画数がアイテム種類数で頭打ちになり、描画負荷を安定化できる。
 *
 * @param args 集計結果・並び順インデックス・サムネイル情報
 * @returns 演出表示で利用するカード配列
 */
export function buildRevealCardsFromAggregatedItems(
  args: BuildRevealCardsFromAggregatedItemsArgs
): DrawResultRevealCardModel[] {
  const { aggregatedItems, itemAssetById, rarityOrderIndex, itemOrderIndex } = args

  const sortedItems = [...aggregatedItems].sort((a, b) => {
    // 既存の結果リストと同じ順序で表示するため、レアリティ→アイテム順→名前で並べる。
    const rarityOrderA = rarityOrderIndex.get(a.rarityId) ?? Number.POSITIVE_INFINITY
    const rarityOrderB = rarityOrderIndex.get(b.rarityId) ?? Number.POSITIVE_INFINITY
    if (rarityOrderA !== rarityOrderB) {
      return rarityOrderA - rarityOrderB
    }

    const itemOrderA = itemOrderIndex.get(a.itemId) ?? Number.POSITIVE_INFINITY
    const itemOrderB = itemOrderIndex.get(b.itemId) ?? Number.POSITIVE_INFINITY
    if (itemOrderA !== itemOrderB) {
      return itemOrderA - itemOrderB
    }

    return a.name.localeCompare(b.name, 'ja')
  })

  const cards: DrawResultRevealCardModel[] = []

  sortedItems.forEach((item) => {
    const quantity = sanitizeCount(item.count)
    if (quantity <= 0) {
      return
    }

    const guaranteedQuantity = Math.min(quantity, sanitizeCount(item.guaranteedCount))
    const asset = itemAssetById.get(item.itemId)

    cards.push({
      revealIndex: cards.length,
      itemId: item.itemId,
      name: item.name,
      rarityId: item.rarityId,
      rarityLabel: item.rarityLabel,
      rarityColor: item.rarityColor,
      guaranteed: guaranteedQuantity > 0,
      quantity,
      guaranteedQuantity,
      assetId: asset?.assetId ?? null,
      thumbnailAssetId: asset?.thumbnailAssetId ?? null,
      digitalItemType: asset?.digitalItemType ?? null
    })
  })

  return cards
}
