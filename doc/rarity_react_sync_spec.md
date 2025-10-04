# RarityStore リアクティブ同期仕様（React 移行向け）

## 背景
- 既存の `src/rarity.js` は Services.rarity を介して DOM を直接書き換え、レアリティ名称・色・排出率が変更されるたびに ItemCard / UserCard / RiaguItem へ手動で反映している。
- React 移行後は、レアリティ設定の変更を単一ストアに集約し、参照側コンポーネントが `rarityId` 経由で同じデータを読むことで「Python のリスト参照」のような同期体験を実現する必要がある。

## 目的
1. レアリティ設定パネル（RarityBoard）での編集を React state として一元管理する。
2. ItemCard・UserCard・RiaguItem など他セクションの UI は `rarityId` を介してストアを参照し、自前の複製を持たない。
3. rename/color/emitRate 更新時に参照側が追加ロジックなしで即時再レンダーされる。

## RarityStore 設計
### ストア構造
```ts
interface RarityState {
  byGacha: Record<GachaId, RarityId[]>;          // ガチャ → rarityId の順序付きリスト
  entities: Record<RarityId, RarityMeta>;        // rarityId → メタデータ
  indexByName: Record<GachaId, Record<string, RarityId>>; // 旧ラベル互換（Riaguや旧データ用）
  listeners: Set<() => void>;                    // useSyncExternalStore 用
}
```
- `RarityMeta` は `label`, `color`, `emitRate`, `rarityNum`, `sortOrder`, `updatedAt` を保持する。
- rename 時は `entities` の `label` を更新し、`indexByName[gachaId]` も同期。`rarityId` 自体は不変。
- emitRate 正規化は `updateEmitRate(gachaId, rarityId, rate)` アクション内で `normalizeEmitRates(gachaId)` を呼んで処理。

### 更新 API
```ts
updateRarity(rarityId, patch)
renameRarity(rarityId, newLabel) // label 重複チェック
setRarityColor(rarityId, color)
updateEmitRate(gachaId, rarityId, rate)
deleteRarity(rarityId)
reorderRarities(gachaId, nextOrder: RarityId[])
```
- すべてのアクションは `entities` を直接書き換えた後に `emitChange()` を実行し、登録リスナーへ通知する。
- emitRate 更新時の正規化は `gachaId` 単位で実施し、最下位レアリティに余剰を割当する。`src/rarity.js` の `normalizeEmitViaService` を TypeScript 化して再利用する。【F:src/rarity.js†L58-L86】

## React での参照方法
### 差分再描画ポリシー
- 既存の `renderItemGrid` や `renderUserCardList` のような手続き的関数は「セクション全体を破棄して描画し直す」挙動を取っている。
- React 版では、各セクションを `RarityProvider`（`RarityStore` を context で渡す）配下に配置し、**参照している rarityId が変化した要素だけを再レンダー**する。
- 具体例:
  - `ItemGrid` は `items` 配列から `ItemCard` をマップして描画するが、`items` 自体は別ストア管理で不変。レアリティ更新時は `ItemCard` 内部の `useRarity` hook が再評価され、変更されたカードのみが再描画される。
  - `UserSection` は `React.memo` + `useRarityList(gachaId)` を併用し、レアリティ順序配列が変わった場合のみソート済みリストを更新する。emitRate や color の変更ではリスト本体の再構築が発生せず、`RarityBadge` など局所部品だけが更新される。
  - `RiaguWinners` では `useRarity` を呼ぶ `RiaguItem` が `rarityId` ごとに memo され、他の当選者には影響がない。
- これにより、React の reconciliation が差分を検出し、従来の「全セクション再描画」を避けられる。

### useRarityStore 実装
- `useSyncExternalStoreWithSelector` を利用し、`(state) => selectRarityMeta(state, rarityId)` のような selector を渡す。
- selector の戻り値は `memoize-one` 等で shallow equal 判定を行い、変更がない限り参照側コンポーネントを再レンダーさせない。
- これにより Python のリスト参照と同様に、同じ `rarityId` を読む全コンポーネントが単一オブジェクトを共有しつつリアクティブに更新される。

```ts
export function useRarity(rarityId: RarityId) {
  return useRarityStore(
    React.useCallback((state) => state.entities[rarityId], [rarityId]),
    shallowEqual
  );
}
```
- `shallowEqual` はラベル・色・排出率など主要フィールドが変わった場合のみ再描画を発生させる。

- `ItemCard`: `const rarity = useRarity(model.rarityId);` → `rarity.label`/`rarity.color` を表示。【F:doc/item_component_plan.md†L38-L65】
- `UserCard`: `useRarity(rarityId)` で列ヘッダーのバッジを生成し、`UserInventory` の `counts` は `rarityId` キーで保持する。【F:doc/user_component_plan.md†L6-L59】
- `RiaguItem`: `useRarity(item.rarityId)` からラベルと色を取得し、モーダル表示や当選者リストに適用する。【F:doc/riagu_component_plan.md†L17-L88】
- いずれも `React.memo` / `memoize-one` と組み合わせ、props が変わらない限り再描画を抑制する。`rarityId` のみを依存にすることで、RarityStore の更新粒度と 1:1 で同期できる。
- どのコンポーネントも label/color/emitRate を props で受け取らず、`rarityId` のみ保持するため、RarityStore の変更が自動的に波及する。

## 同期シナリオ
| 操作 | ストア更新 | 参照側の挙動 |
| ---- | ---------- | ------------- |
| レアリティ名の変更 | `renameRarity` が `entities[rarityId].label` を更新し `emitChange()` | `useRarity` を利用するコンポーネントが再レンダーし、バッジ・リスト表示が新ラベルに変わる |
| カラー変更 | `setRarityColor` で `color` を更新 | `RarityBadge` や各カードの背景色が直ちに更新 |
| 排出率変更 | `updateEmitRate` → `normalizeEmitRates` | RarityBoard の合計表示が再計算されるとともに、RiaguItem やユーザ統計の排出率表示が即時更新 |
| 削除 | `deleteRarity` が `entities` から削除し、`byGacha` から除去 | `useRarity(rarityId)` は `undefined` を返し、参照側は Missing 表示へフォールバック |

## 実装メモ
- コンポーネントごとに `useRarityList(gachaId)` や `useRarityBadges(gachaId)` などの selector を提供し、再利用部分は Hooks 化する。
- 永続化は `useEffect` で `RarityStore` の変更を購読し、`localforage` へ書き出す。`rarityconfig:changed` のようなカスタムイベントは React 側では不要になる。
- 旧 UI との共存期間は `services.rarity` と RarityStore を EventBridge で同期し、最終的に React 側をソースオブトゥルースにする。

## Python の参照的挙動との比較
- Python リストは同一オブジェクトを参照するため、リスト要素の変更が他の参照にも反映される。React ではイミュータブル更新が基本だが、`useSyncExternalStoreWithSelector` と `immer`/`mutable draft` を活用することで、ストア内部ではミュータブルに更新しつつ selector 経由で差分のみを検知できる。
- 重要なのは「同じ `rarityId` を key としたストアの値を、全コンポーネントが selector で共有する」こと。これにより Python 的な参照共有を疑似的に再現できる。

## テスト戦略
1. `renameRarity` 実行 → ItemCard / UserCard / RiaguItem が新ラベルを表示する E2E テスト。
2. `setRarityColor` 実行 → `RarityBadge` のスタイルが更新されるビジュアルスナップショット。
3. `updateEmitRate` 実行 → 排出率正規化ロジックが 100% を保ち、RiaguItem の確率表示が更新される単体テスト。
4. `deleteRarity` 実行 → 参照側が Missing ハンドリングを行うことを確認する統合テスト。
