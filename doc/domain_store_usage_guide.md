# ドメインストア運用ガイド

## 1. 目的と全体像
apps/web/src/domain/stores 配下のストア群は、ローカルストレージを介したフロントエンド状態管理の中枢として設計されています。これらのストアはすべて `PersistedStore` を継承し、`AppPersistence` を経由してブラウザの `localStorage` と同期します。UI 層からはストアを介して状態を読み書きし、永続化と購読通知を自動化します。

## 2. 主要コンポーネント
### 2.1 PersistedStore の責務
`PersistedStore<T>` は全ストアが共有する抽象クラスであり、以下の責務を持ちます。
- `hydrate(initialState)` で永続化済みスナップショットをロードし、購読者へ即時通知する。【F:apps/web/src/domain/stores/persistedStore.ts†L18-L40】
- `setState` と `update` による状態更新と、`UpdateOptions` で制御可能な永続化・通知オプションを提供する。【F:apps/web/src/domain/stores/persistedStore.ts†L22-L65】
- `subscribe(listener)` で購読登録を受け付け、状態変更時に通知を行う。【F:apps/web/src/domain/stores/persistedStore.ts†L32-L39】
- `persistImmediate` / `persistDebounced` をサブクラスに実装させ、保存タイミングの制御を委譲する。【F:apps/web/src/domain/stores/persistedStore.ts†L70-L77】

`UpdateOptions.persist` には `'immediate' | 'debounced' | 'none'` を指定でき、既定値は `'none'` です。`emit` を `false` にすると状態が変化しても購読者通知を抑止でき、既定値は `true` です。【F:apps/web/src/domain/stores/persistedStore.ts†L24-L65】

### 2.2 AppPersistence の責務
`AppPersistence` はローカルストレージと `EventTarget` を扱う実装で、ストアからの保存要求を引き受けます。【F:apps/web/src/domain/app-persistence/appPersistence.ts†L39-L120】 主な機能は以下のとおりです。
- `loadSnapshot()` でアプリ全体の状態スナップショットを構築し、`createDomainStores` から各ストアに流し込みます。【F:apps/web/src/domain/app-persistence/appPersistence.ts†L63-L99】【F:apps/web/src/domain/stores/createDomainStores.ts†L17-L37】
- `savePartial()` と `saveDebounced()` により、指定フィールドのみを即時保存または遅延保存する。【F:apps/web/src/domain/app-persistence/appPersistence.ts†L101-L210】
- `GACHA_STORAGE_UPDATED_EVENT` を発火し、他コンポーネントへ永続化完了を通知する。【F:apps/web/src/domain/app-persistence/appPersistence.ts†L19-L20】【F:apps/web/src/domain/app-persistence/appPersistence.ts†L440-L456】

## 3. 既存ストア一覧
| ストア | 型パラメータ | 保存メソッド | 主な責務 |
| --- | --- | --- | --- |
| `AppStateStore` | `GachaAppStateV3 | undefined` | `saveAppState`, `saveAppStateDebounced` | 選択中ガチャなどアプリ全体の状態を保持し、`setSelectedGacha` で UI 選択を更新する。【F:apps/web/src/domain/stores/appStateStore.ts†L1-L34】 |
| `CatalogStore` | `GachaCatalogStateV4 | undefined` | `saveCatalogState`, `saveCatalogStateDebounced` | ガチャカタログ（景品一覧）を保持する。【F:apps/web/src/domain/stores/catalogStore.ts†L1-L15】 |
| `RarityStore` | `GachaRarityStateV3 | undefined` | `saveRarityState`, `saveRarityStateDebounced` | レアリティ定義を管理する。【F:apps/web/src/domain/stores/rarityStore.ts†L1-L15】 |
| `UserInventoryStore` | `UserInventoriesStateV3 | undefined` | `saveUserInventories`, `saveUserInventoriesDebounced` | ユーザー別所持情報を扱う。【F:apps/web/src/domain/stores/userInventoryStore.ts†L1-L15】 |
| `RiaguStore` | `RiaguStateV3 | undefined` | `saveRiaguState`, `saveRiaguStateDebounced` | りあぐデータ同期を担当する。【F:apps/web/src/domain/stores/riaguStore.ts†L1-L15】 |
| `PtControlsStore` | `PtSettingsStateV3 | undefined` | `savePtSettings`, `savePtSettingsDebounced` | ポイントターミナル設定を保持する。【F:apps/web/src/domain/stores/ptControlsStore.ts†L1-L15】 |

すべてのストアは `createDomainStores` で一括生成され、アプリ起動時に永続化データで初期化されます。【F:apps/web/src/domain/stores/createDomainStores.ts†L17-L37】

## 4. 利用フロー
1. `const stores = createDomainStores(persistence);` でドメインストア群を初期化する。
2. 各ストアで `store.subscribe(...)` を使って React の `useEffect` などから購読し、状態更新を UI に反映する。
3. 状態変更時は `store.setState(next, { persist: 'immediate' })` や `store.update(updater, { persist: 'debounced' })` を呼び出し、必要に応じて永続化タイミングを制御する。
4. まとめて保存したい場合は `store.save()` / `store.saveDebounced()` で現在の状態を永続化する。

## 5. 実装指針
- **永続化タイミングの選択**: ユーザー入力に追従する頻繁な更新は `persist: 'debounced'` を、確実に即時保存すべき処理（インポート完了など）は `persist: 'immediate'` を指定します。`PersistedStore` は状態が変化しない場合 `emit` を省略すると通知を抑制するため、再レンダリングの抑止に有効です。【F:apps/web/src/domain/stores/persistedStore.ts†L42-L65】
- **購読解除の徹底**: `subscribe` が返すクリーンアップ関数を React の `useEffect` のクリーンアップで呼び出し、メモリリークを避けます。【F:apps/web/src/domain/stores/persistedStore.ts†L32-L39】
- **スナップショット整合性**: 新しいストアを追加する場合は `AppPersistence` に対応する `saveXxx` メソッドと `loadSnapshot` の戻り値フィールドを追加し、`createDomainStores` の `hydrate` 呼び出しを忘れないようにしてください。【F:apps/web/src/domain/app-persistence/appPersistence.ts†L63-L210】【F:apps/web/src/domain/stores/createDomainStores.ts†L17-L37】
- **エラーハンドリング**: `hydrateStores` は例外を捕捉して warn ログに落とし、初期化失敗でアプリが落ちないようにしています。新規ストアを追加する際も同様の方針で防御的に実装してください。【F:apps/web/src/domain/stores/createDomainStores.ts†L29-L37】

## 6. 拡張手順（新規ストア追加の例）
1. `PersistedStore<YourState>` を継承したクラスを作成し、`persistImmediate` / `persistDebounced` で `AppPersistence` の保存メソッドを呼び出す。
2. `AppPersistence` に `saveYourState`／`saveYourStateDebounced` を追加し、`STORAGE_KEYS` と `loadSnapshot()` にフィールドを登録する。
3. `createDomainStores` でインスタンス化し、`hydrateStores` でスナップショットを反映する。
4. UI 層では既存ストアと同じ API（`getState`, `subscribe`, `setState`, `update`）を利用できるため、共通フックやコンポーネントを流用しやすくなります。

## 7. トラブルシューティング
- **永続化されない**: `UpdateOptions.persist` が `'none'` のままになっていないか確認し、必要に応じて `store.save()` を明示的に呼び出してください。
- **状態が再読み込み時に空になる**: `AppPersistence` の `storage` が `null` になるケース（SSR など）では永続化されません。必要であれば `AppPersistenceOptions.storage` で代替ストレージを注入します。【F:apps/web/src/domain/app-persistence/appPersistence.ts†L49-L89】
- **購読が走らない**: `setState`/`update` が同一参照を返していると `Object.is` 判定で変化なしと見なされ通知が抑制されます。状態はイミュータブルに更新し、`emit: true` を指定すると同一参照でも通知できます。【F:apps/web/src/domain/stores/persistedStore.ts†L42-L65】

このガイドを基に、ストア群を経由した状態管理・永続化フローを統一的に運用してください。
