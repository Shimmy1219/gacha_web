# HeaderShell / Toolbar React 移行詳細計画

## 1. 目的
- 既存の `<header>` と `.toolbar` が別々に配置されている DOM を React + Tailwind CSS で統合し、アプリ全体のヘッダーシェルとして再構築する。【F:index.html†L123-L191】
- 旧 `ui-toolbar.js` が担っているフィルタ状態管理とサブコントロール折りたたみを React コンテキストとフックに移し、手続き的な DOM 操作を解消する。【F:src/ui-toolbar.js†L1-L104】
- デスクトップではブランド・ツールアクション・ログインボタンを横一列に、モバイルではハンバーガー → ドロワー内へツールアクションを移設するレスポンシブレイアウトを Tailwind で定義する。【F:index.css†L47-L115】【F:index.css†L219-L280】

## 2. 現状整理
### 2.1 レイアウト
- `<header>` にタイトル・説明・モバイル用メニューボタンが置かれ、ログインスロットやツールボタン群は離れた `.toolbar` セクションに存在するため、視覚的に分断されている。【F:index.html†L123-L190】
- `.toolbar` 内にはサマリタグ、リアルタイム入力ボタン、全体エクスポート/インポート、Discord ログインエリアが横並びで配置されている。【F:index.html†L175-L191】
- CSS 側では `.toolbar` が独立したカード状コンポーネントとしてスタイルされており、ヘッダーの余白・グリッドとの整合が取れていない。【F:index.css†L47-L68】
- モバイル時は `.menu-btn` と `.drawer` でツールバーをドロワーに移し替える仕組みが実装されている。【F:index.css†L219-L240】

### 2.2 機能
- `ui-toolbar.js` はサブコントロール折りたたみ状態 (`subctrlCollapsed`) をローカルストレージへ保存し、ユーザー一覧やアイテムグリッドの再描画をイベント経由で実行している。【F:src/ui-toolbar.js†L27-L98】
- フィルタ類（`hideMiss`、`showCounts`、`showSkipOnly`、検索ボックス）へのイベントバインドと `toolbar:changed` カスタムイベント発火も同スクリプトが担当している。【F:src/ui-toolbar.js†L100-L146】

## 3. React + Tailwind への移行方針
1. `apps/web/src/components/app-shell/` に `AppHeaderShell.tsx` を新設し、ヘッダーとツールアクションの統合レイアウトを司る。
2. `ToolbarStateProvider` を `features/users/toolbar/` に追加し、`hideMiss` 等の状態・`toggleSubcontrols` を React Context (`useToolbarState`) として公開する。旧ローカルストレージキー `user_subcontrols_collapsed_v1` を `useEffect` で読み書きする。
3. 既存の Discord ログイン描画ロジックを `DiscordAuthButton` コンポーネントに移植し、`useDiscordSession` フックで `/api/discord/me` を React Query から取得する。
4. Tailwind の `@layer components` へ共通トークンを追加し、`.btn` や `.tag` のデザインをユーティリティクラスへ置換する。背景色・アクセントカラーは `--panel` や `--accent` の現行値を `tailwind.config.ts` のカスタムテーマに登録する。【F:index.css†L1-L44】
5. Vite + React ビルドでヘッダー関連 CSS を `AppHeaderShell` 専用の Tailwind クラスへ移行し、既存の `index.css` から該当セレクタを段階的に削除する。
6. モバイルドロワーは Headless UI の `Dialog` + `Transition` または自前の `useState` + Tailwind で管理し、`menuBtn` / `drawerOverlay` DOM 操作を排除する。

## 4. 新規コンポーネント仕様
### 4.1 `AppHeaderShell`
- **責務**: アプリ共通のヘッダー枠組みを提供し、ブランド領域・ツールアクション・ユーザー関連サマリの配置を制御する。
- **構造**:
  ```tsx
  <header className="w-full bg-surface/60 backdrop-blur border-b border-border">
    <div className="mx-auto flex items-center gap-4 px-6 py-4">
      <HeaderBrand />
      <div className="ml-auto hidden lg:flex items-center gap-3">
        <ToolbarSummary />
        <ToolbarActions />
        <DiscordAuthButton />
      </div>
      <MobileMenuButton />
    </div>
    <ResponsiveToolbarRail />
  </header>
  ```
- **ステート**: `isDrawerOpen`（モバイルメニュー開閉）、`isCompact`（スクロール連動で小型化する場合）。
- **イベント**: メニュー開閉、アクションボタンのハンドラを props 経由で `AppShell` へ伝播。
- **アクセシビリティ**: `<button aria-controls>` によりモバイルドロワーを制御し、`aria-expanded` を状態に同期させる。

### 4.2 `HeaderBrand`
- **表示内容**: サイトタイトル、キャッチコピー。Tailwind 例: `text-2xl font-bold text-white`, `text-sm text-muted`。
- **Props**: `title: string`, `tagline?: string`。`title`/`tagline` は国際化対応を想定し `AppShell` から渡す。

### 4.3 `ToolbarSummary`
- **役割**: 旧 `.tag#summaryTag` のステータスを表示。Tailwind 例: `px-3 py-1 rounded-full border border-border bg-panel-2 text-sm`。【F:index.html†L176-L179】
- **Props**: `label: string`, `variant: "default" | "warning" | "success"`。Tailwind の `data-variant` で色切替。

### 4.4 `ToolbarActions`
- **表示要素**: リアルタイム入力 (`openLivePaste`), 全体エクスポート (`exportAll`), 全体インポート (`importAllInput`) をボタン群として提供する。【F:index.html†L180-L189】
- **構成**: `ActionButton` コンポーネント（Tailwind `btn-primary`）、`GhostButton`、`FileInputTrigger` などで再利用性を確保。
- **Props**:
  ```ts
  interface ToolbarActionsProps {
    onOpenRealtime(): void;
    onExportAll(): void;
    onImportAll(files: FileList): void;
    importBusy: boolean;
  }
  ```
- **振る舞い**: インポートボタンは `label` と `input[type=file]` を React 内で連動させ、ファイル選択時に `onImportAll` を発火。

### 4.5 `DiscordAuthButton`
- **内容**: 既存の `renderDiscordLoginButton` 相当を React 化し、ログイン済み時はアバターとユーザー名をバッジとして表示する。【F:index.html†L32-L87】
- **API**: `useDiscordSession` が `data: { user?: { id: string; name?: string; avatar?: string } }` を返却し、ログアウト操作も提供。
- **配置**: `AppHeaderShell` の右端 (`lg:` 以上) とモバイルドロワー内に同一コンポーネントをレンダリング。

### 4.6 `ResponsiveToolbarRail`
- **役割**: デスクトップではサブコントロール (`ToolbarFilters`) をヘッダー直下の細いバーとして表示し、モバイルではドロワー内部へ移す。
- **実装**: Tailwind で `hidden lg:flex` / `lg:hidden` を切替、`ToolbarFilters` コンポーネントを共有。

### 4.7 `ToolbarFilters`
- **内容**: `hideMiss`、`showCounts`、`showSkipOnly`、ユーザー検索ボックス、ガチャ絞り込み等を React フォームで提供。【F:index.html†L205-L220】
- **状態管理**: `useToolbarState` から `state` と `actions` を取得し、変更時に `ToolbarStateContext` が `useEffect` で `renderUsersList` 等の旧描画を呼ぶまでを React 化する。
- **折りたたみ**: `subctrlCollapsed` をコンテキストで管理し、`Disclosure` コンポーネントでアニメーションする。

## 5. レイアウト / レスポンシブ仕様
### 5.1 デスクトップ (lg ≥ 1024px)
- `AppHeaderShell` のメイン行は `grid-cols-[auto_1fr_auto_auto]` で配置。タイトル左、中央スペーサ、右側にサマリ・ボタン群・ログインを順に並べる。
- `.toolbar` で使用していた 16px のパディング・丸みをヘッダー下部のセカンダリバーへ引き継ぎ、アプリ全体の最大幅は 1200px を維持する。【F:index.css†L47-L55】
- ヘッダー下に `ToolbarFilters` を `border-t` 付きで設置し、旧 `.toolbar` カードを廃止。

### 5.2 モバイル (sm < 1024px)
- `MobileMenuButton` を可視化し、タップで `Sheet`（左側ドロワー）を開く。Tailwind 例: `lg:hidden inline-flex h-10 w-10 items-center justify-center`。【F:index.css†L219-L240】
- モバイルドロワーは全画面半透明オーバーレイ + 左側 86vw パネルを基本とし、スクロールはボディではなくパネル内で行う。
- ツールアクションボタンは縦積み (`flex-col gap-3`)、Discord ログインボタンも同じ幅で配置する。
- `ToolbarFilters` も同ドロワー内に折りたたみ可能として配置し、アコーディオン初期状態は `subctrlCollapsed` を尊重する。
- ヘッダー本体はタイトルとログインボタンのみを表示し、ツールアクションはドロワー経由でアクセスする。

### 5.3 ハンバーガー遷移
- ドロワー表示時に `useLockBodyScroll(true)` を実行し、バックグラウンドスクロールを禁止する。閉じると `false`。
- `Esc` キーとオーバーレイクリックで閉じられるようにし、`aria-hidden` を適切に更新する。

## 6. 状態とデータ連携
- `ToolbarStateContext` は以下のシグネチャを提供：
  ```ts
  interface ToolbarState {
    hideMiss: boolean;
    showCounts: boolean;
    showSkipOnly: boolean;
    userSearch: string;
    subcontrolsCollapsed: boolean;
  }
  ```
- アクション: `setHideMiss`, `setShowCounts`, `setShowSkipOnly`, `setUserSearch`, `toggleSubcontrols`。
- `useEffect` で `subcontrolsCollapsed` を `localStorage` と同期し、`toolbar:changed` 相当の通知は React Store（例: Zustand または Context reducer）経由で UI へ反映する。
- `AppHeaderShell` のサマリ表示は `AppStateStore` の `summaryTag` 相当データを props で受け取る。旧 DOM で `#summaryTag` に文字列を直接書き換えていたロジックを React の state 更新に置換する。【F:index.html†L176-L179】

## 7. Tailwind デザイントークン
- カラーパレット: `bg` → `background`, `panel` → `surface`, `panel-2` → `surface-muted`, `text` → `foreground`, `muted` → `muted`, `accent` / `accent-2` → `primary` / `primary-dark` として `tailwind.config.ts` の `extend.colors` に登録。【F:index.css†L1-L44】
- ボーダーとシャドウ: `border` → `border`、`shadow` → `shadow-elevated`。`AppHeaderShell` では `shadow-lg` + `bg-surface/70` + `backdrop-blur-md` を採用し、既存の `box-shadow` を再現。
- フォント: 現行のフォントスタックを Tailwind の `fontFamily.sans` に設定する。【F:index.css†L9-L18】
- スペーシング: `.toolbar` で使用していた `padding:16px`, `gap:12px` を Tailwind の `px-4`, `py-4`, `gap-3` として反映。

## 8. 移行手順
1. `AppHeaderShell` と関連コンポーネントを作成し、Storybook でデスクトップ/モバイルの状態を確認。
2. `ToolbarStateProvider` を既存 React ルート（`AppProviders`）へ追加し、旧 `ui-toolbar.js` の参照を段階的に削除。
3. Discord ログインボタンを React 化し、既存の `renderDiscordLoginButton` スクリプトを廃止。API 呼び出しは `fetch` → `React Query` に置換。
4. `.toolbar` セクションを React DOM に移行し、`index.html` から静的なツールバー DOM を削除。
5. Tailwind ユーティリティに合わせて CSS を整理し、`index.css` のヘッダー/ツールバー関連ルールを削除。
6. モバイルドロワーの動作を React で再実装し、`menuBtn` / `drawerOverlay` への手動イベントバインドを廃止。
7. 旧 `ui-toolbar.js` ファイルを削除し、`index.html` からのスクリプト読み込みを除去。
8. 統合後、E2E/回帰テストでフィルタ反映・リアルタイム入力・エクスポート/インポートが従来どおり動作するかを確認。

## 9. テスト計画
- **単体テスト**: `ToolbarStateProvider` の reducer が各アクションで正しい状態遷移を行うことを Vitest で検証。
- **コンポーネントテスト**: `AppHeaderShell` のモバイル・デスクトップスナップショット、ハンバーガー開閉操作を React Testing Library で確認。
- **E2E テスト**: Playwright で「ハンバーガー → リアルタイム入力ボタン押下 → モーダル表示」のフローを自動化し、デスクトップでは同ボタンがヘッダー右側で押せることを保証。
- **アクセシビリティ**: axe でヘッダー領域のコントラストとランドマーク（`<header>` / `nav`）が適正であるか検証。

## 10. リスクと対策
- **ログイン状態の二重管理**: 旧スクリプトと新 React フックが並存すると UI が二重レンダリングされる可能性があるため、マイグレーション段階では React 側に切り替え後ただちに旧スクリプトを削除する。
- **ローカルストレージ互換性**: `subcontrolsCollapsed` の既存キーをそのまま読み込むことでユーザー設定が維持されるようにする。【F:src/ui-toolbar.js†L41-L75】
- **Tailwind クラスの肥大化**: 共通ボタンを `Button` コンポーネント化し、`clsx` 等でバリアントを切り替えてクラスの重複を避ける。
- **ドロワーのスクロール制御**: `body` の `overflow:hidden` が React SSR と競合しないように、`useEffect` でクライアントサイドのみ適用する。

