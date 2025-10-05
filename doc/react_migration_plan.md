# React + Tailwind CSS 移行計画書

## 1. 計画の目的
- 既存の手続き型 UI を React コンポーネント指向へ移行し、画面機能の再利用性と保守性を高める。
- Tailwind CSS をベースにデザインシステムを構築し、`item-card`・`user-card`・`riagu-item` 等のカード UI をユーティリティスタイルで再定義する。【F:index.css†L78-L118】【F:index.css†L405-L413】
- ガチャデータ管理・レアリティ設定・リアルタイム入力・インポート/エクスポートをドメインごとに整理し、React Context + Hooks で状態を共有する。【F:docs/site_spec.md†L31-L48】

## 2. 現状整理
- 単一の `index.html` にヘッダー/ドロワー/スプラッシュ/メインツールバー/モバイルタブ/大量のモーダルが内包されており、DOM 直接操作とイベントベースで画面を更新している。【F:docs/site_spec.md†L20-L29】
- アプリ状態は `AppStateService` が `meta`・`catalogs`・`data`・`counts`・`selected` を管理し、レアリティ・画像・リアグは独立サービスとしてローカルストレージと IndexedDB を同期している。【F:docs/site_spec.md†L31-L43】
- TXT/JSON インポート、リアルタイム貼り付け、ZIP エクスポート/共有、Discord ログイン等の処理が `/src` 直下の手続き型スクリプトで実装されている。【F:docs/site_spec.md†L44-L76】
- API は Blob 保存・共有トークン発行・Discord 認証を提供し、PWA 更新制御が `sw.js` / `manifest.webmanifest` に存在する。【F:docs/site_spec.md†L49-L64】

## 3. 目指すアーキテクチャ
### 3.1 技術選定
- ビルドツール: Vite + React 18 + TypeScript。
- 状態管理: React Context と `useReducer`/`useImmerReducer` でドメインストアを実装し、永続化に `localforage` や IndexedDB ラッパを利用。
- データ取得: React Query で API 呼び出し（Discord プロフィール、Blob アップロード等）を管理。
- UI ライブラリ: Tailwind CSS + Headless UI（モーダル、リストボックス）、Radix UI Icons など軽量なアクセシビリティ対応コンポーネント。

### 3.2 想定ディレクトリ構成
```
/ (project root)
├── apps/web/                # Vite プロジェクト
│   ├── src/
│   │   ├── app/            # ルーティング・providers
│   │   ├── components/     # 再利用 UI（カード、ボタンなど）
│   │   ├── features/
│   │   │   ├── onboarding/ # Splash & 開始モーダル
│   │   │   ├── gacha/      # ガチャ編集・FAB
│   │   │   ├── rarity/     # レアリティ設定
│   │   │   ├── items/      # アイテム画像管理
│   │   │   ├── users/      # ユーザー集計
│   │   │   ├── riagu/      # リアグビュー
│   │   │   ├── realtime/   # リアルタイム貼り付け
│   │   │   └── importers/  # TXT/JSON/ZIP
│   │   ├── hooks/
│   │   ├── lib/            # フロント専用ユーティリティ
│   │   ├── providers/      # Context 定義
│   │   └── styles/
│   ├── public/             # manifest, icons, sw (React 用に調整)
│   └── index.html          # Vite entry
├── packages/domain/        # サービス層（ロジックを TypeScript 化）
│   ├── app-state/
│   ├── rarity/
│   ├── images/
│   └── riagu/
└── doc/                    # ドキュメント（本書を含む）
```

### 3.3 Tailwind 設定
- `tailwind.config.ts` にテーマトークンを定義し、既存のカラーパレット（背景: `--panel`, `--panel-2`、アクセント: #e11d48 など）を `colors` と `boxShadow` に反映する。
- モバイル/デスクトップ両対応のブレークポイント（`sm`, `md`, `lg`, `xl`）を既存 CSS の 980px/860px 分岐を基準に設定。
- コンポーネント向けに `@layer components` で `.card`, `.btn`, `.badge` 等の抽象ユーティリティをプリセット化。

## 4. ドメインモデル再設計
### 4.1 型定義（TypeScript）

#### ID ポリシー
- `RarityId`・`ItemId`・`UserId`・`GachaId`・`InventoryId` はすべて `xxx-xxxxxxxxxx`（接頭辞 3 文字 + 英数字 10 文字）で統一する。
- 接頭辞は `RarityId: rar` / `ItemId: itm` / `UserId: usr` / `GachaId: gch` / `InventoryId: inv` とし、`xxxxxxxxxx` 部分は `AppStateService` が用いる Base62 乱数 ID 生成（`index.html` におけるガチャ ID 生成と同一手法）で発行する。
- 例: `RarityId = "rar-A92Swid9sl"`、`ItemId = "itm-fi92dvk29s"`、`UserId = "usr-0s1X2mNpQr"`、`GachaId = "gch-z8P1LmQwEr"`、`InventoryId = "inv-H7s9LmQ2Wx"`。

```ts
// packages/domain/app-state/types.ts
export type RarityId = `rar-${string}`; // 例: "rar-A92Swid9sl"（英数字 10 桁の接尾辞）
export type UserId = `usr-${string}`;   // 例: "usr-0s1X2mNpQr"
export type ItemId = `itm-${string}`;   // 例: "itm-fi92dvk29s"
export type ItemCode = string;        // 旧 UI の itemKey（gachaId::rarityId::itemId）
export type GachaId = `gch-${string}`;  // 例: "gch-z8P1LmQwEr"
export type InventoryId = `inv-${string}`; // 例: "inv-H7s9LmQ2Wx"

export interface GachaMeta {
  id: GachaId;
  displayName: string;
  createdAt: number;
}

export interface CatalogEntry {
  pulls: number;
  itemsByRarity: Record<RarityId, ItemId[]>;
  legacyItemCodeIndex?: Record<ItemCode, ItemId>; // ItemCode → ItemId の逆引き
}

export interface UserInventory {
  inventoryId: InventoryId; // inv-xxxxxxxxxx 形式で発行し不変
  userId: UserId;
  gachaId: GachaId;
  items: Record<RarityId, ItemId[]>;
  counts: Record<RarityId, Record<ItemId, number>>;
  createdAt: string; // ISO 文字列
  updatedAt: string;
}

export interface AppSnapshot {
  meta: Record<GachaId, GachaMeta>;
  catalogs: Record<GachaId, CatalogEntry>;
  users: Record<UserId, Record<GachaId, UserInventory>>; // gachaId -> inventory
  selectedGachaId: GachaId | null;
  legacyItemCodes?: Record<GachaId, Record<ItemCode, ItemId>>; // 永続化済み ItemCode を保持する場合に利用
}

export interface ItemCardModel {
  itemId: ItemId;
  itemKey: string; // gachaId::rarityId::itemId
  gachaId: GachaId;
  gachaDisplayName: string;
  rarityId: RarityId;
  imageAsset: {
    thumbnailUrl: string | null;
    assetHash: string | null;
    hasImage: boolean;
  };
  isRiagu: boolean;
  completeTarget: boolean;
  pickupTarget: boolean;
}
```

#### CatalogEntry 仕様と要件
- `itemsByRarity` は常に `ItemId` のみを保持し、レアリティ別のアイテム参照を完全に ItemId ベースへ統一する。React でのフィルタや整列は ItemId をキーに実行する。
- `legacyItemCodeIndex` は旧 UI 由来の `ItemCode`（`itemKey` と同義）を逆引きして `ItemId` を得るためのオプショナル辞書。React への移行後も TXT/JSON インポートや共有リンクに旧 `ItemCode` が含まれる場合、この辞書を使って `ItemId` にマッピングする。
- マイグレーション実行時に `ItemCode` を `gachaId`・`rarityId`・`itemId` へ分解し、辞書へ格納する。React 側では辞書の存在をチェックし、欠損があれば `ItemId` を出力の正とした上で `ItemCode` を再生成する。
- `pulls` は React の `CatalogStore` が排出回数の上限を UI へ渡すための数値であり、`ItemId` ベースのカタログ操作と併用する。

#### AppSnapshot 仕様と要件
- `meta`・`catalogs`・`users` のキー構造はそれぞれ `GachaId`・`GachaId`・`UserId`/`GachaId` を用い、内部の配列・辞書はすべて `ItemId` を唯一の参照として持つ。
- `legacyItemCodes` はガチャ単位の `ItemCode` → `ItemId` 逆引きをまとめるオプショナルプロパティ。React 起動時に存在する場合は `CatalogEntry.legacyItemCodeIndex` と突き合わせ、欠けている `ItemCode` のみ生成し、スナップショット保存時は `ItemId` を正とした差分のみ保持する。
- `hydrateAppSnapshot(snapshot: AppSnapshot)` では、`catalogs[gachaId].itemsByRarity` の `ItemId` を `UserInventory.items`・`counts` と照合して破損を検出し、必要であれば `legacyItemCodes` から補完するチェックを行う。
- React 側での新規保存時は `CatalogEntry.itemsByRarity` と `UserInventory.items` から導出した `ItemCode` を `legacyItemCodeIndex` / `legacyItemCodes` に再生成し、旧クライアント向け API 互換を保つ。

- `RarityConfig` は排出率・表示色・ソート順を持つ。
- `UserInventory` は `inventoryId` とタイムスタンプを保持し、`items`/`counts` はすべて `ItemId` ベースで `CatalogStore` の `itemCards` へ整合。
- 画像管理は `ImageAsset`（サムネ URL, Blob ハッシュ, skip フラグ）・`RiaguMeta`（リアグキーと説明、当選者リスト）に分割。
- インポート処理は `ImporterJob` 型（入力種別、解析結果、エラー）を定義し、React で段階的に UI へ反映。

### 4.2 サービス分割
- `AppStateStore`: React Hook (`useAppState`) が CRUD を行う reducer。旧 `AppStateService` の `createGacha` 等を Action 化。
- `RarityStore`: ガチャごとのレアリティ一覧・順序制御。`ensureDefaultsForGacha` 等を非同期 Action として実装。
- `UserInventoryStore`: `state.userInventories` を `[userId][gachaId]` で管理し、`syncInventory`・`addItem`・`removeItem`・`bulkReplaceItems`・`purgeItem` などユーザーパネル計画書と同等のアクションを提供。`useUserInventoryWithItems` や達成率セレクタで `ItemId` 参照を再利用する。
- `UserStore`: `Record<UserId, UserCardModel>` を保持し、`updateUser` で表示名やアバター色を更新する。`UserChip` は `userId` を渡すだけでストアから最新の表示データを引き直し、レアリティ設定の `emitChange()` と同様に購読者へ再描画を伝播させるが、役割はプロファイル辞書の更新に特化する。
- `AssetStore`: 画像/音声/動画の取得・保存。IndexedDB は `idb-keyval` でラップし、Service Worker との整合性を確保。
- `RiaguStore`: リアグ対象と当選者計算。`winnersForKey` をメモ化 selector として提供。

## 5. 状態管理 & 同期
- ルートに `AppProviders` を置き、`AppStateProvider`、`RarityProvider`、`UserInventoryProvider`、`AssetProvider`、`RiaguProvider` をネスト。
- LocalStorage/IndexedDB 同期は `useEffect` + `React Query` mutation で行い、永続化のデバウンス（既存 120ms）を hook 内で再現する。【F:docs/site_spec.md†L31-L41】
- `useToolbarState` としてユーザーフィルタ（はずれ/カウント/リアグ toggle、検索語）を Context に昇格させ、URL クエリまたは localStorage に保存する。【F:docs/site_spec.md†L23-L24】
- PWA/サービスワーカーイベントは `useServiceWorker` Hook で検知し、更新トーストを表示。

## 6. UI/コンポーネント構成
### 6.1 アプリシェル
- `AppShell`: ヘッダー、ハンバーガー、メインレイアウト、レスポンシブ drawer を管理。【F:docs/site_spec.md†L20-L22】
- `MobileTabs`: `data-page` ベースの現在のセクションを React Router で表現し、`lg:` ブレークポイント以上でタブを非表示。
- `ToolbarPanel`: ファイルドロップ、リアルタイム入力、エクスポート/インポート、Discord ログイン UI を含むコンポーネント。【F:docs/site_spec.md†L22-L23】

### 6.2 再利用コンポーネント
- `Card` / `Panel`: 基本的な枠スタイル。
- `ItemCard`: 画像・レアリティ・アクションボタンを props で受け取り、`item-card` CSS の役割を Tailwind で置き換える。【F:index.css†L78-L88】
- `UserCard`: 折りたたみヘッダー・統計テーブルを含むアコーディオン。`user-card` の高さアニメーションは `@headlessui/react` の `Disclosure` で代替。【F:index.css†L90-L118】
- `RiaguItem`: リアグメタ表示・勝者リスト・操作ボタンをまとめるカード。【F:index.css†L405-L413】
- `Badge`, `Tag`, `ToggleButton`, `Tabs`, `Dialog`, `Stepper`, `ProgressBar`, `FileDropZone`, `Avatar` 等を共通化。

#### ItemCard 仕様詳細（要望対応の検証）
- **固有 ID (`itemId`)**: 各カードに `itm-xxxxxxxxxx` 形式の `ItemId` を付与する。接尾 10 桁の英数字は現行 `index.html` がガチャ ID を生成するのと同じ Base62 乱数ロジックを TypeScript 化して利用する。
- **レアリティ参照のリアクティブ化**: `ItemCard` には `rarityId` のみを渡し、`useRarity(rarityId)` で `RarityStore` から `label`・`color` 等を selector 経由で取得する。ラベル/カラーは Context の状態なので、参照側で再取得するだけで更新が自動反映される。
- **ItemCardProps の構造**: `ItemCardModel` を props とし、`itemId`、`itemKey`、`gachaId`、`imageAsset`、`isRiagu` をまとめて渡す。完了対象 (`completeTarget`)・ピックアップ対象 (`pickupTarget`) の boolean を追加し、UI 上でバッジやトグルを表示できるようにする。
- **操作ハンドラ**: `onToggleCompleteTarget` や `onTogglePickupTarget` を追加し、`AppStateStore` で該当フラグを更新。リアクティブ参照によりビューへ即時反映される。
- **データ整合性**: `ItemCardModel` は domain ストア内でも保持し、永続化する際は既存 JSON への互換性を保つため `completeTarget` / `pickupTarget` をオプショナルでデフォルト `false` としてマイグレーションを実装する。

### 6.3 機能別コンポーネント
- Onboarding: `SplashIntro`, `StartWizard`（TXT/JSON/新規作成タイル、ファイルドロップ、ガイドモーダル）。【F:docs/site_spec.md†L21-L24】
- Rarity: `RarityBoard`, `RarityRow`, `RarityForm`, `RarityEmitRateEditor`。
- Items: `GachaTabs`, `ItemGrid`, `ImagePickerModal`, `BulkActionsBar`。
- Users: `UserFilters`, `UserList`, `UserStats`, `HistoryTimeline`（貼り付け履歴を表示する余地）、`UserCard`（`ItemId` ベースで `UserInventoryStore` を購読）、`UserInventoryTable`、`ItemChip`。
- Riagu: `RiaguSummary`, `RiaguWinners`, `RiaguActions`。
- Gacha Management: `GachaList`, `GachaEditorDrawer`, `FloatingActionButton`。
- Realtime Entry: `RealtimePastePanel`, `LiveBlockPreview`, `ResultDiffTable`。
- Import/Export: `ImportJobRunner`, `JsonPreview`, `ShimmyExportModal`, `ReceiveShareLink`。
- Discord Auth: `DiscordLoginButton`（現行関数を React component 化）。

### 6.4 モーダル管理
- `ModalHost` をアプリルートに設置し、Context でモーダルを push/pop。
- 各機能モーダル（開始、リアルタイム入力、画像設定、リアグ編集、ガチャ削除確認等）を `feature/*/dialogs` に分割。

### 6.5 ルーティング
- SPA 内部でセクションを `/app/:page`（`rarity`, `items`, `gacha`, `users`, `riagu`）として扱い、React Router の `useSearchParams` でガチャ ID やフィルタを同期。
- `/receive` ページは独立したエントリーポイントとして React 化し、共有トークン読み込み UI を再構築する。【F:docs/site_spec.md†L59-L76】

## 7. API / データ永続戦略
- `apiClient` モジュールで Fetch をラップし、`/api/blob/upload`, `/api/blob/csrf`, `/api/receive/token`, `/api/discord/me` を型安全に呼び出す。【F:docs/site_spec.md†L49-L57】
- Blob アップロードは React Query mutation + プログレスイベントでトーストを表示。完了後は `issueReceiveShareUrl` 相当の Hook で共有リンクを生成。【F:docs/site_spec.md†L49-L76】
- IndexedDB には `appState`・`userInventories`・`imageAssets` を保存し、`UserInventory` マイグレーションで `ItemId` 不整合を検知・修復しつつ、`service worker` の更新通知を受けてキャッシュをクリアするフローを実装。

## 8. Tailwind コンポーネント設計指針
- `@apply` を使って `card`, `panel`, `toolbar`, `btn`, `badge`, `chip` などを `.css` ではなく `tailwind.css` に定義。
- `dark` モードを基本とし、将来的なライトテーマ対応のために `data-theme` 属性を Layout で切り替え。
- `item-card` などのレイアウトは `flex`, `grid`, `aspect-square`, `rounded-2xl`, `shadow` ユーティリティで再現。
- フォーカスリングやアクセシビリティ属性を Tailwind プラグイン（`tailwindcss-animate` 等）で付与。

## 9. PWA / アセット移行
- `public/manifest.webmanifest` と `public/sw.js` を React 用に再配置し、Vite の `registerSW`（`vite-plugin-pwa`）を採用。
- 既存のキャッシュ戦略（プレキャッシュ、stale-while-revalidate）を Workbox 設定で再現し、更新通知を React Toast で表示。【F:docs/site_spec.md†L10-L12】【F:docs/site_spec.md†L62-L64】

## 10. 移行ロードマップ
1. **設計固め**: 既存サービスのテストを追加し、TypeScript ドメインパッケージへ移植。ドメイン層は Node 互換 API を維持して単体テスト可能にする。
2. **開発環境構築**: Vite + Tailwind + ESLint + Vitest をセットアップし、Storybook で UI コンポーネントの開発環境を整備。
3. **App Shell 実装**: `AppProviders`, `AppShell`, `ToolbarPanel`, `MobileTabs` を構築し、空のページコンポーネントを配置。
4. **ドメインストア統合**: App/Rarity/UserInventory/Asset/Riagu ストアと永続化 Hook を組み込み、初期ロードとデータ保存を確認。旧 `ItemCode` 形式から `ItemId` 形式へのマイグレーション（`inventoryId` 付与、`counts` の辞書変換）もここで実施。
5. **主要ビュー移植**:
   - `rarity` ページ: レアリティ CRUD + 排出率調整。
   - `items` ページ: アイテムカードグリッド、画像モーダル。
   - `users` ページ: ユーザーカード（折りたたみ、集計テーブル）。
   - `riagu` ページ: リアググループと当選者表示。
   - `gacha` ページ: ガチャ作成/削除/コピーの管理 UI。
6. **ワークフロー機能**: TXT/JSON インポートウィザード、リアルタイム貼り付け、ZIP エクスポート、受け取りリンク発行を React Query + モーダルで実装。
7. **API 連携・認証**: Discord ログインボタン、CSRF トークン取得、Blob アップロードの統合テスト。
8. **受け取りページ React 化**: `/receive` を独立バンドルとして再構築し、共有トークン処理・ZIP 展開 UI を Tailwind でデザイン。
9. **PWA 対応**: サービスワーカーと manifest を調整し、更新通知と precache を検証。
10. **仕上げ**: アクセシビリティ監査、E2E テスト（Playwright）、パフォーマンス計測、文書更新。

## 11. リスクと対策
- **IndexedDB 互換性**: React での IndexedDB 操作は非同期化により競合しやすい。`useEffect` の競合防止に `AbortController` を導入し、テストで race condition を確認。
- **大容量データのパフォーマンス**: 大量のユーザーやアイテムをリスト表示する際に仮想リスト化（`react-virtualized` など）を検討。
- **Tailwind のバンドルサイズ**: `content` パス設定を最適化し、`clsx` + 条件付きクラスで不要なスタイル出力を防止。
- **段階的リリース**: 既存ユーザーへの影響を抑えるため、旧版と新版をサブディレクトリで共存させるフェーズを設け、データ互換性テストを実施。

## 12. 成果物とドキュメント整備
- ドメイン層 API リファレンス、画面遷移図、状態遷移図、Tailwind デザインガイドを `/doc/` に追加する。
- Storybook ドキュメント、API スキーマ（OpenAPI）、インポートデータ仕様書を整備し、開発者オンボーディングを短縮する。
