# UserCard / UserInventory React 移行詳細計画

## 1. 目的
- ユーザー単位の所持状況を `UserCard` コンポーネントとして再構築し、アコーディオン UI と Tailwind で視覚を再設計する。
- UserInventory を `ItemId` 参照ベースへ移行し、ItemCard の変化が即時に UserCard へ伝播するデータフローを整備する。
- UserInventory 内でもレアリティ情報は `rarityId` のみ保持し、RarityStore の更新へリアクティブに追従する。

## 2. UserInventory データモデル
```ts
interface UserInventory {
  inventoryId: string; // UUID v4。不変
  userId: UserId;
  gachaId: GachaId;
  items: Record<RarityId, ItemId[]>;                     // レアリティ別の ItemId リスト
  counts: Record<RarityId, Record<ItemId, number>>;       // 獲得数辞書
  createdAt: string;                                      // ISO 文字列
  updatedAt: string;
}
```
- `items` の ItemId は必ず CatalogStore の `itemCards` に存在する。不整合時はクレンジングジョブで補修。
- `counts` の辞書キーも ItemId を用い、集計時に ItemCardModel の name / flags を参照してバッジを表示。
- `RarityId` は RarityStore の immutable key。RarityRow の追加・削除・名称変更があっても key は変わらない。

## 3. ストアとセレクタ
### 3.1 UserInventoryStore
- `state.userInventories: Record<UserId, Record<GachaId, UserInventory>>`。
- アクション:
  - `syncInventory(payload: UserInventory)` → ID で置き換え、`updatedAt` 更新。
  - `addItem(userId, gachaId, rarityId, itemId)` → `items` に push、`counts` を加算。
  - `removeItem(...)` → 逆操作。削除後 `counts[itemId] === 0` ならキーを削除。
  - `incrementCount` / `decrementCount` → 数量変更。
  - `bulkReplaceItems(userId, gachaId, rarityId, itemIds[])` → 旧 UI からのリスト読み替えに利用。
- 副作用: ItemCard 削除時に `CatalogStore` から通知を受け `purgeItem(itemId)` を実行。該当 ItemId を全ユーザーから除外。

### 3.2 セレクタ
- `useUserInventory(userId, gachaId)` → `UserInventory` 全体を取得。
- `useUserInventoryWithItems(userId, gachaId)` → `useItemCard`・`useRarity` を内部で呼び、UI 用の `ItemViewModel` 配列を返却。
- `useUserCompletionStats(userId)` → `completeTarget === true` の ItemCard を集計し、ユーザー達成率を算出。
- `useUserPickupStats(userId)` → ピックアップ対象の所持率／獲得数を算出。

## 4. React コンポーネント
### 4.1 UserCard コンポーネント
```ts
interface UserCardProps {
  userId: UserId;
  userName: string;
  inventories: Record<GachaId, UserInventory>;
  expandedByDefault?: boolean;
  onExport(userId: UserId): void;
  onOpenProfile(userId: UserId): void;
}
```
- `Disclosure` を用いたアコーディオン構造。ヘッダーにユーザー名・総所持数・リアグ対象数・コンプリート率などを表示。
- ボディはガチャ単位のタブ／セクションを描画し、`UserInventory` の `items` を `ItemChip` リストとして表示。`ItemChip` は `itemId` を受け取り `useItemCard` で情報を取得。
- ガチャセクションでは `rarityId` ごとにサブヘッダーを設け、`RarityBadge` で色／ラベルを表示し `counts` を数値バッジで表す。
- `UserCard` 内から `onOpenItemDetail(itemId)` を呼び出せるようにし、モーダル等で ItemCard 詳細へジャンプ。

### 4.2 UserInventoryTable / ItemChip
- `UserInventoryTable` は `rarityId` ごとに `ItemChip` を並べるグリッド。`grid-cols-auto-fill` と Tailwind でレスポンシブに配置。
- `ItemChip` は `itemId` のみ props に取り、`useItemCard`・`useRarity` を内部で参照して名前・色・各種フラグバッジを描画。
- Chip 上のアクション（長押しで削除、クリックで詳細）は `UserInventoryStore` のアクションを dispatch。

## 5. データ同期
- `hydrateAppSnapshot(snapshot: AppSnapshot)` で `snapshot.users[userId][gachaId]` をそのまま `UserInventoryStore` へ初期投入し、`CatalogEntry.itemsByRarity` と突合して `ItemId` の破損チェックを行う。破損している場合は `snapshot.legacyItemCodes?.[gachaId]` から `ItemCode` を逆引きして補完する。
- `CatalogStore` → `UserInventoryStore` の一方向通知:
  1. ItemCard 作成: 対象ユーザーには即時影響なし。
  2. ItemCard 更新: `useItemCard` 経由の参照が変わり、UserCard が再レンダー。
  3. ItemCard 削除: `purgeItem(itemId)` で UserInventory の `items`・`counts` から削除し、UI も即時更新。
- `RarityStore` 更新時は `rarityId` を持つ UI が `useRarity` 経由で再描画されるため、UserCard 側の色・ラベルも即時反映。

## 6. 永続化
- IndexedDB に `userInventories` テーブルを用意し、キーは `[userId, gachaId]`。値として `UserInventory` を保存。
- 保存時に `items` 内の ItemId をバリデートし、存在しない ID はログに記録。自動修復ジョブが `CatalogStore` から再生成する。
- スナップショット書き出し時は `AppSnapshot` の `users` と `catalogs` を再構築し、`CatalogEntry.itemsByRarity` / `UserInventory.items` を基準に `legacyItemCodes` と `CatalogEntry.legacyItemCodeIndex` を再生成する。旧形式からの直接読み込みは行わず、`AppSnapshot` 側で提供される逆引き辞書を利用して整合性を確保する。

## 7. テスト
- 単体テスト: `addItem`・`removeItem` が ItemId 参照を正しく更新するか検証。
- 結合テスト: ItemCard の `toggleCompleteTarget` → UserCard の達成率が即座に更新されるか確認。
- E2E: UI 上でアイテムを追加・削除し、アコーディオン開閉やタブ切替が正しく動作することを確認。
