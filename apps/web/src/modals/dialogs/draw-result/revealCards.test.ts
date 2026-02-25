import { describe, expect, test } from 'vitest'

import {
  buildRevealCardsFromAggregatedItems,
  type DrawResultAggregatedItem,
  type DrawResultRevealAssetMeta
} from './revealCards'

describe('buildRevealCardsFromAggregatedItems', () => {
  test('アイテム種類ごとに1カードへ変換し、数量と保証数を保持する', () => {
    const aggregatedItems: DrawResultAggregatedItem[] = [
      {
        itemId: 'item-a',
        name: 'A',
        rarityId: 'rare',
        rarityLabel: 'Rare',
        count: 8,
        guaranteedCount: 3
      },
      {
        itemId: 'item-b',
        name: 'B',
        rarityId: 'common',
        rarityLabel: 'Common',
        count: 1
      }
    ]

    const itemAssetById = new Map<string, DrawResultRevealAssetMeta>([
      [
        'item-a',
        {
          assetId: 'asset-a',
          thumbnailAssetId: 'thumb-a',
          digitalItemType: 'audio'
        }
      ]
    ])

    const rarityOrderIndex = new Map<string, number>([
      ['common', 0],
      ['rare', 1]
    ])
    const itemOrderIndex = new Map<string, number>([
      ['item-a', 1],
      ['item-b', 0]
    ])

    const cards = buildRevealCardsFromAggregatedItems({
      aggregatedItems,
      itemAssetById,
      rarityOrderIndex,
      itemOrderIndex
    })

    expect(cards).toHaveLength(2)

    // common が先、rare が後ろになる。
    expect(cards[0]).toMatchObject({
      revealIndex: 0,
      itemId: 'item-b',
      quantity: 1,
      guaranteed: false,
      guaranteedQuantity: 0,
      assetId: null,
      thumbnailAssetId: null,
      digitalItemType: null
    })

    expect(cards[1]).toMatchObject({
      revealIndex: 1,
      itemId: 'item-a',
      quantity: 8,
      guaranteed: true,
      guaranteedQuantity: 3,
      assetId: 'asset-a',
      thumbnailAssetId: 'thumb-a',
      digitalItemType: 'audio'
    })
  })

  test('不正な件数は0として扱い、結果カードから除外する', () => {
    const aggregatedItems: DrawResultAggregatedItem[] = [
      {
        itemId: 'item-zero',
        name: 'Zero',
        rarityId: 'r1',
        rarityLabel: 'R1',
        count: 0
      },
      {
        itemId: 'item-negative',
        name: 'Negative',
        rarityId: 'r1',
        rarityLabel: 'R1',
        count: -10
      },
      {
        itemId: 'item-valid',
        name: 'Valid',
        rarityId: 'r1',
        rarityLabel: 'R1',
        count: 2,
        guaranteedCount: 99
      }
    ]

    const cards = buildRevealCardsFromAggregatedItems({
      aggregatedItems,
      itemAssetById: new Map(),
      rarityOrderIndex: new Map(),
      itemOrderIndex: new Map()
    })

    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      itemId: 'item-valid',
      quantity: 2,
      guaranteedQuantity: 2
    })
  })
})
