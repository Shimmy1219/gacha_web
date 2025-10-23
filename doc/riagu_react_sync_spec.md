# Riagu React 同期仕様書

## 1. コンテキスト
- **対象コンポーネント**: `RiaguBoard`, `RiaguCard`, `RiaguModal`, `UserChip`, `RarityBadge`。
- **関連ストア**: `RiaguStore`, `UserInventoryStore`, `HitCountStore`, `UserStore`, `RarityStore`。
- **目的**: リアグ対象アイテムの情報（名称・レアリティ・獲得者・原価）を、React コンポーネントとドメインストアの間でリアルタイムに同期させる。

## 2. データ構造
### 2.1 RiaguStore
```ts
interface RiaguState {
  riaguCards: Record<RiaguId, RiaguCardModel>;
  indexByItemId: Record<ItemId, RiaguId>;
}
```
- `riaguCards[riaguId]` には原価、リアグ種別、任意の発注数 (`orderHint`) を保持。
- `indexByItemId[itemId]` で Item → Riagu の逆引きを保証し、ItemCard トグルと同期する。

### 2.2 UserInventoryStore
```ts
interface UserInventoryState {
  inventories: Record<UserId, Record<InventoryId, UserInventorySnapshot>>;
  byItemId: Record<ItemId, Array<{ userId: UserId; gachaId: GachaId; rarityId: RarityId; count: number }>>;
}

interface UserInventorySnapshot {
  inventoryId: InventoryId;
  gachaId: GachaId;
  items: Record<RarityId, ItemId[]>;
  counts: Record<RarityId, Record<ItemId, number>>;
}
```
- `inventories[userId][inventoryId] = snapshot` で在庫スナップショットを保持。`snapshot.gachaId` で紐づくガチャを識別する。
- `addItem`, `incrementCount`, `bulkReplaceItems` などのアクションが呼ばれると `byItemId` キャッシュも更新する。

### 2.3 HitCountStore
```ts
interface HitCountState {
  byItemId: Record<ItemId, number>;
}
```
- リアルタイム貼り付けやガチャシミュレーター結果を元に、抽選ヒット数を蓄積する。
- `setHitCount(itemId, count)` や `incrementHit(itemId)` が `useRiaguAssignment` の再評価を誘発する。

### 2.4 UserStore
```ts
interface UserStoreState {
  users: Record<UserId, UserCardModel>;
}
```
- `updateUser(userId, patch)` が表示名、アバター色、所属タグを差し替える。
- 変更後は購読しているコンポーネント（`UserChip`, `UserCard`, `RiaguCard`）へコンテキスト経由で新しい `UserCardModel` が提供される。

### 2.5 RarityStore
```ts
interface RarityState {
  byGachaId: Record<GachaId, Record<RarityId, RarityMeta>>;
}
```
- `emitChange()` は `RarityProvider` 内で購読者に通知する低レイヤーのイベントハブ。`updateRarityMeta` 実行後に呼ばれる。

## 3. セレクタと再計算ロジック
### 3.1 useRiaguAssignment(riaguId)
1. `const card = useRiaguCard(riaguId);`
2. `const inventoryHits = useUserInventoryByItem(card.itemId);`
   - `inventoryHits` は `UserInventoryStore.byItemId[itemId]` の結果。
3. `const hitCount = useHitCount(card.itemId);`
4. `const winners = inventoryHits.map(({ userId, count }) => ({ userId, count: Math.max(count, hitCount > 0 ? 1 : 0) }));`
   - ガチャヒット数が存在する場合は最低 1 個として扱い、`count` が 0 のユーザーは除外する。
5. `const totalCount = winners.reduce((sum, winner) => sum + winner.count, 0);`
6. `const effectiveOrderQty = card.orderHint ?? totalCount;`
7. `const totalCost = card.unitCost * effectiveOrderQty;`
8. `return { riaguId, itemId: card.itemId, winners, totalCount, effectiveOrderQty, totalCost };`

### 3.2 useRiaguCard(riaguId)
- `RiaguStore` を購読し、指定 ID の `RiaguCardModel` を返す。
- 内部では `useItemCard(card.itemId)` を併用して Item 名称・レアリティを取得。

### 3.3 useUserChip(userId)
1. `const user = useUserStore(userId);`
2. `return { displayName: user.displayName, avatarUrl: user.avatarUrl };`
- `UserChip` はこの hook を利用し、`userId` を渡すだけでレンダーに必要な表示情報を得る。

## 4. 同期フロー
1. **ユーザー名変更**
   - `UserCard` で編集 → `UserStore.updateUser` → `users[userId]` が更新 → `UserChip` が再レンダー → `RiaguCard` の獲得者ラベルが即時更新。
2. **リアルタイム入力 / ガチャ排出**
   - `RealtimePastePanel` や `GachaSimulator` で結果を入力 → `UserInventoryStore.incrementCount({ userId, gachaId, rarityId, itemId, delta })` → `inventories` と `byItemId` が更新 → `useRiaguAssignment` が再評価 → `winners`・`totalCount`・`effectiveOrderQty`・`totalCost` が更新。
3. **抽選ヒット更新**
   - `HitCountStore.setHitCount(itemId, n)` → `useRiaguAssignment` のステップ 4 で `Math.max(count, hitCount ? 1 : 0)` が再計算され、最低保証数が補正される。
4. **レアリティ設定変更**
   - `RarityStore.updateRarityMeta(gachaId, rarityId, patch)` → 内部で `emitChange()` → `useRarity(rarityId)` を使う `RiaguCard` が再レンダーし、バッジ色とラベルを更新。
5. **リアグメタ編集**
   - `RiaguModal` で原価や発注予定数を更新 → `RiaguStore.updateRiaguMeta` → `useRiaguAssignment` が `effectiveOrderQty` / `totalCost` を即再計算。

## 5. イベント連携
- `ItemCard.toggleRiagu(itemId)`
  - on: `RiaguStore.markItemAsRiagu(itemId, meta)` を呼び、`riaguCards` にレコードを作成。
  - off: `RiaguStore.unmarkRiagu(itemId)` で `riaguCards` / `indexByItemId` を削除し、`RiaguAssignment` の購読も解放する。
- `AppPersistence.saveDebounced()`
  - `RiaguStore`, `UserInventoryStore`, `UserStore` の変更をバッチングし、IndexedDB へまとめて書き込む。

## 6. テスト観点
- **ユニット**: `useRiaguAssignment` にモックしたストア値を与え、`totalCount`・`effectiveOrderQty`・`totalCost` の算出が期待通りか検証。
- **統合**: Playwright シナリオ「ユーザー名変更 → RiaguCard の UserChip が更新」「ガチャ結果貼り付け → 勝者数・原価タグが更新」。
- **回帰**: `UserStore.updateUser` と `RarityStore.emitChange()` の同時更新で無限ループが発生しないかを確認する。

## 7. 将来拡張メモ
- `winners` に `deliveredAt`, `shippingStatus` を追加し配送追跡を行う。
- `HitCountStore` へ履歴ログを追加し、抽選経緯をタイムライン表示する。
- WebSocket 等による他クライアント同期時は `UserInventoryStore` と `RiaguStore` の差分パッチをブロードキャストする。
