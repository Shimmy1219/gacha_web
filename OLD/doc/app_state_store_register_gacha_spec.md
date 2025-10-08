# AppStateStore.registerGacha 仕様

## 1. 目的
- React 版アプリケーションにおけるガチャメタデータのソース・オブ・トゥルースを確立し、他ストア（`CatalogStore`・`RarityStore`・`UserInventoryStore`）が参照する安定した `GachaId` を払い出す。
- TXT/JSON/ZIP 取り込みや手動追加など複数経路からの登録を統一し、`import_txt_json_plan.md`・`user_component_plan.md` で定義された `GachaId`／`UserInventory` 構造と矛盾しないようにする。
- 既存ガチャの再取り込み時に表示名の変更やインポートメタ情報を安全に更新し、`AppHeaderShell` や `UserPanelFilter` が参照するガチャリストを即時反映する。【F:doc/header_component_plan.md†L115-L117】【F:doc/user_panel_filter_component_plan.md†L32-L59】

## 2. 関連データ構造
```ts
// AppStateStore の抜粋
interface AppState {
  meta: Record<GachaId, GachaMeta>;
  order: GachaId[];                    // UI の表示順
  aliasByName: Record<string, GachaId>; // 旧データの表示名 → GachaId
  aliasByLegacyKey: Record<string, GachaId>; // TXT の番号/キー → GachaId
  selectedGachaId: GachaId | null;
  settings: GachaGlobalSettingV2;       // import_txt_json_plan.md で定義
}

interface GachaMeta {
  id: GachaId;
  displayName: string;
  iconAssetId: string | null;
  createdAt: number;
  updatedAt: number;
  lastImportedAt: number | null;
  summaryTag: string | null; // AppHeaderShell 向けサマリ文言
}
```
- `GachaId` は `react_migration_plan.md` で規定した `gch-xxxxxxxxxx` 形式を採用する。【F:doc/react_migration_plan.md†L60-L97】
- `aliasByName` は JSON/TXT の `"闇ガチャ"` のようなラベルから `GachaId` を逆引きし、`mapJsonRarities` や `normalizeTxtPayload` が同じ ID を利用できるようにする。【F:doc/import_txt_json_plan.md†L94-L221】
- `aliasByLegacyKey` は TXT の `gacha_name_list` の番号、旧 UI の `gachaId` 文字列などレガシー識別子を保持し、重複登録を防止する。

## 3. Payload 定義
```ts
interface RegisterGachaPayload {
  gachaId: GachaId;                 // 既存 ID があればそれを指定。新規作成時は事前に採番する。
  displayName: string;              // UI 表示名。重複した場合は alias として扱う。
  source: 'manual' | 'import-txt' | 'import-json' | 'import-zip';
  importedAt?: number;              // 取り込み時刻。未指定は Date.now()
  legacyKey?: string | null;        // TXT の番号や旧 JS の ID（例: "1", "yami"）
  iconAssetId?: string | null;      // 既存アイコンがあれば指定。null なら既定アイコン。
  summaryTag?: string | null;       // AppHeader のバッジ文言初期値。
}
```
- Payload は `AppStateStore.importSnapshot` と `CreateGachaDialog` の双方から利用できるように統一する。
- `legacyKey` が渡された場合は `aliasByLegacyKey[legacyKey] = gachaId` を保証する。既存登録と矛盾する場合は `console.warn` で通知し、既存 ID を優先する。

## 4. 処理フロー
1. **既存チェック**
   - `state.meta[gachaId]` が存在する場合:
     - `displayName` が変更されていれば `meta.displayName` を更新し、旧名を `aliasByName[oldName]` に残す。
     - `aliasByName[displayName] = gachaId` を再設定。
     - `legacyKey` が指定されていれば `aliasByLegacyKey[legacyKey] = gachaId`。
     - `meta.updatedAt = now`、`meta.lastImportedAt = importedAt ?? now` を更新。
     - `summaryTag`・`iconAssetId` が明示されていれば上書き。未指定は現状維持。
     - 既存の場合は `order` の位置を維持し、戻り値 `isNew: false`。
2. **新規登録**
   - `state.meta[gachaId]` が未登録の場合:
     - `meta` に新規オブジェクトを挿入。
     - `order.push(gachaId)` で末尾に追加（取り込み順で表示）。JSON/TXT でソート情報がある場合は呼び出し側で `order.splice` を指定する。
     - `aliasByName[displayName] = gachaId`、`aliasByLegacyKey[legacyKey] = gachaId`（`legacyKey` があれば）。
     - `meta.createdAt = now`、`meta.updatedAt = now`、`meta.lastImportedAt = importedAt ?? now`。
     - `summaryTag` が未指定の場合は `null`、`iconAssetId` も `null` をセット。
     - 戻り値 `isNew: true` を返し、呼び出し側が `RarityStore.ensureMany` や `UserInventoryStore.syncInventory` を新規ガチャとして扱えるようにする。
3. **永続化・イベント**
   - いずれの場合も `AppStateStore.saveDebounced()` をスケジュールし、`AppHeaderShell`・`UserPanelFilter` 等の購読コンポーネントへ `state` 更新を通知する。
   - `selectedGachaId` は変更しない。フォーカス制御は `AppStateStore.selectCurrentGacha` が担当する（import_txt_json_plan.md §6.4 を参照）。
   - `TelemetryService.track('gacha.registered', { gachaId, source, isNew })` を送信し、取り込み状況を監視する。

## 5. 戻り値
```ts
interface RegisterGachaResult {
  gachaId: GachaId;
  meta: GachaMeta;
  isNew: boolean;
}
```
- 呼び出し元は `isNew` に応じて `UserInventoryStore.syncInventory` で空データを用意したり、既存ガチャの差分更新に切り替える。

## 6. 想定シーケンス
1. TXT 取り込みで `normalizeTxtPayload` が `gacha_name_list["1"] = "闇ガチャ"` を検出し、`gachaId = 'gch-yami1a2b3c'` を採番。
2. `registerGacha({ gachaId, displayName: '闇ガチャ', source: 'import-txt', legacyKey: '1', importedAt })` を dispatch。
3. 戻り値 `isNew: true` を受け取った `applyImportSnapshot` が、`RarityStore.ensureMany` と `UserInventoryStore.syncInventory` を新規ガチャ扱いで実行。
4. JSON 取り込みで同じ `displayName: '闇ガチャ'` が再度来た場合は、`aliasByName['闇ガチャ']` により同じ `gachaId` が再利用され、`isNew: false` で meta の `updatedAt` と `lastImportedAt` のみ更新。
5. `UserPanelFilter` は `order` の変化を受け取り、フィルタ候補に新ガチャを追加。既存ユーザー UI は `selectedGachaId` を維持したまま、必要に応じて `selectCurrentGacha` がフォーカスを切り替える。

## 7. エラー処理
- `displayName.trim().length === 0` の場合は `throw new Error('displayName is required')`。
- `gachaId` の形式が `gch-` で始まらない場合は `assertValidGachaId(gachaId)` を利用して例外を投げる。
- `order` 内に同じ `gachaId` が複数存在する場合は登録前に除去し、重複が検出された旨をテレメトリへ送信する。

## 8. テスト観点
- **新規登録**: `isNew === true`、`meta.createdAt === meta.updatedAt`、`order` 末尾追加、`aliasByName`・`aliasByLegacyKey` の登録を検証。
- **再取り込み**: 表示名変更時に旧名が `aliasByName` に残り、新名で上書きされることを確認。
- **競合**: 既存 `legacyKey` と異なる `gachaId` を指定した場合、既存登録を優先し `console.warn` が出力されること。
- **永続化**: `saveDebounced` が呼ばれるまでの間に追加登録しても最終的な `order` が整合していること。

## 9. 関連機能と利用予定フロー
- **TXT/JSON インポート**: `useImporters()` から生成される `ImporterJob` が `applyImportSnapshot` を通じて `AppStateStore.importSnapshot` を呼び出し、`registerGacha` が新規 ID 採番と既存メタ更新を担う。Start モーダル／ツールバー双方で同一フローを共有する計画。インポート完了後は `selectCurrentGacha` で UI のアクティブガチャを合わせる。【F:doc/import_txt_json_plan.md†L128-L221】
- **React 全体アーキテクチャ**: `react_migration_plan.md` では `AppStateStore` をアプリ共通 reducer として `AppProviders` に組み込み、ガチャ CRUD や完了フラグトグルなど各セクションの状態管理を担当する旨を定義している。【F:doc/react_migration_plan.md†L129-L161】
- **ヘッダー／ツールバー**: `AppHeaderShell` のサマリバッジ表示を `AppStateStore.meta[gachaId].summaryTag` から取得するよう計画しており、`registerGacha` による `summaryTag` 更新が直接 UI へ反映される。【F:doc/header_component_plan.md†L102-L125】
- **モーダル基盤**: Onboarding・インポート・リアルタイム貼り付けなどのモーダル完了時に `AppStateStore` のアクションが実行される前提で、`registerGacha` の結果を他ストアと同期するフローが `Modal` 設計書に記載されている。【F:doc/modal_component_plan.md†L100-L138】
- **ユーザー内訳フィルタ**: `UserPanelFilter` は `AppState` に登録されたガチャ一覧を元にフィルタ候補を構築するため、`registerGacha` が `order` と `aliasByName` を更新することで React 化されたフィルタへ即時反映させる。【F:doc/user_panel_filter_component_plan.md†L60-L103】
- **リアグ／セクション更新**: `section_component_plan.md` ではガチャ単位のタブや保存処理で `AppStateStore.saveDebounced()` を利用することが示されており、新規ガチャ登録後のレイアウト更新や永続化に `registerGacha` が組み込まれる。【F:doc/section_component_plan.md†L100-L163】

## 10. 周辺フローとの整合性検証
- **Importer パイプライン**: `import_txt_json_plan.md` のストア連携では、`registerGacha` へ `displayName`・`source`・`legacyKey` を含む payload を渡す前提が明示され、当仕様の Payload 定義と一致している。また `importSnapshot` の呼び出しもスナップショット全体を渡す形で整理され、`registerGacha` を内部でトリガーするという設計と矛盾しない。【F:doc/import_txt_json_plan.md†L139-L208】
- **ユーザーストア連携**: `UserInventoryStore.syncInventory` が `registerGacha` の払い出した `gachaId` をそのまま共有する旨が書かれており、`aliasByName`／`aliasByLegacyKey` による逆引き戦略と整合している。ユーザー所持データに `gachaId` を反映する手順も `registerGacha` の戻り値 `isNew` を利用するユースケースとぶれがない。【F:doc/import_txt_json_plan.md†L139-L208】【F:doc/user_component_plan.md†L45-L126】
- **UI 更新シーケンス**: ヘッダー・フィルター・セクション計画では `AppStateStore` の `order`・`summaryTag`・`saveDebounced` へ依存する UI 更新タイミングが規定されており、本仕様の処理フロー（`order` 末尾追加や `saveDebounced` 呼び出し）と一致することを確認した。【F:doc/header_component_plan.md†L102-L125】【F:doc/user_panel_filter_component_plan.md†L60-L103】【F:doc/section_component_plan.md†L100-L163】
- **モーダル／プロバイダー導線**: `modal_component_plan.md` および `react_migration_plan.md` で定義された Hook／Provider から `registerGacha` を利用する想定は、当仕様で示した戻り値とエラー条件に矛盾が無い。完了後の `selectCurrentGacha` 連携もインポート計画と接続済みである。【F:doc/modal_component_plan.md†L100-L138】【F:doc/react_migration_plan.md†L129-L161】【F:doc/import_txt_json_plan.md†L200-L221】
