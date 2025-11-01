# pull-history:v1 と user-inventory:v3 の同期設計

## 目的
pull-history:v1 を単一のソース・オブ・トゥルースとして扱い、ガチャ結果や手動調整の履歴から user-inventory:v3 を再構築する仕組みを明文化する。ここではデータ構造、更新フロー、プロジェクションの要点、および周辺 API の責務をまとめる。

## ストレージとキー
- pull-history:v1 は `gacha:pull-history:v1` キーに保存され、履歴 (`order` と `pulls`) を保持する。【F:apps/web/src/domain/app-persistence/appPersistence.ts†L21-L40】【F:apps/web/src/domain/app-persistence/types.ts†L94-L113】
- user-inventory:v3 は `gacha:user-inventories:v3` キーに保存され、ユーザー・ガチャ別の在庫スナップショットと逆引きインデックスを持つ。【F:apps/web/src/domain/app-persistence/appPersistence.ts†L21-L38】【F:apps/web/src/domain/app-persistence/types.ts†L66-L85】
- どちらも `AppPersistence` を介して読み書きされ、`PersistedStore` 経由でストアへ供給される。

## Pull History のデータモデル
`PullHistoryEntryV1` は以下のフィールドを持つ。

| フィールド | 概要 |
| --- | --- |
| `id` | エントリ固有 ID (`pull-xxxxx`)。`generatePullId` で生成。 |
| `gachaId` | 対象ガチャ ID。未設定の場合は履歴として採用されない。 |
| `userId` | 任意。未指定時はプロジェクションで既定ユーザーに紐付く。 |
| `executedAt` | ISO 8601 形式の実行時刻。欠損時は挿入時に補完される。 |
| `pullCount` | ガチャ実行数。`appendPull` では 1 以上が必須。手動調整では 0。 |
| `currencyUsed` | 消費通貨。手動調整では常に 0。 |
| `itemCounts` | アイテム ID ごとの獲得数または差分。`source` が `'manual'` の場合のみ負数を許容。 |
| `rarityCounts` | レアリティ別の集計。手動調整では通常不要。 |
| `source` | `'insiteResult'`（アプリ内ガチャ結果）、`'realtime'`（リアルタイム貼り付け）、`'manual'`（手動編集）。未指定時は `'insiteResult'` に正規化される。 |
| `status` | 履歴エントリの利用状況マーカー。`'new'`（未出力）、`'ziped'`（ZIP に同梱済み）、`'uploaded'`（共有リンク発行済み）。省略時は未設定として扱う。 |

`PullHistoryStore` は以下の責務を持つ。【F:apps/web/src/domain/stores/pullHistoryStore.ts†L1-L210】

- `hydrate` で既存データを読み込みつつ `source` を必須化し、重複 ID や欠損を整える。
- `appendPull` でガチャ実行結果を追加。正の `pullCount` と非負のアイテム数のみ受け付ける。
- `recordManualInventoryChange` で在庫差分（増減）を `pullCount=0`、`currencyUsed=0` の履歴として記録。アイテムごとの差分を `itemCounts` に保持し、`source` を `'manual'`（または `'realtime'`）として保存する。【F:apps/web/src/domain/stores/pullHistoryStore.ts†L210-L314】
- `deletePullsForInventory` や `deleteManualEntriesForItem` などのクリーンアップ API で、関連する履歴を一括削除する。

Pull History の `order` 配列は最近の更新順で並び、プロジェクションではこの順序を優先して履歴を処理する。欠番が存在する場合も `pulls` オブジェクトから補完する。【F:apps/web/src/domain/inventoryProjection.ts†L134-L186】

## User Inventory のデータモデル
`UserInventoriesStateV3` は次の構造を持つ。【F:apps/web/src/domain/app-persistence/types.ts†L66-L85】

- `inventories`: `userId` → `inventoryId` → `UserInventorySnapshotV3`
  - `items`: レアリティ別のアイテム ID 配列（個数分だけ ID を繰り返す）
  - `counts`: レアリティ別のアイテム個数
  - `totalCount`: アイテム総数。0 の場合は省略。
  - `createdAt` / `updatedAt`: Pull History 由来のタイムスタンプを採用。
- `byItemId`: アイテム ID → 在庫参照リスト（`userId`, `gachaId`, `rarityId`, `count`）
- `version` / `updatedAt`: スナップショット全体のメタデータ

`UserInventoryStore` はプロジェクション結果をそのまま受け取り、外部からの直接更新 API を提供しない読み取り専用ストアである。`applyProjectionResult` のみが状態注入の手段であり、永続化モードは `'none'` に固定される。【F:apps/web/src/domain/stores/userInventoryStore.ts†L1-L21】

## プロジェクションの流れ
`projectInventories` は Pull History 全体を走査して在庫スナップショットを構築する純粋関数である。【F:apps/web/src/domain/inventoryProjection.ts†L1-L214】【F:apps/web/src/domain/inventoryProjection.ts†L214-L400】主な手順は以下の通り。

1. カタログ (`GachaCatalogStateV3`) を元にアイテム ID → レアリティ ID のインデックスを生成。
2. Pull History を `order` に従って整列し、各エントリをユーザー・ガチャ単位で集計。
   - `'manual'` 以外のソースは正の値のみ加算。`'manual'` は負数を含む差分として計上する。
   - エントリの `executedAt` が欠損・不正な場合はプロジェクション実行時刻で補完する。
3. 集計結果から `UserInventorySnapshotV3` を構築。
   - 個数が 0 以下になったアイテムは自動的に除去される。
   - レアリティ別のリストをソートし、`items` と `counts` を同期させる。
4. `byItemId` インデックスを再生成し、オプションで旧在庫 (`legacyInventories`) をマージして孤児データを保持する。
5. ダイアグノスティクス（投影されたユーザー数、在庫数、警告、孤児リスト）を返す。

## ストア間の同期
`createDomainStores` は Pull History と User Inventory を次のように同期させる。【F:apps/web/src/domain/stores/createDomainStores.ts†L1-L66】

1. 永続化スナップショットを読み込み、各ストアを `hydrate` する。
2. 初期ロード直後に一度だけ `projectInventories` を実行し、旧在庫 (`legacyInventories`) を加味した結果を `UserInventoryStore.applyProjectionResult` に流し込む。
3. `PullHistoryStore` を購読し、履歴更新が発生したタイミングで再度プロジェクションを実行。結果を在庫ストアへ反映し、`saveDebounced` で `user-inventory:v3` を遅延保存する。
4. User Inventory は他ストアから mutate されないため、Pull History の変更が唯一の再計算トリガーとなる。

## 更新フローの例
### ガチャ結果（アプリ内）
1. UI でガチャを実行すると、`appendPull` が呼ばれ `source: 'insiteResult'` の履歴が追加される。
2. Pull History 更新を検知した `createDomainStores` がプロジェクションを再実行し、在庫が更新される。

### リアルタイム貼り付け
1. `livePaste` が解析した結果を `appendPull` に渡し、`source: 'realtime'` のエントリを追加する。【F:apps/web/src/logic/livePaste.ts†L1-L120】
2. 以降の流れはガチャ結果と同一。

### 手動編集
1. 在庫編集 UI（`UserCard.tsx`）で変更が発生すると、差分値が `recordManualInventoryChange` に渡される。【F:apps/web/src/pages/gacha/components/cards/UserCard.tsx†L120-L228】
2. `pullCount=0`・`currencyUsed=0` の `'manual'` エントリが追加され、プロジェクションで正負の差分として合算される。
3. アイテム削除やガチャ削除時には対応する手動エントリも `deleteManualEntriesForItem` 等で除去し、一貫性を保つ。【F:apps/web/src/domain/stores/pullHistoryStore.ts†L314-L398】

### 保存と共有
1. 保存ダイアログで ZIP を生成すると、同梱対象の履歴エントリに `status: 'ziped'` が付与される。【F:apps/web/src/features/save/buildUserZip.ts†L290-L382】【F:apps/web/src/modals/dialogs/SaveOptionsDialog.tsx†L198-L228】
2. 共有リンクを発行した場合は、同じエントリの `status` が `'uploaded'` に更新される。【F:apps/web/src/modals/dialogs/SaveOptionsDialog.tsx†L240-L270】
3. 新規に追加された履歴（ガチャ実行・手動編集）は `status: 'new'` から開始し、エクスポート状況を段階的に追跡できる。【F:apps/web/src/domain/stores/pullHistoryStore.ts†L118-L207】

## 整合性維持のポイント
- Pull History は常に完全な履歴を残し、User Inventory は純粋な投影結果に限定する。
- 手動調整は Pull History に差分として書き込むことで、将来の再計算や同期処理でも再現性が保たれる。
- `projectInventories` は Pull History 以外のデータを参照しないため、履歴の編集・削除を行った場合でも投影し直すだけで整合性を回復できる。
- 仮データ生成やインポート処理も Pull History を起点に在庫を再構築し、両者の乖離を防ぐように実装されている。【F:apps/web/src/pages/gacha/components/dev/MockStorageButton.tsx†L1-L200】【F:apps/web/src/logic/importTxt.ts†L1-L120】

## ダイアグノスティクスと監視
- `projectInventories` が返す `diagnostics` を活用することで、Pull History に欠損がある場合や孤児在庫が残っている場合の検出が可能である。
- `warnings` 配列にはガチャ ID が欠損している履歴など、投影時に無視されたエントリの情報が含まれる。運用時はロギング・テレメトリに組み込むことで不整合を早期に把握できる。

## 今後の拡張のヒント
- `source` の種類を増やす場合は `PullHistoryEntrySourceV1` のユニオンを拡張し、プロジェクションの差分計算ロジック（`normalizeEntryItemCount`）を必要に応じて調整する。
- バージョンアップ時は `normalizeState` やプロジェクションにマイグレーションフックを追加し、履歴の後方互換性を確保する。
