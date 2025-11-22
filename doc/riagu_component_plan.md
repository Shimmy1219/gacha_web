# RiaguCard / RiaguBoard React 移行詳細計画

## 1. 目的
- 既存の `.riagu-item` DOM を React コンポーネントに再構築し、Tailwind CSS へ置き換える。
- リアグ（リアルグッズ）対象アイテムを `ItemCard` / `UserCard` と参照で結合し、名称・レアリティ・獲得者情報の即時同期を実現する。
- 旧 UI の `riaguMeta`（原価・種別）と `skipSet`（対象キー）を型安全なストアへ移行し、React で集計・編集できるようにする。

## 2. ドメインモデル
### 2.1 ID
- `RiaguId`: 10 桁の数字を用いる不変 ID。リアグ設定の追加順に生成し、ItemCard と 1:1 で紐づく。

### 2.2 RiaguCardModel
```ts
interface RiaguCardModel {
  riaguId: RiaguId;              // 内部参照キー
  itemId: ItemId;                // ItemCard を参照（名称・画像・rarityId はここから取得）
  gachaId: GachaId;              // 便宜上保持（ItemCard から複製し整合チェック）
  rarityId: RarityId;            // ItemCard.rarityId のスナップショット（不整合検出用）
  typeId: RiaguTypeId | null;    // カテゴリ分類（例: "badge" | "acrylic"）
  typeLabel: string;             // UI 表示用の文言。翻訳等の都合で別管理
  unitCost: number;              // 原価（円）。`riaguMeta.cost` を移行
  orderHint: number | null;      // 手入力の発注予定数。null の場合は獲得数に追従
  createdAt: string;             // ISO 文字列
  updatedAt: string;             // ISO 文字列
}
```

### 2.3 参照整合性
- `itemId` を介して `ItemCardModel` を参照する。名称・レアリティ・リアグ対象フラグは ItemCard を単一ソースとする。
- レアリティ表示は `ItemCardModel.rarityId` → `RarityStore` から `label`/`color` をリアルタイムで取得する。
- 獲得ユーザーは `RiaguAssignment` セレクタで `UserInventory` を参照し、`UserId` のみを `RiaguCard` が受け取る。

### 2.4 RiaguAssignmentModel（派生データ）
```ts
interface RiaguAssignmentModel {
  riaguId: RiaguId;
  itemId: ItemId;
  winners: Array<{ userId: UserId; count: number }>;
  totalCount: number;           // winners の count 合計
  effectiveOrderQty: number;    // orderHint ?? totalCount
  totalCost: number;            // unitCost * effectiveOrderQty
}
```
- `RiaguAssignmentModel` は `RiaguCardModel` と `UserInventoryStore` の状態から導出し、ストアには保存しない。
- `UserInventoryStore` は `[userId][gachaId][rarityId][itemId]` のネスト辞書で在庫数を保持し、`RiaguAssignment` は `inventory.byItemId[itemId]` 逆引きのキャッシュを併用して獲得者リストを構築する。

## 3. ストア設計
### 3.1 RiaguStore
- `state.riaguCards: Record<RiaguId, RiaguCardModel>` と `indexByItemId: Record<ItemId, RiaguId>` を保持。
- 主なアクション:
  - `markItemAsRiagu(itemId, { unitCost, typeLabel, typeId, orderHint })`
    - ItemCard 参照から `gachaId`/`rarityId` を複製し、RiaguId を新規発行。
  - `updateRiaguMeta(riaguId, patch)`
    - `unitCost`・`typeLabel`・`typeId`・`orderHint` 等を部分更新し `updatedAt` を刷新。
  - `unmarkRiagu(itemId | riaguId)`
    - `RiaguCard` を削除し、`indexByItemId` からも除外。
  - `pruneByCatalog(validItemIds: ItemId[])`
    - カタログから削除されたアイテムに紐づくリアグをまとめて除去。
- 旧データ移行では既存の `itemId` 参照をもとに `indexByItemId` を初期化する。

### 3.2 セレクタ / 派生ストア
- `useRiaguCard(riaguId)` → `RiaguCardModel` を返却し、`itemId` を元に `ItemCard` の状態を取得する。
- `useRiaguCardsByGacha(gachaId)` → `RiaguCardModel[]` を並び順付きで返却。ItemCard の `order` で sort。
- `useRiaguAssignment(riaguId)` → `RiaguAssignmentModel` を生成。内部で以下のステップを踏む:
  1. `itemId` から `UserInventoryStore` の逆インデックス `inventory.byItemId[itemId]` を参照し、該当ユーザーと所持数を列挙。
  2. `HitCountStore`（旧 `gHitCounts` 相当）から取得数を補正。`count = max(hitCount, inventoryCount ? 1 : 0)` を適用。
  3. 生成した `userId` 配列を `UserStore`（`UserCardModel`）へ渡して表示名を取得。
  4. `unitCost` / `orderHint` を用いて `effectiveOrderQty` と `totalCost` を算出。
- `useRiaguSummary(gachaId)` → 上記 `assignment` の `totalCost` 合計と `effectiveOrderQty` 合計を算出し、タブフッターに表示する。

### 3.3 監視と同期
- `ItemCardStore` が `toggleRiagu(itemId)` を発火した際に `RiaguStore` へ通知し、存在しない `RiaguCard` を初期化する。
- `UserInventoryStore` または `HitCountStore` が更新されたら、`RiaguAssignment` セレクタが再評価され `RiaguCard` が再レンダーする。
- `UserStore.updateUser` はユーザープロファイル辞書（`Record<UserId, UserCardModel>`）を直接更新するドメインアクションであり、更新後は `UserChip` が参照している `userId` → 表示名/テーマのマッピングが差し替わる。`RarityStore.emitChange()` のような購読者通知とは層が異なるが、両者とも UI 再描画のトリガーになることを想定する。
- `RarityStore.onChange` を購読して `RiaguBoard` を再レンダー（Tailwind の色が即反映されるようにする）。
- `RiaguBoard` 内の `useRarity(item.rarityId)` が `useRarityStore` を通じて `emitChange()` 通知を購読し、`setRarityColor` などで更新された Tailwind 色を即座に反映する。
  - レアリティ編集アクションは `entities` を更新した直後に `emitChange()` を呼ぶため、追加の再描画トリガーは不要。

## 4. React コンポーネント設計
### 4.1 RiaguBoard
- `Tabs` + `TabPanels` 構成でガチャごとにグルーピング。初期選択は最初のガチャ。
- 各タブパネルでは `RiaguCard` を並べ、下部に合計行 (`RiaguSummaryBar`) を表示。
- 旧 UI のローカルストレージ `selectedRiaguGacha` を `useLocalStorageState` で保持し、復帰時にタブ選択を再現。

### 4.2 RiaguCard コンポーネント
```ts
interface RiaguCardProps {
  riaguId: RiaguId;
  card: RiaguCardModel;
  item: ItemCardModel;                   // useItemCard(card.itemId)
  itemRarity: RarityMeta;                // useRarity(item.rarityId)
  assignment: RiaguAssignmentModel;      // useRiaguAssignment(riaguId)
  onEdit(riaguId: RiaguId): void;        // モーダルを開く
  onUnset(riaguId: RiaguId): void;       // リアグ解除
}
```
- ヘッダー: `RarityBadge` + Item 名称（`item.name`）+ 種別バッジ（`card.typeLabel`）。
- 統計: `unitCost`, `assignment.effectiveOrderQty`, `assignment.totalCost` をタグ表示。Tailwind で `grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))]`。
- 獲得者: `assignment.winners` を `UserChip` コンポーネントで表示。`UserChip` は `userId` を受け取り `UserStore` から表示名とアバター色を取得する。
- アクション: 「編集」「解除」ボタン。編集押下で `RiaguModal` を開く。

### 4.3 RiaguModal
- 既存の `#riaguModal` を React + Headless UI `Dialog` に置換。
- フィールド: 原価（number）、リアグ種別（select or free text）、発注予定数（任意）、備考（将来拡張用）。
- 保存時:
  1. `RiaguStore.updateRiaguMeta` を dispatch。
  2. `ItemCardStore.toggleRiagu` が未実行であれば `markItemAsRiagu` を呼ぶ。
  3. `AppPersistence.saveDebounced()` をトリガー。
- 「解除」は `unmarkRiagu` を呼び、`RiaguBoard` の再描画につなげる。

### 4.4 既存コンポーネントとの連携
- `ItemCard` のリアグトグルは `RiaguStore` の存在を確認し、オンにした時点で `RiaguCardModel` を生成し `RiaguBoard` に表示する。
- `UserCard` は `UserChip` 内の `userId` 表示に使用するため、ユーザー名変更時は `UserStore` の更新で即時反映される。
- `RarityBadge` は `ItemCard` と共通のコンポーネントを使い、色クラス（Tailwind `bg-[color]`）を共有。

## 5. データ同期フロー
1. Item 編集で名称を変更 → `ItemCardStore.updateItemCard` → 参照している `RiaguCard` が `item.name` を再描画。
2. UserCard でユーザー名変更 → `UserStore.updateUser` → `UserChip` が再計算され `RiaguCard` の獲得者表示が更新。
3. ガチャ結果の追加や手動入力で `UserInventoryStore.incrementCount` 等が発火 → `[userId][gachaId][rarityId][itemId]` のカウントが更新され、次フレームで `RiaguAssignment` が再評価され `winners` / `totalCount` / `effectiveOrderQty` / `totalCost` が最新化される。
4. 抽選結果のインポートで `HitCountStore` 更新 → `RiaguAssignment` セレクタが `totalCount` を再計算し、発注数と合計金額が自動更新。
5. レアリティ設定変更 → `RarityStore` の `label`/`color` が更新 → `RiaguCard` のバッジ色が即時変更。

## 6. 永続化と移行
- 旧 `riaguMeta` ローカルストレージを読み込み、保持されている `itemId` を用いて `RiaguCardModel` を作成。マッチしない ID はログへ出力し手動対応。
- 永続化層（IndexedDB / JSON export）は `riaguCards` テーブルを新設し、`riaguId` を主キー、`itemId` を一意制約として保存。`orderHint` が null の場合は保存しない。
- エクスポート/インポートでは `ItemCard` より前に `RiaguCard` を読み込むよう順序を定義。

## 7. テスト計画
- 単体テスト: `markItemAsRiagu` が `ItemCard` の参照に成功するか、重複時に既存レコードを更新するか検証。
- セレクタテスト: `useRiaguAssignment` が `UserInventory` + `HitCountStore` の変更に追随し、`totalCost` を正しく計算するか確認。
- UI テスト: Playwright で
  1. ItemCard のリアグトグル → RiaguBoard に表示される。
  2. User 名称変更 → RiaguCard に即時反映。
  3. 原価編集 → 合計金額がリアルタイム更新。
- スナップショット: Storybook でレアリティ別に 3 ケース（SSR/RV/N）を作成し、Tailwind のテーマ対応を確認。

## 8. 今後の拡張余地
- リアグ種別をマスタ化し、`RiaguTypeStore` で選択肢を管理する。
- `RiaguAssignmentModel` に「配送ステータス」や「在庫ステータス」を追加し、バックオフィス用途へ拡張。
- 集計表を CSV 出力する `RiaguExportButton` を追加し、合計金額と個別ユーザーの明細を吐き出せるようにする。
