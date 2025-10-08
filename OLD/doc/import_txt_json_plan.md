# TXT/JSON インポーター React 移行計画（詳細版）

## 1. 目的
- 既存の TXT/JSON インポート機能を React + TypeScript アーキテクチャへ移行し、`features/importers` を中核とする再利用可能なサービスに統合する。
- `AppStateStore`・`CatalogStore`・`RarityStore`・`UserInventoryStore` の各ストアを横断し、インポート後のレアリティ・アイテム・ユーザー所持データが即時に同期されるようにする。
- Start モーダルとヘッダーツールバーの両方から同一の Import フローを利用できるよう、Hook とコンテキストを共通化する。

## 2. 現行挙動の整理
### 2.1 TXT インポーター (`src/imp_txt.js`)
- Base64 文字列の URL セーフ補正を行った後に `atob` → `Uint8Array` 変換を実施し、`pako.inflateRaw`（失敗時は `pako.inflate`）で raw-deflate を展開して UTF-8 JSON を復元している。
- 復元した JSON は `gacha_select`・`gacha_name_list`・`gacha_data`（`rarity_base`・`item_base`・`history_list` 等）を含み、Namazu 系 `history_list` からユーザー別の `data`・`counts` を組み立て、`rarity_base` からレアリティ集合を構築している。
- `raritySvc.upsert` で既存レアリティを補完し、ハードコードされた色・番号テーブルから不足値を補っている。
- 既存ガチャ ID が見つからない場合は新規発行し、`applyToAppViaCounts` で `app.upsertHit` を繰り返し呼び出して `data/catalogs/counts` を更新している。
- 取込完了後に `gacha_global_setting_v2` を初期化し、`document.dispatchEvent('gacha:data:updated')` を発火して UI を再描画している。
- `wireTxtInputs` が開始モーダルのタイルと隠し `file` input を監視している。

### 2.2 JSON インポーター (`src/imp_json.js`)
- `data` キーの有無で v2 JSON 形式か簡易形式かを判定し、欠けた `catalogs`・`counts` はユーザー名ベースの情報から再計算している。
- 取込対象ガチャごとに `ensureRaritiesForGachaId` を呼び出してレアリティを補完し、`applyCountsToApp` で `upsertHit` を連続適用している。
- TXT 同様に `gacha_global_setting_v2` の初期化と `gacha:data:updated` 通知までを内包している。
- `wireJsonInputs` が開始モーダルの JSON タイル用に `file` input を制御している。

## 3. React 移行後のゴール
- Import 処理は `packages/domain/importers` に純粋関数として実装し、React 側では Hook／Context を通じて呼び出す。
- `ImporterJob` 型で進捗と結果を管理し、UI 側は `useImporters()` Hook が `jobs` 状態とコントロール関数を公開する。
- レアリティ・アイテム・ユーザー所持情報は各ストアのアクションで更新し、Rarity/Item/User 各コンポーネント計画との不整合を避ける。

## 4. ドメイン／サービス設計
### 4.1 型定義
```ts
// packages/domain/importers/types.ts
export interface ImporterJob<TMeta = unknown> {
  id: string;              // `imp-xxxxxxxxxx`
  kind: 'txt' | 'json';
  fileName: string;
  status: 'idle' | 'reading' | 'parsing' | 'normalizing' | 'applying' | 'succeeded' | 'failed';
  bytesTotal?: number;
  bytesProcessed?: number;
  meta: TMeta;
  error?: string;
  warnings?: string[];
}

export interface ImportSnapshot {
  catalogs: CatalogSnapshot;   // ItemCard / CatalogStore 用
  rarities: RaritySnapshot;    // RarityStore 用
  users: UserInventorySnapshot;// UserInventoryStore 用
  settings: GlobalSettingSnapshot;
}
```
- `ImportSnapshot` は既存 JSON/TXT の `{ data, catalogs, counts }` から正規化した結果。`CatalogSnapshot`・`RaritySnapshot` は Item/Rarity 計画で定義される構造（`itemId`・`rarityId` ベース）を再利用する。
- Hook 側は `ImporterJob` の `status` に応じて UI を更新する。`bytesTotal` などは進捗バーに利用する。

### 4.2 TXT パーサー
1. `decodeTxtPayload(base64: string): Promise<string>` — Base64 → raw-deflate → UTF-8 JSON の順で復号する。`atob` で `Uint8Array` 化した後、`pako.inflateRaw` を試行し、失敗時のみ `pako.inflate` をフォールバックする。復号後は TextDecoder (`utf-8`) で JSON 文字列を返す。`pako` は動的 import で遅延読み込みする。
2. `parseNamazuEnvelope(raw: string): NamazuTxtEnvelope` — TXT から復元した JSON を `JSON.parse` し、`gacha_select`・`gacha_name_list`・`gacha_data` を取り出す。ガチャ名リストと現在選択中のガチャ番号を保持して UI の初期フォーカスへ反映できる形にする。
3. `parseNamazuHistory(envelope: NamazuTxtEnvelope): NamazuPayload` — `history_list` を走査してユーザー別データを復元し、`rarity_base` からレアリティ情報を抽出する。TXT の `item_base` のインデックスを `CatalogStore` の ID 採番規約（`cat-<gachaId>-<code>` 形式）へ写像する中間モデルを生成する。
4. `normalizeTxtPayload(payload: NamazuPayload | LegacyJsonPayload): ImportSnapshot` — Namazu 形式または旧 JSON 形式を `ImportSnapshot` へ変換し、`rarityId`・`itemId` を生成またはマッピングする。`LegacyJsonPayload` は下記の通りユーザー → ガチャ → レアリティ別アイテムの入れ子構造を持つ。

```ts
// packages/domain/importers/legacy.ts
export interface LegacyJsonPayload {
  [userName: string]: {
    [gachaLabel: string]: {
      pulls: number;                    // 累計排出数
      items: Record<RarityCode, string[]>; // レアリティ記号 → アイテム表示名配列
    };
  };
}

type RarityCode = 'SSR' | 'SR' | 'R' | 'N' | string;

export interface NamazuTxtEnvelope {
  gacha_select: string; // 現在選択中のガチャ番号 (文字列)
  gacha_name_list: Record<string, string>; // ガチャ番号 → ガチャ表示名
  gacha_data: {
    FRACTIONAL_DIGITS: number;
    rarity_base: [rarityLabel: string, weight: number][];
    item_base: [rarityTypeIndex: number, weight: number, itemCode: string][];
    rarity_type_probability: number[];
    history_list: [
      userName: string,
      pulls: [
        itemIndex: number,
        rarityLabel: string,
        itemCode: string,
        count: number
      ][]
    ][];
  };
}
```

- `normalizeTxtPayload` は `NamazuPayload` を経由して `NamazuTxtEnvelope` の `history_list`・`item_base`・`rarity_base` を `ImportSnapshot` へ変換する。`gacha_name_list` と `gacha_select` を利用して `AppStateStore.selectCurrentGacha` の初期値と、`CatalogStore`・`UserInventoryStore` で参照する `gachaId` を確定させる。
- `normalizeTxtPayload` は `LegacyJsonPayload` を受け取った場合、`user_component_plan.md` で定義された `UserInventory` モデルへ写像できるよう、ユーザー名・ガチャ表示名を正規化して `gachaId` を決定する。各レアリティ配下のアイテム名は `CatalogStore` の `itemId` 検索で既存アイテムと突き合わせ、新規の場合は `CatalogStore` の ID 採番規約に従って生成する。
4. `applyTxtImport(snapshot: ImportSnapshot, services: ImportServices)` — 各ストアへアクションを dispatch し、副作用（設定・トースト）を処理する。

### 4.3 JSON パーサー
1. `normalizeJsonPayload(rawObj: unknown): ImportSnapshot` — `data` キーの有無でバージョンを判定し、欠損した `catalogs`・`counts` は `users` 情報から再構築する。
2. `mapJsonRarities(snapshot)` — `rarity_component_plan.md` の `RarityMeta` に合わせて `rarityId` を付与／再利用する。既存 `rarityId` が無い場合は生成する。`normalizeJsonPayload` が生成した暫定 `rarityCode` → `itemIds` の写像を `RarityStore` の内部 ID と突き合わせ、UI レイヤーで利用する `RarityBadge`・`RarityBoard` コンポーネントの前提（`rarityId` 安定性）を守るために分離している。
3. `applyJsonImport(snapshot, services)` — TXT と共通の適用ルーチンを呼び出す。

### 4.4 共通サービス
- `ImportServices` には `appState.dispatch`, `catalogStore.dispatch`, `rarityStore.dispatch`, `userInventoryStore.dispatch`, `toast.push`, `telemetry.log` を含める。
- `ensureGlobalSettingV2(snapshot.settings)` が設定の初期化／マージを担当し、`AppStateStore` の設定スライスへ書き込む。
- `dispatchImportEvents({ gachaIds, source })` が完了イベントを発火し、ヘッダーや他機能が購読できるようにする。

## 5. UI インタラクションと制御フロー詳細
### 5.1 Start モーダル経由のフロー
1. `StartWizardDialog` の「TXT 取り込み」カードをクリック → `useImporters()` から得た `requestFile({ kind: 'txt', source: 'start-modal' })` を呼び出す。
2. `useImporters` 内の `pendingKind` state が `'txt'` になり、隠し `<input type="file">` の `accept` 属性を `'.txt,.gz,.namazu'` に設定して `.click()` を実行する。
3. ファイル選択が完了すると `handleFileSelection(kind, fileList)` が発火し、`createImporterJob(kind, file)` で新しい `ImporterJob` を `jobs` state に追加する。
4. `queueJob(job)` が非同期キューへ追加し、`runNextJob()` が `FileReader` を使ってファイルを読み込む。読み込み中は `status: 'reading'`・`bytesProcessed` を更新する。
5. 読み込み完了で `executeImporter(job, buffer)` を呼び出し、TXT なら `decodeTxtPayload` → `parseNamazuEnvelope` → `parseNamazuHistory` → `normalizeTxtPayload` を順次実行して `status` を `parsing`・`normalizing` へ更新する。
6. `applyImportSnapshot(snapshot)` が `status: 'applying'` の間に `AppStateStore.importSnapshot`・`CatalogStore.mergeFromSnapshot`・`RarityStore.ensureMany`・`UserInventoryStore.syncInventory` を dispatch する。
7. すべて成功すると `status: 'succeeded'` に変更し、`toast.push` が「ガチャ名」「アイテム数」「ユーザー数」を表示する。`StartWizardDialog` は Hook から返される `onJobSuccess(jobId)` を監視し、モーダルを閉じて `startDone` を更新する。

### 5.2 ヘッダーツールバー経由のフロー
1. `ToolbarActions` 内の「取り込み」ボタン押下 → `useImporters().openPicker('json', { source: 'toolbar' })`。
2. 以降のファイル選択・ジョブ生成は Start モーダルと同一ルーチンを使用する。ツールバーでは `jobs` に進行中ジョブが存在する場合、ボタンを `disabled` にしスピナーを表示する。
3. 完了時は `dispatchImportEvents` が `HeaderNotificationBell` を通じてバッジを表示し、ユーザーへ完了通知を届ける。

### 5.3 取り込み中の副作用
- `jobs` state は `React.Context` で共有し、`ImportJobList`（サイドバーやトースト）で進捗を可視化する。
- 複数ファイルを連続選択した場合はジョブキューに FIFO で積み、`runNextJob` が逐次処理する。失敗したジョブはキューを停止せず、`status: 'failed'` とエラーメッセージを保持する。
- `useImporters` はアンマウント時に進行中の FileReader をキャンセルし、ジョブを `failed` に更新してクリーンアップする。

## 6. ストア連携とデータ整合性
### 6.1 RarityStore
- `normalizeTxtPayload`／`normalizeJsonPayload` はレアリティを `RarityMeta` 構造で出力し、`rarity_component_plan.md` で規定された `rarityId`・`emitRate`・`color` 等を保持する。
- `RarityStore.ensureMany(gachaId, rarities)` は既存 ID を再利用しつつ不足分を生成し、削除済み ID を `missingRarity` として扱う。
- レアリティが新規作成された場合は `createdAt`・`updatedAt` を現在時刻で設定し、合計排出率が 100% になるよう `normalizeEmitRates` を呼び出す。

### 6.2 CatalogStore / ItemCard
- `CatalogStore.mergeFromSnapshot` は `item_component_plan.md` の `ItemCardModel` へ変換し、`itemId` の生成・重複チェックを行う。
- 既存アイテムと同一 `itemId` がある場合は差分更新、存在しない場合は新規作成する。`rarityId` は RarityStore の結果を参照して設定する。
- `completeTarget`・`pickupTarget`・`isRiagu` はスナップショットの値を反映し、欠損時はデフォルト false を維持する。

### 6.3 UserInventoryStore
- `UserInventoryStore.syncInventory(snapshot.users)` が `user_component_plan.md` の `UserInventory` 構造へマッピングする。
- `items` はレアリティ単位の `ItemId[]` として再構築し、`counts` は `Record<ItemId, number>` で保持する。欠損 ItemId が存在する場合は警告を `ImporterJob.warnings` へ記録する。
- ガチャ追加時は `AppStateStore.registerGacha({ gachaId, displayName, source, legacyKey, importedAt })` を呼び、ユーザー所持データにも同じ `gachaId` を割り当てる。`displayName` は `NamazuTxtEnvelope.gacha_name_list` や JSON ラベルから解決し、`source` は `'import-txt'` / `'import-json'` を指定する。

### 6.4 AppStateStore
- `AppStateStore.importSnapshot` が `gacha_global_setting_v2` などの設定値を統合し、ガチャメタ（表示名・サムネイル）を更新する。
- インポート後に `AppStateStore.selectCurrentGacha` で対象ガチャへフォーカスを移し、UI が最新データを参照する。

## 7. エラー処理とユーザーフィードバック
- Base64 復号や `pako` 復号に失敗した場合は `ImporterJob.error` に詳細メッセージを格納し、`toast.push({ type: 'error' })` でユーザーへ通知する。
- レアリティ情報が欠損している場合は `warnings` に「レアリティが再生成されました」等を追加し、RarityBoard にバッジを表示する。
- `UserInventory` と `CatalogStore` の整合性が取れない場合は警告を表示し、詳細ログをテレメトリへ送信する。
- いずれの失敗でもジョブは `failed` で終了し、リトライボタン (`retryJob(jobId)`) から再実行できるようにする。

## 8. サンプル取り込みシミュレーション

### 8.1 JSON ファイル
以下の JSON を `ToolbarActions` の「取り込み」ボタンから投入した場合の処理フローを段階的に追跡する。

```json
{
  "しゅら": {
    "闇ガチャ": {
      "pulls": 120,
      "items": {
        "SR": ["A1", "A2"],
        "N":  ["B1", "B2"]
      }
    },
    "リアグガチャ": {
      "pulls": 15,
      "items": {
        "SR": ["C1", "C2"],
        "N":  ["D1", "D2"]
      }
    }
  },
  "りな": {
    "闇ガチャ": {
      "pulls": 80,
      "items": {
        "SR": ["A1", "A2"],
        "N":  ["E1", "E2"]
      }
    },
    "リアグガチャ": {
      "pulls": 5,
      "items": {
        "SR": ["C1"],
        "N":  ["F1", "F2"]
      }
    }
  }
}
```

1. ユーザーが「取り込み」ボタンを押すと `useImporters().openPicker('json', { source: 'toolbar' })` が実行され、`pendingKind` が `'json'` になる。
2. ファイル選択後 `handleFileSelection('json', fileList)` が呼ばれ、`createImporterJob` が `status: 'reading'` の `job-<uuid>` を `jobs` state に積む。進捗は `ImporterJob.bytesProcessed` で追跡され、`ImportJobList` コンポーネントがモーダル外でも進行状況を表示する。
3. `executeImporter(job, buffer)` が起動し、`normalizeJsonPayload` が JSON を走査して以下のスナップショットを構築する。
   - `catalogs`: `A1`〜`F2` の 8 アイテムを生成。既存 `itemId` が見つかったアイテムは差分更新、新規は `catalog_component_plan.md` の命名規則に従い `cat-闇ガチャ-A1` などを採番する。
   - `rarities`: `SR` と `N` の 2 レアリティを各ガチャに割り当て、`emitRate` は既存テーブルを参照して初期化。ガチャ表示名は `AppStateStore.registerGacha` で `gachaId` (`gacha-yami`, `gacha-riagu` など) に解決される。
   - `users`: `しゅら`・`りな` の 2 ユーザーに対し、`pulls` 値を `UserInventory` の `totalPulls` に格納しつつ、`items` をレアリティ別の `ItemId[]` として保持する。
   - `settings`: `gacha_global_setting_v2` の `lastImportedAt` や `sourceKind: 'json'` を更新する差分を生成する。
4. 続いて `mapJsonRarities(snapshot)` が `RarityStore.ensureMany` の前段で、既存 `rarityId` を再利用するためのマッピング (`SR` → `rar-闇ガチャ-sr`) を付与する。`status` は `'normalizing'` に更新される。
5. `applyImportSnapshot` が `status: 'applying'` の間に以下を順番に実行する。
  1. `AppStateStore.importSnapshot(snapshot)` — 新規ガチャがあれば `registerGacha` を内部で呼び出し、ナビゲーション用の `appState.currentGachaId` を `gacha-yami` に合わせる。設定スライスへの反映もここでまとめて行う。
   2. `CatalogStore.mergeFromSnapshot(snapshot.catalogs)` — `ItemCatalogGrid` が利用する `CatalogStore` エンティティを更新し、`闇ガチャ` のカードに `A1`〜`A2`・`B1`〜`B2` が並ぶ。
   3. `RarityStore.ensureMany(gachaId, rarities)` — `RarityBoard` のラベルと色を反映し、`SR` と `N` の表示順を保証する。
   4. `UserInventoryStore.syncInventory(snapshot.users)` — `UserCardList` が参照するユーザーごとの所持情報を更新し、`しゅら` の `闇ガチャ` カードに `SR: A1/A2`, `N: B1/B2` が表示される。
6. 適用が完了すると `ImporterJob.status` が `'succeeded'` になり、`toast.push` が「闇ガチャを含む 2 件のガチャを取り込みました」と表示する。同時に `dispatchImportEvents` が `HeaderNotificationBell` にバッジを表示し、最新の `UserInventoryStore` スナップショットが画面全体に反映される。

### 8.2 TXT ファイル
TXT 取り込みボタンから Base64 文字列を含む `.txt` ファイルを読み込んだ際のシナリオを以下に示す。

1. `StartWizardDialog` の「TXT 取り込み」を押下すると `useImporters().requestFile({ kind: 'txt', source: 'start-modal' })` が呼ばれ、隠し `input[type=file]` が表示される。
2. ファイル選択で `handleFileSelection('txt', fileList)` が発火し、`ImporterJob` が `status: 'reading'` で追加される。`FileReader.readAsText` が Base64 文字列を取得する。
3. `executeImporter(job, base64Text)` が `decodeTxtPayload` を呼び出し、Base64 → raw-deflate → UTF-8 JSON の手順で復号する。例えば `"H4sIA..."` の文字列は `Uint8Array` へ変換後に `pako.inflateRaw` で展開し、UTF-8 として `{"gacha_select":"1", ...}` を得る。
4. 復号した JSON 文字列は `parseNamazuEnvelope` で `NamazuTxtEnvelope` に変換される。ここで `gacha_name_list` から `{"1":"闇ガチャ","2":"リアグガチャ"}` が得られ、`gacha_select: "1"` により初期フォーカスが闇ガチャになることを確認する。
5. `parseNamazuHistory` が `history_list` を展開し、各 `[itemIndex, rarityLabel, itemCode, count]` を `CatalogStore` で解決可能な中間モデルに変換する。例えば `itemIndex: 12` が `item_base[12] = [1, 1, "A1"]` に対応する場合、`gachaId: gacha-yami` の `itemId: cat-gacha-yami-A1` を生成する。
6. `normalizeTxtPayload` が中間モデルから `ImportSnapshot` を組み立てる。`RarityStore` には `rarity_base` 由来の比率 (`SR`, `N`) を `rarity_component_plan.md` の `emitRate` 形式に変換して渡し、`UserInventoryStore` には `counts` と `totalPulls` を `syncInventory` で適用できる `UserInventorySnapshot` としてまとめる。
7. `applyImportSnapshot` が `AppStateStore.importSnapshot`・`CatalogStore.mergeFromSnapshot`・`RarityStore.ensureMany`・`UserInventoryStore.syncInventory` を順番に呼び、React コンポーネントが新しい `gachaId` と所持状況をレンダリングする。`UserCardList` では `history_list` の内容に基づき、`しゅら` の `闇ガチャ` カードに `SR: A1/A2`、`N: B1/B2` が表示される。
8. 処理完了で `ImporterJob.status` は `'succeeded'` となり、`gacha_select` に合わせて `AppStateStore.selectCurrentGacha('gacha-yami')` が呼ばれ、UI のアクティブガチャが TXT 内で最後に閲覧していたガチャと一致する。

## 9. テレメトリ・監査ログ
- `telemetry.log('import_started', { jobId, kind, fileName, source })` を開始時に送信し、完了時には `import_finished` を送る。
- 失敗時は `import_failed` とともに `errorStack` を記録する。これらのログはサポート調査や QA で活用する。

## 10. テスト戦略
- ドメイン層: `decodeTxtPayload`・`normalizeTxtPayload`・`normalizeJsonPayload` の単体テストを実装し、既存 TXT/JSON サンプルファイルで復元結果を検証する。
- ストア統合: `CatalogStore.mergeFromSnapshot` と `UserInventoryStore.syncInventory` の結合テストを追加し、`rarityId`・`itemId` の再利用／生成が仕様通りに行われるか確認する。
- React Hook: `useImporters` のテストで `requestFile` → ジョブ生成 → 状態遷移 → 成功時のイベント発火を検証する。
- UI: Start モーダルとヘッダーツールバーからの操作を React Testing Library + user-event で再現し、モーダル閉鎖やボタンの無効化が期待通りに動作するか確認する。
- E2E: Playwright テストで TXT/JSON ファイルを取り込み、RarityBoard・ItemCatalog・UserCard にデータが反映されることを確認する。インポート後の再エクスポート → 再インポートでも同じ結果になることを検証する。
