# PWA React移行仕様書

## 1. 目的
- 既存の `src/pwa.js` を React ベースの初期化処理に置き換え、PWA 表示・アップデート制御・モバイルスタンドアロン時のズーム抑止を継承する。
- React エントリポイントから呼び出し可能なフック／プロバイダーを用意し、UI コンポーネントと連携した更新通知や状態共有を実現する。

## 2. 対象範囲
- サービスワーカー登録、アップデート検知、`controllerchange` リロード、`SW_ACTIVATED` メッセージ処理。
- モバイル PWA（standalone）時のダブルタップ／ピンチズーム抑止。
- PWA 状態を React コンポーネントへ伝播し、トースト／バナー等の表示に利用できるようにする。

## 3. 現行挙動の整理 (`src/pwa.js`)
1. `registerServiceWorker`
   - `navigator.serviceWorker.register('/sw.js', { type: 'module' })` をロード完了後に実行。
   - `reg.update()` を起動直後・`visibilitychange`(visible)・1 時間毎に呼び出し。
   - `controllerchange` 発火時に 1 度だけ `location.reload()`。
   - `message` イベントで `SW_ACTIVATED` をログ出力し、`window.dispatchEvent('sw-activated')`。
   - 登録失敗時は指数バックオフ付きリトライ、可視化イベント／15 秒間隔で再試行。
2. `setupMobileStandaloneZoomBlock`
   - `(max-width: 900px) or (hover:none and pointer:coarse)` でモバイルと判定。
   - `(display-mode: standalone)` or `navigator.standalone` で PWA スタンドアロン判定。
   - 非インタラクティブ要素へのダブルタップ・ピンチズームを `preventDefault` で抑止。
3. `initPWA`
   - 上記 2 関数を呼び出す初期化エントリ。

## 4. React での実装方針
### 4.1 構成要素
- `hooks/useServiceWorker.ts`
  - サービスワーカー登録を行い、状態 (`idle/registering/ready/updating/error`) と最新バージョン情報を返す。
  - `useEffect` で `registerServiceWorker` 同等のロジックを実装。
  - `visibilitychange` / interval のリトライは `useEffect` 内で `cleanup` も考慮。
  - `SW_ACTIVATED` 受信時に `setState({ status: 'activated', meta })`。
- `hooks/usePWADisplayMode.ts`
  - `matchMedia('(display-mode: standalone)')` と `navigator.standalone` を監視し、`displayMode` と `isMobile` を返す。
  - 変化時に `document.body.dataset.displayMode` を更新し、CSS 連携を維持。
- `providers/PWAProvider.tsx`
  - 上記フックをラップし `PWAContext` を提供。
  - `value` として `serviceWorkerState`, `displayMode`, `isMobileStandalone` 等を配信。
- `components/PWAUpdatePrompt.tsx`
  - `PWAContext` から `status === 'activated'` を監視し、更新通知 UI を表示。
  - `controllerchange` による自動リロード前にユーザーへ情報を提示するオプションを検討。

### 4.2 サービスワーカー登録ロジック
- `useEffect(() => { ... }, [])` で初期化。
- ロード完了待ちは `if (document.readyState !== 'complete') window.addEventListener('load', ...)` で再現。
- バックオフリトライは `async function register()` を内部に定義し `await`。
- `visibilitychange` 時の再試行は `document.addEventListener` し、`cleanup` で解除。
- `setInterval` による更新チェックも `cleanup` で `clearInterval`。
- 失敗時はフックの `state.error` を更新し、再試行中は `state.status = 'retrying'` 等で表現。
- `window.dispatchEvent` の代わりに `PWAContext` へ `dispatch`、必要に応じて `CustomEvent` も残す。

### 4.3 ズーム抑止の React 化
- `useEffect` 内で `touchend` / `touchstart` リスナーを登録し、依存配列に `isMobileStandalone` を指定。
- `isMobileStandalone` が `false` の場合はリスナーを解除。
- インタラクティブ要素判定ロジックは共通ユーティリティ `isInteractiveElement(target: EventTarget)` を `hooks/pwa/interaction.ts` 等で提供。

### 4.4 TypeScript 化
- PWA 周りの新規ファイルは TypeScript (`.ts/.tsx`) で作成し、型安全性を確保。
- `ServiceWorkerRegistration | null`、イベントリスナー型などを明記。
- `navigator` の型拡張 (`standalone?: boolean`) は `types/global.d.ts` 等で宣言。

## 5. アプリ統合
- React エントリポイント（例: `src/main.tsx`）で `<PWAProvider>` で全体をラップし、副作用を集中管理。
- 既存の `initPWA()` 呼び出しは削除し、`PWAProvider` 内部の `useEffect` で自動起動。
- UI 側は `const { status, displayMode } = usePWA()` などで利用。
- 更新通知コンポーネントをレイアウト共通領域に配置し、`status === 'activated'` でトーストを表示。

## 6. テスト / 検証
- `jest` / `vitest` でフックの単体テストを作成し、`matchMedia` や `serviceWorker` をモック化。
- E2E（Playwright）で以下を確認:
  - SW 有効時に `controllerchange` → リロードが一度だけ発生する。
  - `display-mode: standalone` + モバイルビューポートでズーム抑止が効く。
- Lighthouse の PWA カテゴリでスコアを確認し、回帰が無いか検証。

## 7. 移行手順
1. `hooks` / `providers` / `components` フォルダを作成し、上記ファイルを追加。
2. 既存の `src/pwa.js` を段階的に分割し、React 実装へロジックを移植。
3. `index.html` の `initPWA()` 呼び出しを削除し、React エントリポイントから `PWAProvider` を読み込む。
4. 旧 `pwa.js` を削除、テスト更新、`manifest.webmanifest` / `sw.js` 連携を再確認。
5. QA 環境で iOS Safari / Android Chrome のスタンドアロン動作を確認。

## 8. リスクと対策
- **リスク:** サービスワーカー登録タイミングが React マウント前にずれ、初期ロード時に登録されない。
  - **対策:** `document.readyState` 判定と `load` リスナーをフック内で維持。
- **リスク:** React 版ズーム抑止が解除されないままになる。
  - **対策:** `useEffect` のクリーンアップでリスナーを確実に解除し、依存を正確に設定。
- **リスク:** Context 経由の状態が未使用でバンドルサイズが増加。
  - **対策:** 需要に応じてカスタムフックを分割し、ツリーシェイキング可能な設計にする。

## 9. スケジュール目安
1. 仕様確定・設計: 0.5 日
2. フック／コンテキスト実装: 1.5 日
3. UI 統合・テスト整備: 1 日
4. QA / Lighthouse 検証: 0.5 日

合計: 約 3.5 日
