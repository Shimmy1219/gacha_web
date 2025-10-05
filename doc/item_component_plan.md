# ItemCard / ItemCatalog React 移行詳細計画

## 1. 目的
- 既存の `.item-card` DOM を React コンポーネントへ再設計し、Tailwind CSS で視覚を再構築する。
- ItemCard を単一ソースの `ItemCardModel` としてカタログストアで管理し、UserInventory・UserCard が参照で同期できるようにする。
- レアリティ情報は `rarityId` を介して参照のみを保持し、RarityStore の変更が即時に反映されるようにする。

## 2. ドメインモデル
### 2.1 ItemId と ItemKey
- `ItemId`: `itm-xxxxxxxxxx`（接頭辞 3 文字 + 英数字 10 桁）の不変 ID。`index.html` におけるガチャ ID 生成と同じ Base62 乱数ロジック（`nanoid` カスタムアルファベット `A-Za-z0-9`, `size: 10`）で後半 10 桁を生成し、`itm-` を付与して払い出す。重複検査は CatalogStore で行い、衝突時は再発行する。
- `itemKey`: 旧 UI 互換の複合キー `gachaId::rarityId::itemCode`。移行期間中の互換 API・データマイグレーションで利用する。

### 2.2 ItemCardModel
```ts
interface ItemCardModel {
  itemId: ItemId;                // 内部参照用の不変キー
  itemKey: string;               // 旧データとの互換識別子
  gachaId: GachaId;              // 所属ガチャの不変 ID
  gachaDisplayName: string;      // UI 用の表示名
  rarityId: RarityId;            // RarityStore 参照キー。label/color は保持しない
  itemCode: string;              // 入力フォームで扱うコード値
  name: string;                  // 表示名
  imageAsset: {
    thumbnailUrl: string | null;
    assetHash: string | null;
    hasImage: boolean;
  };
  isRiagu: boolean;              // リアグ対象フラグ
  completeTarget: boolean;       // コンプリート対象（デフォルト false）
  pickupTarget: boolean;         // ピックアップ対象（デフォルト false）
  order: number;                 // ガチャ内の並び順
  createdAt: string;             // ISO 文字列
  updatedAt: string;             // ISO 文字列
}
```

### 2.3 参照整合性
- ItemCardModel はレアリティに関する情報を `rarityId` のみ保持する。ラベル・カラー・排出率は `useRarity(rarityId)` セレクタで取得する。
- UserInventory は `ItemId` の配列／辞書を保持し、ItemCardModel の参照を通して名前やフラグを得る。
- ItemCardModel を更新すると、`useItemCard(itemId)` セレクタが変化し、UserInventory 経由の UserCard も再計算される。

## 3. ストア設計
### 3.1 CatalogStore
- `state.itemCards: Record<ItemId, ItemCardModel>` として集中管理。
- アクション:
  - `createItemCard(payload: DraftItemCardInput)` → ItemId 発行・初期値をセット。
  - `updateItemCard(itemId, patch)` → 任意フィールド更新。`updatedAt` 自動更新。
  - `deleteItemCard(itemId)` → 参照先の UserInventory からも除外。
  - `toggleCompleteTarget(itemId)`, `togglePickupTarget(itemId)`, `toggleRiagu(itemId)`。
  - `updateItemAsset(itemId, assetPatch)`。
- 副作用: ItemCard 削除時は `UserInventoryStore` に通知し、該当 `ItemId` を削除。

### 3.2 セレクタ
- `useItemCard(itemId)` → ItemCardModel を memo 付きで返却。
- `useItemRarityMeta(itemId)` → `rarityId` から `RarityStore` を参照し、`label`, `color`, `emitRate`, `rarityNum` を束ねる。
- `useItemFlags(itemId)` → リアグ/コンプリート/ピックアップの boolean をまとめて返す。

## 4. React コンポーネント
### 4.1 ItemCard コンポーネント
```ts
interface ItemCardProps {
  itemId: ItemId;
  model: ItemCardModel;
  rarity: RarityMeta; // useRarity(model.rarityId)
  onToggleCompleteTarget(itemId: ItemId): void;
  onTogglePickupTarget(itemId: ItemId): void;
  onToggleRiagu(itemId: ItemId): void;
  onEditImage(itemId: ItemId): void;
  onRequestDelete(itemId: ItemId): void;
}
```
- レイアウト: `flex flex-col gap-3 rounded-2xl shadow-lg bg-surface`。
- 画像セクション: `aspect-square`, `overflow-hidden`, `bg-neutral-900`. 未設定時は `hasImage === false` を検出しプレースホルダを表示。
- メタ情報: アイテム名、`RarityBadge`（Tailwind `bg-[rarity.color]`）、ガチャバッジを`Stack`配置。
- 操作ボタン: `Complete`, `Pickup`, `Riagu` トグルは `IconToggle` 化し、状態に応じて `data-active` 属性で色を切替。

### 4.2 ItemForm / Modal
- 作成・編集フォームでは `rarityId` のセレクトを提供し、RarityStore の一覧を参照する。
- 旧データ移行時は `itemKey` から `rarityId` を逆算し、ItemCardModel にマッピングするスクリプトを提供。

## 5. 同期・永続化
- IndexedDB では `itemCards` テーブルに `itemId` 主キーで保存。`rarityId` は参照カラムとして保持。
- `AppPersistence` は `saveItemCard(model)` と `deleteItemCard(itemId)` を提供し、UserInventory 保存時と同時に `Promise.all` で commit。
- `completeTarget` / `pickupTarget` の変更は ItemCardModel のみ更新し、UserInventory 側では `itemId` リストを読み替えるだけで UI が更新される。

## 6. テスト
- `generateItemId()` が `itm-` 接頭辞 + 英数字 10 桁（Base62）で構成されること、重複時に再発行されることを Jest/Vitest で確認。
- `updateItemCard` のパッチが `updatedAt` を更新し、参照する UserInventory セレクタが再評価されることを単体テスト。
- Storybook でリアグ・コンプリート・ピックアップの各状態を再現。
- Playwright でトグル操作が UserCard サマリへ即時反映される E2E を作成。
