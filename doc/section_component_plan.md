# セクション別 React コンポーネント計画書

## 1. 目的
- 既存の `index.html` 内に直書きされている 4 つの主要パネル（レアリティ設定・アイテム画像の設定・ユーザーごとの獲得内訳・リアグ）を React + Tailwind CSS へ段階移行するための仕様を定義する。
- Tailwind ユーティリティとデザイン・トークンを用いて `index.css` のレイアウトやバッジスタイルを再構築しつつ、現在の操作フロー・データ連携を維持する。
- 各セクションを自律的な Feature Module として切り出し、コンテキスト/ストアを跨いだ依存関係を明文化することでメンテナンス性と再利用性を高める。

## 2. 対象セクション概要
| セクション | 現状 DOM / スタイルの特徴 |
| --- | --- |
| レアリティ設定 | `#rarityPanel` 内でタブ・サブコントロール・テーブルを `initRarityUI()` が描画し、レアリティサービスを直接操作。【F:index.html†L195-L205】【F:src/rarity.js†L143-L200】 |
| アイテム設定 | ガチャ切替タブと `renderItemGrid()` で生成するカードリストにより、画像設定/解除・リアグ指定・アイテム削除を行う。【F:index.html†L198-L203】【F:index.html†L843-L933】 |
| ユーザーごとの獲得内訳 | 絞り込みフィルタ群と折りたたみ式ユーザーカードで構成。ZIP 保存や URL コピーなどの操作を持つ。【F:index.html†L205-L269】【F:index.html†L941-L1019】 |
| リアグ | `renderRiaguPanel()` がタブとカードを生成し、リアルグッズのメタ情報と獲得者一覧を表示する。【F:index.html†L271-L275】【F:src/ui-riagu.js†L114-L224】 |

## 3. 共通設計指針
- **Feature Slice 構成**: `apps/web/src/features/{rarity|items|users|riagu}` にページコンポーネントと内部 UI を配置し、共通 UI は `components/` ディレクトリで共有する。React Router のセクションルーティングで各パネルをページ化する。
- **状態管理**: 既存サービス (`RarityService`, `AppStateService`, `RiaguService`) を TypeScript 化したドメインストアを Context で提供し、セクションごとに必要な selector を定義する。【F:src/rarity.js†L30-L136】【F:src/ui-riagu.js†L120-L223】
- **Tailwind テーマ**: `.panel`, `.tabs`, `.item-card`, `.user-card`, `.riagu-item` 等のクラスを Tailwind コンポーネントレイヤで再現し、ユーティリティクラスへ置き換える。【F:index.css†L68-L118】【F:index.css†L402-L413】
- **アクセスビリティ**: 既存の `aria` 属性や折りたたみ操作を React コンポーネントで再構築し、Headless UI / Radix の Disclosure・Listbox を活用する。
- **副作用の集約**: 現在 DOM 関数で行っている再描画 (`renderItemGrid`, `renderUsersList`, `renderRiaguPanel`) を React の state 更新に統合し、サービス更新時は `context` を通じて再レンダーさせる。

## 4. セクション別設計詳細

### 4.1 レアリティ設定
#### 現状の挙動
- タブ表示・テーブル構築・追加ボタンなどを `initRarityUI()` が DOM 文字列で生成し、レアリティサービスからガチャ一覧やメタ情報を読み込む。【F:src/rarity.js†L143-L200】
- 排出率の正規化、ローカルストレージへの選択タブ保存など UI ロジックとデータ操作が密結合している。【F:src/rarity.js†L41-L95】【F:src/rarity.js†L168-L199】
- テーブルのスタイルは `.rarity-wrap`, `.rarity-table`, `.emit-cell` などのクラスに依存。【F:index.css†L396-L413】

#### React コンポーネント構造案
- `RarityPage` (ページコンテナ): ガチャタブ・説明文・操作バーをラップ。
- `RarityGachaTabs`: ガチャ一覧と追加ボタンを描画。`useRarityStore()` から `gachas` を取得し、`useSelectedGacha()` で現在タブを管理。
- `RarityControls`: 既存 `.subcontrols` 相当（将来の PT 課金設定等を含む）をスロット化。
- `RarityTable`: レアリティ一覧のテーブル本体。内部で `RarityRow` を map 描画。
- `RarityRow`: ラベル・色・強さ・排出率・削除ボタンを含む。行ごとに `onChange` / `onRemove` を受け取り、数値入力は `useDebouncedCallback` でストア更新。
- `EmitRateSummary`: 合計 100% 超過/不足警告、`normalize` ボタンを配置。

#### 状態とデータフロー
- `RarityContext` を提供し、`useRarityList(gachaId)` `useRarityMeta(rarityId)` などの selector を実装。`RarityService` の `listRarities`/`upsert`/`delete` を Action にラップする。【F:src/rarity.js†L30-L136】
- 追加ボタンは `createRarity(gachaId)` を dispatch し、即座に新規行へフォーカス。`saveSelectedToLS` 相当の処理は `useEffect` で `selectedGachaId` が変わるたびに実行。
- 排出率正規化 (`normalizeEmitViaService`) は `useRarityNormalizer(gachaId)` Hook で再利用できるよう切り出す。【F:src/rarity.js†L73-L95】

#### Tailwind / UI 指針
- `.tabs` 相当を `flex gap-2 border-b border-border` としてユーティリティ化。【F:index.css†L73-L77】
- テーブルは `grid` ベースに再設計し、モバイル時は縦カード表示（`grid-cols-1 gap-3`）へレスポンシブ切替。
- カラーピッカーは Headless UI + Tailwind でモーダル化し、`applyRarityColor` のスタイル適用を `style` ではなくクラスで行う。

### 4.2 アイテム設定
#### 現状の挙動
- `#itemsPanel` でガチャタブ (`#gachaTabs`) と `renderItemGrid()` によりカードグリッドを描画。各カードは画像設定/解除・リアグ切替・削除のボタンを持つ。【F:index.html†L198-L203】【F:index.html†L843-L933】
- カードレイアウトは `.item-grid`, `.item-card`, `.item-thumb`, `.card-actions` 等で定義。【F:index.css†L73-L89】
- リアグ操作は `openRiaguModal()` を呼び出し、レアリティ色は `rarityService` のメタカラーを参照して HTML を差し替えている。【F:index.html†L898-L918】

#### React コンポーネント構造案
- `ItemsPage`: 選択ガチャ状態とカード一覧をまとめるコンテナ。
- `GachaTabs`: ガチャ切替タブを共通コンポーネント化し、他セクション（ユーザー/リアグ）でも再利用可能な `Tabs` primitive を使用。
- `ItemGrid`: `ItemCardModel[]` を props に取り、空状態表示・仮読み込み skeleton を内包。
- `ItemCard`: サムネイル・コード・レアリティバッジ・アクションボタンを描画。`onPrimary` (画像設定/解除)、`onToggleRiagu`、`onDelete` を受け取る。
- `ItemActionsBar`: 一括操作やフィルタ（レアリティ/検索）を今後拡張できるように上部に配置。
- `ItemAssetModal`: 現行の画像モーダル（`#imageModal`）を React 化し、`ItemCard` から `ItemAssetContext` を通じて開く。

#### 状態とデータフロー
- `useCatalogItems(gachaId, filters)` Hook を用意し、AppState からガチャごとのアイテム一覧を取得。リアグ・画像情報は `AssetStore` / `RiaguStore` selector で付与。
- 画像保存は `AssetStore` の `setAsset` / `clearAsset` を呼び、完了後に React Query などでキャッシュを更新。リアグ切替は `RiaguStore.mark/unmark` を dispatch。【F:src/ui-riagu.js†L320-L385】
- 削除確認は `DialogContext` を使いモーダルを制御。削除後に AppState を更新し、ユーザー集計との整合を確保する。

#### Tailwind / UI 指針
- `.item-grid` を `grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2.5` で再現。【F:index.css†L73-L89】
- `.flag` バッジは `absolute top-2 right-3 flex gap-1.5` などで表現し、Tailwind の `badge` コンポーネントを共通化。
- リアグ状態は `ItemCard` に `data-riagu` 属性を付与し、Tailwind Variant（`clsx`）で強調背景を制御。

### 4.3 ユーザーごとの獲得内訳
#### 現状の挙動
- パネルヘッダーのフィルタトグル、各種ポップオーバー付きフィルタ、テキスト検索を DOM 操作で制御している。【F:index.html†L205-L266】
- ユーザーカードは折りたたみ式で、`renderUsersList()` 内でヘッダー・本文・アクションボタンを生成。ZIP 保存や URL コピー、リアルタイム計数表示を含む。【F:index.html†L941-L1019】
- スタイルは `.user-card`, `.user-subcontrols`, `.item-pill` 等に依存し、アニメーションは `height` トランジションで実現。【F:index.css†L90-L123】【F:index.css†L360-L399】

#### React コンポーネント構造案
- `UsersPage`: フィルタステートとユーザーリストを保持する親コンポーネント。
- `UserFilters`: ガチャ/レアリティ MultiSelect、チェックボックス、検索欄を Headless UI `Listbox` / `Switch` で再構築。モバイル折りたたみは `Disclosure` で管理。
- `UserList`: フィルタ済みのユーザーデータを受け取り、`UserCard` を並べる。
- `UserCard`: ヘッダー（ユーザー名・アクションボタン・折りたたみトグル）と本文（獲得一覧）を分割。`Collapsible` コンポーネントで高さアニメーションをハンドル。
- `UserInventoryTable`: レアリティごとの獲得品リストをグリッド表示。`RarityBadge` や `ItemPill` コンポーネントを再利用。
- `UserActions`: ZIP 保存・URL コピー・共有トーストなどを `ToolbarButton` としてまとめる。

#### 状態とデータフロー
- `useUserInventory()` Hook で AppState の `data`, `counts`, `catalogs` を組み合わせ、フィルタ条件に基づいて `UserCardModel` を作成。
- フィルタ状態は URL クエリ（`?users[rarity]=SR`）または LocalStorage に同期し、他セクションとの整合を確保。既存の `getSelectedGachas`, `getSelectedRarities` ロジックを TypeScript へ移植。【F:index.html†L959-L965】
- ZIP 保存などの副作用は専用の `useExportUserInventory` Hook で処理し、完了時にトースト通知を表示。URL コピーは `navigator.clipboard` を使用。
- 折りたたみ状態は `usePersistentState` でユーザー単位に保存し、既存の `gUserCollapsed` を置き換える。【F:index.html†L996-L1010】

#### Tailwind / UI 指針
- `.user-card` を `bg-panel rounded-2xl shadow-xl` のカードプリセットで再現し、`aria-expanded` に応じた `data` 属性でトランジションを制御。【F:index.css†L90-L118】
- フィルタグリッドは `grid grid-cols-[max-content,1fr] gap-x-3 gap-y-2` を適用し、モバイルでは `flex flex-col gap-2` へ切り替える。【F:index.css†L360-L399】
- `ItemPill` は `inline-flex items-center gap-1 rounded-full border border-border bg-[#23232b] px-2 py-1` とし、Tailwind Variant で画像有無を切り替える。【F:index.css†L99-L105】

### 4.4 リアグ
#### 現状の挙動
- `renderRiaguPanel()` がサービスから取得したキーをガチャ単位にグループ化し、タブとリアグカードを描画。合計金額表示や編集/解除ボタンを備える。【F:src/ui-riagu.js†L114-L233】
- 編集モーダルは `initRiaguUI()` 内でリスナーを登録し、保存時に `riagu.mark` / `riagu.unmark` を呼び出して AppState を更新後、再描画をトリガーしている。【F:src/ui-riagu.js†L268-L409】
- スタイルは `.riagu-item`, `.riagu-stats`, `.riagu-winners`, `.riagu-actions` などに依存。【F:index.css†L402-L418】

#### React コンポーネント構造案
- `RiaguPage`: ガチャタブとサマリーカードを描画する親コンポーネント。
- `RiaguTabs`: ガチャ単位でタブを表示し、`selectedGachaId` を Context と同期。
- `RiaguList`: 選択ガチャのリアグ対象をマッピングし、`RiaguCard` コンポーネントを並べる。
- `RiaguCard`: レアリティバッジ・アイテム名・コスト/発注数/合計のタグ・獲得者チップ・アクションボタンを表示。
- `RiaguWinners`: ユーザー × 個数のチップ一覧を描画し、0 件時は空状態メッセージ。
- `RiaguModal`: 原価・種別の編集ダイアログを React 化。保存/解除ボタンと入力バリデーションを実装。

#### 状態とデータフロー
- `RiaguStore` の selector として `useRiaguKeys(gachaId)`, `useRiaguMeta(key)`, `useRiaguWinners(key)` を用意。後者は AppState の `counts` と `data` を参照して winners 集計を返す。【F:src/ui-riagu.js†L73-L205】
- 画像解除などの副作用は `ItemAssetStore` に委譲し、リアグ登録時に ItemGrid 側へシグナルを送る。React では Context 更新で即時反映させ、明示的な `renderItemGrid()` 呼び出しを排除する。【F:src/ui-riagu.js†L320-L385】
- 保存/解除完了後は `RiaguStore` と `AppStateStore` の `saveDebounced` を呼び、永続化を保証。
- タブ選択は URL クエリや LocalStorage に保持し、ページ再訪時に最後の選択を復元する。

#### Tailwind / UI 指針
- `.riagu-item` を `bg-[#121218] border border-border rounded-xl p-4 space-y-3` に置換し、Tailwind `badge`/`chip` コンポーネントで統一感を出す。【F:index.css†L402-L413】
- 合計表示 `.riagu-total` は `text-right font-bold border-t border-border pt-2` で表現。【F:index.css†L412-L413】
- リアリティバッジは `RarityBadge` を再利用し、Tailwind Variant で色を適用。

## 5. 横断的な再利用コンポーネント
- `Panel` / `Card`: `.panel` や `.user-card` のレイアウトを Tailwind で共通化し、影・角丸・背景色をデータ属性で切り替える。【F:index.css†L68-L118】
- `Tabs` / `TabList`: レアリティ・アイテム・リアグ各所で共通化。閉じるボタン付タブにも対応する（ガチャ削除ボタン）。【F:index.html†L820-L838】【F:index.css†L73-L88】
- `Badge` / `Tag` / `Chip`: アイテムカードのバッジ・リアグチップ・ユーザー内訳のカウント表示で統一利用。【F:index.css†L86-L105】【F:index.css†L411-L413】
- `ModalHost`: 画像設定・リアグ・削除確認など複数モーダルを React Portal に集約し、フォーカスマネージメントを一元化する。【F:index.html†L312-L375】【F:src/ui-riagu.js†L268-L357】

## 6. レイアウト / ナビゲーション要件（PC・モバイル）
### 6.1 DashboardShell とレスポンシブ判定
- 既存の `updateMobileViewMode()` が行う `matchMedia('(max-width: 900px), (hover: none) and (pointer: coarse)')` 判定と `data-view` 切替を `useResponsiveDashboard()` Hook に移植し、`DashboardShell` コンポーネントで提供する。【F:index.html†L654-L709】
- Shell は `isMobile`・`activeView`・`setActiveView(viewId)` を Context で下位に配り、各セクションページは自分がアクティブなときのみ描画（もしくは `keepAlive` 付き Lazy）する。`activeView` は URL クエリまたは `localStorage` へ保持して再訪時に復元する。
- Tailwind 側では `isMobile` に応じ `className` を切り替え、既存の `.mobile-views` 相当のスタイルを `data-mobile` 属性（例: `data-mobile="true"`）でトリガーするユーティリティを作成する。PWA スタンドアロン判定は Shell 内で `useEffect` から行い、必要に応じて `document.body.dataset.displayMode` を更新する。

### 6.2 デスクトップ時の 4 パネル並列
- `DashboardDesktopGrid` コンポーネントで `lg:grid xl:grid-cols-4 gap-6` を基本とし、1400px 以上で `grid-cols-[minmax(26rem,1fr)_minmax(38rem,1.4fr)_minmax(32rem,1fr)_minmax(22rem,0.9fr)]` といったカスタムカラムを Tailwind の `grid-cols-[...]` で再現する。【F:index.css†L308-L320】
- 並び順は既存と同じく「レアリティ → アイテム画像 → ユーザー内訳 → リアグ」を維持し、各セクションのカードが互いに高さを干渉しないよう `items-start` を指定。セクションコンテナは `Panel` コンポーネントを使い `className="h-full flex flex-col"` としてレイアウトの安定性を確保する。
- コントロールバー（旧 `controlsPage`）はデスクトップではグリッド外のトップに表示し、`DashboardShell` で `ControlsPanel` を `aside` として配置する。

### 6.3 モバイルタブとビュー切替
- `DashboardMobileTabs` コンポーネントで下部タブバーを描画し、`activeView` を上下文から受け取る。Tailwind では `fixed inset-x-0 bottom-0 z-50 flex gap-2 px-3 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-2.5 backdrop-blur` などで `.mobile-tabs` のスタイルを再現する。【F:index.css†L231-L244】
- 各タブボタンは `data-view="rarity|items|users|riagu"` を持ち、`onClick` で `setActiveView` を呼ぶ。アクティブ状態は `data-active` 属性で制御し、Tailwind Variant で枠線/色を切り替える。
- モバイル時は `DashboardShell` が各セクションを `data-view` に応じて条件描画し、非アクティブセクションは `display: none` の代わりに `hidden` クラスを付与する。React Router を併用する場合は `Tabs` と URL を同期させ、バック操作でセクションが切り替わるようにする。【F:index.css†L245-L279】

### 6.4 モバイル専用ドロワーとハンバーガー
- 既存のドロワー UI (`.drawer`/`.menu-btn`) を `MobileDrawer` として React 化し、`@headlessui/react` の `Dialog` を使って `pointer-events` や `backdrop` の制御を行う。【F:index.css†L200-L243】
- `ControlsPanel` はモバイル時にドロワー内へポータルし、`DashboardShell` の `isMobile` が変化した際に自動でマウント位置を切り替える。`focus-trap` とスクロール抑止 (`body.drawer-open`) を Tailwind + `useLockBodyScroll` Hook で実装する。
- `menu-btn` は `IconButton` コンポーネントを再利用し、`aria-expanded` と `aria-controls` を付与。Safe Area 対応のため `env(safe-area-inset-*)` を Tailwind で CSS 変数として読み込み、`px-[var(--safe-area-inline)]` のように扱う。

### 6.5 PWA / モバイルスタンドアロン最適化
- React エントリポイントで `initPWA()` を呼び、Service Worker 登録とズーム抑止をアプリ初期化の副作用として行う。失敗時のリトライ・`controllerchange` リロードなど現行ロジックを `useEffect` へ移植する。【F:src/pwa.js†L33-L158】
- モバイル PWA 時の overscroll 抑止やコンテナ余白調整は Tailwind の `@layer base` で `body[data-display-mode="standalone"]` などに適用し、`index_mobile.css` のメディアクエリを移植する。【F:index_mobile.css†L1-L29】
- `setupMobileStandaloneZoomBlock()` が除外しているインタラクティブ要素（`.allow-zoom`, `.tab`, `#gachaTabs`）を React 版でも `data-allow-zoom` 属性へ置換し、ズーム抑止の対象管理を簡潔にする。
- Shell から `window.dispatchEvent('sw-activated')` をリッスンして、表示中セクションにトースト通知を出すなど再読み込みの UX を補助する。

## 7. 実装ロードマップ（抜粋）
1. ドメインストア（Rarity/App/Assets/Riagu）の TypeScript 化と Hook インターフェース定義。
2. 共通 UI コンポーネント（Panel, Tabs, Badge, Chip, Collapsible, Modal）の実装と Storybook での検証。
3. レアリティ設定ページの React 化 → 排出率計算の自動テスト追加。
4. アイテム画像ページの React 化 → 画像モーダルとリアグ連携の統合。
5. ユーザー内訳ページの React 化 → フィルタ/折りたたみ状態の永続化。
6. リアグページとモーダルの React 化 → ItemGrid と双方向同期を確認。
7. 各セクション間の共有状態（選択ガチャ・リアリティカラー）の E2E テストを Playwright で整備。

