# RarityStore / Rarity UI React 移行詳細計画

## 1. 目的
- 既存のレアリティ編集 UI を React + Tailwind CSS で再構築し、列追加・削除・名称変更・色／排出率変更の操作性を改善する。
- 各レアリティ行に不変の `rarityId` を付与し、ItemCard・UserInventory が参照できるようにする。
- RarityStore を単一ソースとし、`rarityId` を通じて ItemCard / UserCard へリアルタイムに反映させる。

## 2. データモデル
### 2.1 RarityId
- `RarityId`: `rar-xxxxxxxx` の形式（`nanoid` + 接頭辞）で生成する不変 ID。
- 生成タイミング: 「レアリティを追加」ボタンで新しい行を作成した瞬間。
- 削除後も ID は再利用しない。履歴や参照整合性のためにユニーク性を保証。

### 2.2 RarityMeta
```ts
interface RarityMeta {
  rarityId: RarityId;           // 不変キー
  gachaId: GachaId;             // 所属ガチャ
  label: string;                // 表示名（例: SSR, UR）
  color: string;                // Tailwind カラーまたは HEX
  rarityNum: number;            // 強さ指標 (0–20)
  emitRate: number;             // 排出率 (0–100)
  sortOrder: number;            // 表示順。ドラッグ&ドロップで更新
  createdAt: string;
  updatedAt: string;
}
```

### 2.3 RarityStore
- `state.rarities: Record<GachaId, RarityMeta[]>`。ガチャごとに配列を保持。
- `state.index: Record<RarityId, { gachaId: GachaId; index: number }>` で逆引き用インデックスを管理し、ItemCard などが高速に参照できるようにする。

## 3. 操作フロー
### 3.1 追加
1. 「レアリティを追加」ボタン押下 → `createRarity(gachaId)` アクションを dispatch。
2. 新規 `RarityId` を発行し、デフォルト `label` は `"Rarity ${n}"`, `color` はパレットから自動割当、`emitRate` は残余率を自動計算。
3. UI 上では即座に新しい `RarityRow` が挿入され、名称セルにフォーカス。

### 3.2 編集
- `RarityRow` 内のフォーム要素は `label`, `color`, `rarityNum`, `emitRate` を直接編集できる。変更は `debounce` 付きで `updateRarity(rarityId, patch)` を dispatch。
- 変更がコミットされると `updatedAt` が更新され、`useRarity(rarityId)` を購読している ItemCard / UserCard が再レンダーし最新値を表示。

### 3.3 削除
- `deleteRarity(rarityId)` アクションで配列から除外。削除時に確認ダイアログを表示。
- 削除された `rarityId` を参照している ItemCard は `missing rarity` 状態としてマーキングされ、Catalog 管理画面で再設定を促す。UserInventory は `rarityId` ごとの配列から対象アイテムを「未分類」として一時的に保持し、管理者が再割当できるようにする。

### 3.4 並び替え
- ドラッグ＆ドロップで `sortOrder` を更新。`updateRarityOrder(gachaId, newOrder: RarityId[])` を dispatch し、`RarityMeta.sortOrder` を再計算。

## 4. React コンポーネント
### 4.1 RarityBoard
- ガチャごとのタブとレアリティ表全体を管理する親コンポーネント。
- `useRarityList(gachaId)` で `RarityMeta[]` を取得し、`RarityRow` をレンダリング。
- 合計排出率が 100% を超過／不足した際はアラートを表示。`normalizeEmitRates(gachaId)` を提供し、残余率を最下行へ割当。

### 4.2 RarityRow
```ts
interface RarityRowProps {
  rarityId: RarityId;
  meta: RarityMeta;
  onChange(patch: Partial<RarityMeta>): void;
  onDelete(): void;
}
```
- 行ごとに `rarityId` を data 属性として保持し、ドラッグ＆ドロップやテストの識別子に利用。
- `label` 入力: ユニーク制約をリアルタイム検証。同一ガチャ内で重複不可。
- `color` 入力: カラーピッカーを組み込み、HEX/プリセット両方をサポート。変更後は ItemCard のバッジ色が即時更新。
- `emitRate` 入力: 0–100 の数値入力。変更時にガチャ内の合計が 100 になるよう `RarityBoard` が再正規化。
- 削除ボタン: `onDelete` を呼び、RarityStore の `deleteRarity` を発火。

### 4.3 RarityBadge
- UI 共通コンポーネントとして `rarityId` を受け、`useRarity` で `label` と `color` を取得。ItemCard・UserCard・メニュー内で再利用。

## 5. 参照連携
- ItemCard は `ItemCardModel.rarityId` のみ保持し、表示時は `useRarity(model.rarityId)` を通じて `label`, `color`, `emitRate` を取得。
- UserInventory は `items: Record<RarityId, ItemId[]>` で構成され、レアリティ列の見出しに `RarityBadge` を使用。RarityRow の更新が即時反映される。
- `rarityId` が削除された場合:
  - ItemCard: `missingRarity` フラグを追加し、管理画面で再設定ダイアログを表示。
  - UserInventory: 当該 `rarityId` を `unassigned` キーへ退避し、UI には警告バナーを表示。
  - データ修復後（新しい rarityId へ再割当）に `updateItemCard` で ItemCardModel.rarityId を変更すると、UserInventory も参照を更新。

## 6. 永続化とマイグレーション
- IndexedDB `rarities` テーブルに `[gachaId, rarityId]` をキーとしたレコードを保存。
- 旧データ（ラベルベースの参照）から移行する際は:
  1. 既存レアリティ行を走査し、新しい `rarityId` を発行。
  2. `ItemCardModel.rarityId` と `UserInventory.items` のキーをラベルから ID へ書き換え。
  3. ラベルが変更されても ID はそのまま残るため、以降はラベル変更で ItemCard / UserCard が自動更新される。
- 排出率の合計を保証するマイグレーションを実行し、不足分は最下位レアリティへ自動加算。

## 7. テスト
- 単体テスト: `createRarity` がユニーク `rarityId` を生成し、初期 emitRate が 100% 以下であること。
- 結合テスト: RarityRow のラベル／色を変更 → ItemCard バッジと UserCard のレアリティ列が即時更新すること。
- E2E: レアリティの追加→削除→名称変更を行い、ItemCard / UserInventory の表示が矛盾しないか検証。
