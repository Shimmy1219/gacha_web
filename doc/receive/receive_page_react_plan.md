# ReceivePage React + Tailwind 移行詳細計画

## 1. 目的
- 既存の `/receive/index.html` を React + Tailwind CSS へ移行し、共有リンク受け取り体験をモジュール化・演出強化する。【F:doc/react_migration_plan.md†L179-L212】
- 受け取りリンクを 10 桁の英数字 ID へ短縮し、Vercel Edge Functions 経由で検証・ダウンロードを行うことで URL の可読性と安全性を高める。
- リスナー体験を向上させるため、配信者メッセージ付きのイントロ演出やレアアイテム演出、逐次開封 UI を実装する。

## 2. 現状仕様の整理
### 2.1 トークン取得と検証
- 受け取りページは `?t=` クエリを URLSearchParams で取得し、存在しない場合はタイトルを「受け取りリンクが見つかりません」に変更し操作を無効化している。【F:receive/index.html†L200-L205】【F:receive/index.html†L483-L505】
- トークンがある場合は `/api/receive/resolve` を呼び、AES-256-GCM で暗号化されたトークンを復号してダウンロード URL・ファイル名・有効期限を返却する。【F:receive/index.html†L491-L499】【F:api/receive/resolve.js†L53-L105】
- Resolve API は Blob Storage ホスト制限や有効期限チェックを行い、無効時は 4xx を返している。【F:api/receive/resolve.js†L82-L92】

### 2.2 UI フロー
- ページはバッジ付きカードレイアウトで手順説明と「受け取る」ボタン、進捗バー、抽出結果グリッドで構成される。【F:receive/index.html†L121-L160】
- 受け取りボタン押下で ZIP をストリーミングダウンロードし、JSZip で展開してメディア毎に項目カードを生成している。【F:receive/index.html†L427-L466】
- 抽出済みメディアはサムネイルと保存/ダウンロード操作を即時に提供し、全件保存では Web Share API も試行している。【F:receive/index.html†L315-L389】【F:receive/index.html†L470-L481】

### 2.3 共有リンク発行フロー
- 配信者側は ZIP を Vercel Blob へアップロードし、`issueReceiveShareUrl` が `/api/receive/token` に POST してトークンベースの共有 URL（`/receive?t=...`）を返却する設計である。【F:src/blob-upload.js†L32-L53】【F:src/blob-upload.js†L166-L199】
- トークンは AES-256-GCM でファイル名・用途・有効期限を封入したため、URL が長く扱いにくい課題がある。

## 3. 完成後仕様の概要
1. 受け取り ID もしくはリンク入力フォームを備えたトップ状態を用意し、無効なアクセスでもリスナー自ら ID を入力可能にする。
2. 共有リンクは `https://<site>/receive?key=<10桁ID>` 形式とし、Edge Function API で短縮 ID → Blob ファイル名を解決する。
3. 有効な ID に対しては、配信者メッセージと軽量アニメーションを含むイントロ演出を全画面表示し、その後に受け取りカードへ遷移する。
4. 受け取りボタン押下後は、ZIP 内に含まれる `metadata.json`（予定）を解析してアイテムのレア度・順序・演出種別を決定し、景品を 1 件ずつ表示する。
5. レア度が高いアイテムは画面全体を暗転させ、アイテム名とビジュアルを強調するスペシャル演出を行う。
6. エラー時は ID 再入力モーダルやサポート手順を提示し、配信者に再発行を依頼できる導線を保持する。

## 4. React + Tailwind 再設計指針
### 4.1 技術スタック
- `/receive` を Vite ベースのサブエントリとして構築し、共有アセットはメインアプリと共通の Tailwind 設定を利用する。【F:doc/react_migration_plan.md†L179-L194】
- 状態管理は React Query + `useReducer`（詳細は §4.3）でトークン検証・ダウンロード進捗・演出状態を扱い、Suspense/エラーバウンダリでネットワークエラーを吸収する。
- アニメーションライブラリとして `framer-motion` を基礎に、演出強化用に `anime.js`、パーティクル演出用に `tsParticles`（`particles.js` 互換）を併用する。Tailwind の `animate-` ユーティリティ + CSS keyframes も補助的に使用する。

### 4.2 ルーティング & SPA 状態
- 受け取りページは単一ルートで、URL クエリ `key` を監視しフォームから `navigate({ search })` で同期する。
- 追加で `?preview=1` 等の診断フラグを受け付け、イントロ演出やレア演出を単体で検証できる Storybook / 開発モードを用意する。

### 4.3 ステートマシン
`ReceiveContext` で下表の状態遷移と、副作用を集中管理する。Reducer では `action.type` を厳密な Union 型で扱い、演出同期のために `state.timeline`（`currentStep`, `revealedCount`, `isIntroSkipped` など）を保持する。

| 状態 | 説明 | 表示コンポーネント | 主な副作用 | 遷移トリガー |
| --- | --- | --- | --- | --- |
| `idle` | クエリなし/未送信。ID/リンク入力フォームを表示。 | LandingForm | フォーム入力値をローカルに保持。 | `submitValid` → `resolving` |
| `resolving` | Edge API で ID を検証。 | LoadingOverlay | React Query `resolveKey` 実行。 | `resolved`（成功）/`invalid`（404）/`error` |
| `resolved` | 配信者メッセージとイントロ演出を再生。 | IntroOverlay | `anime.js` でフェード、`tsParticles` で背景演出。 | 演出完了 → `ready`、スキップ → `ready` |
| `ready` | カードレイアウトを表示し「受け取る」ボタン待機。 | ReceiveDashboard | ProgressBar を初期化。 | `startDownload` → `downloading` |
| `downloading` | ZIP ダウンロード進行中。 | ReceiveDashboard | `useDownloadZip` が進捗 dispatch。 | `downloaded` → `unpacking` |
| `unpacking` | JSZip 展開 & メタ解析。 | ReceiveDashboard | `useZipEntries` が `metadata` を state へ格納。 | `parsed` → `revealing` |
| `revealing` | アイテムを逐次表示。 | RevealStage | `RevealTimeline` が `nextReveal` dispatch。 | `allRevealed` → `complete` |
| `invalid` | ID 未検出/期限切れ。 | ErrorScreen + 再入力フォーム | 入力値保持・再送信。 | `submitValid` → `resolving` |
| `error` | その他の障害。 | ErrorScreen | ログ送信（Sentry）。 | `retry` → `resolving` |
| `complete` | 全件表示完了。 | ReceiveDashboard（全件保存案内） | `localStorage` に完了フラグ。 | 共有/再視聴 → `complete` 維持 |

Reducer 例:
```ts
type Action =
  | { type: 'submitValid'; payload: { key: string } }
  | { type: 'resolve/success'; payload: ResolvedPayload }
  | { type: 'resolve/error'; payload: ResolveError }
  | { type: 'download/progress'; payload: { loaded: number; total?: number } }
  | { type: 'download/complete'; payload: { blob: Blob } }
  | { type: 'unpack/parsed'; payload: ParsedMetadata }
  | { type: 'reveal/next'; payload: RevealEvent }
  | { type: 'intro/skip' };
```

## 5. コンポーネント設計
### 5.1 ディレクトリ構成
```
src/receive/
├── App.tsx                  // Suspense/エラーバウンダリ + Router
├── providers/
│   └── ReceiveProvider.tsx  // Context + Reducer 実装
├── state/
│   ├── actions.ts           // Action 型 & クリエイター
│   ├── reducer.ts           // ステートマシン本体
│   └── selectors.ts         // メモ化セレクター
├── features/
│   ├── landing/LandingForm.tsx
│   ├── resolve/ResolveGate.tsx
│   ├── intro/IntroOverlay.tsx
│   ├── dashboard/ReceiveDashboard.tsx
│   ├── reveal/RevealTimeline.tsx
│   └── errors/ErrorScreens.tsx
├── components/
│   ├── ReceiveCard.tsx
│   ├── ProgressBar.tsx
│   ├── ItemRevealCard.tsx
│   ├── RareItemDialog.tsx
│   ├── MessagePanel.tsx
│   ├── TransitionCanvas.tsx
│   └── GlowButton.tsx
└── hooks/
    ├── useReceiveKey.ts
    ├── useEdgeResolve.ts
    ├── useDownloadZip.ts
    └── useZipEntries.ts
```

### 5.2 コンポーネント仕様

| コンポーネント | Props/State | 主な関数・メソッド | Tailwind 主体クラス | 備考 |
| --- | --- | --- | --- | --- |
| `LandingForm` | Props: `initialKey?: string`; State: `{ keyInput, error }` | `handlePaste`（URL から key 抽出）、`validateKey`（`/^[A-Za-z0-9]{10}$/`）、`handleSubmit` | `max-w-md mx-auto bg-panel/80 backdrop-blur rounded-3xl p-8 space-y-6 shadow-lg border border-white/10` | `input` は `text-lg`, `bg-black/40`, `focus:ring-2 focus:ring-primary-400`。|
| `ResolveGate` | Props: `queryKey: string` | `useEdgeResolve(queryKey)`、`handleRetry` | `flex flex-col items-center justify-center gap-4 py-16 text-center` | ローディング中は `animate-spin` の `IconRefresh` を表示。|
| `IntroOverlay` | Props: `message`, `theme`, `onSkip`, `onComplete`; State: `{ isMounted, particlesId }` | `startIntroSequence`（`anime.timeline`）、`renderParticles`（`tsParticles.load`）、`handleSkip` | `fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-theme-900 via-theme-800 to-theme-900 text-white px-6` | スキップボタンは `GlowButton variant="ghost"`。|
| `ReceiveDashboard` | Props: `{ status, progress, items, metadata, onStart }` | `renderActions`, `renderProgress`, `renderItems` | `mx-auto w-full max-w-5xl grid gap-6 lg:grid-cols-[360px,1fr] px-6 pb-16` | 左カラム: `ReceiveCard`（手順）、右カラム: `RevealStage`。|
| `ProgressBar` | Props: `{ value?: number; label?: string; variant?: 'determinate'|'indeterminate' }` | `getWidth`（`value` → `%`）、`getVariantClasses` | `h-2 rounded-full bg-surface/40 overflow-hidden` + `inner: bg-gradient-to-r from-primary-400 via-primary-500 to-primary-300 transition-[width] duration-300` | `variant='indeterminate'` 時は `animate-pulse`.|
| `ItemRevealCard` | Props: `{ item, isRevealed, onSave, onShare }` | `handleSave`, `handleShare`, `renderMeta` | `bg-panel rounded-2xl shadow-xl overflow-hidden transition-all duration-500 data-[revealed=false]:opacity-0 data-[revealed=true]:opacity-100` | `figure` は `aspect-video` + `object-cover rounded-xl`.|
| `RareItemDialog` | Props: `{ item, onClose }`; State: `{ particlesId }` | `playHighlight`（`anime.js` でズーム + グロー）、`mountParticles`、`handleClose` | `fixed inset-0 flex items-center justify-center bg-black/85 backdrop-blur-md` | `TransitionCanvas` を内包し、終了時に `dispatch({type:'reveal/next'})`。|
| `RevealTimeline` | Props: `{ items, metadata }`; State: `{ queue, isRunning }` | `startSequence`（`setInterval`/`requestAnimationFrame`）、`triggerRare`, `completeReveal` | `space-y-4` | `prefers-reduced-motion` 時は `completeReveal` を即時実行。|
| `ErrorScreens` | Props: `{ type, onRetry }` | `renderMessage`, `resolveSupportLinks` | `flex flex-col items-center gap-6 py-20 text-center px-6` | `invalid` では `LandingForm` を埋め込み。|
| `TransitionCanvas` | Props: `{ variant: 'intro'|'rare'; palette?: string }` | `initParticles`, `disposeParticles` | `absolute inset-0 pointer-events-none` | `tsParticles` プリセット（`intro`: nebula、`rare`: confetti）。|
| `GlowButton` | Props: `{ children, icon?, variant?: 'primary'|'ghost'|'danger' }` | `getVariantPalette`（Tailwind クラス配列） | `inline-flex items-center gap-2 rounded-full px-6 py-3 text-lg font-semibold transition shadow-[0_0_20px_rgba(var(--glow),0.35)] hover:shadow-[0_0_28px_rgba(var(--glow),0.55)]` | CTA ボタン共通。|

### 5.3 Context & Hooks
- `ReceiveProvider`
  - `state`: `{ phase, key, resolveResult, progress, items, metadata, timeline }`。
  - `dispatch` を `useMemo` でラップし、`useReceiveContext()` を公開。
  - `timeline`: `{ currentIndex: number; revealedIds: string[]; introCompleted: boolean; rareQueue: string[] }`。
- `useReceiveKey`
  - `parseInput(value: string)`：URL 文字列から `key` または `t` を抽出。
  - `normaliseKey(key: string)`：全角英数字を半角へ、`toUpperCase()`。
  - `validateKey(key: string)`：`/^[A-Za-z0-9]{10}$/` を満たすか検証。旧 `t` を検出した場合は `{ type: 'legacy', token }` を返す。
- `useEdgeResolve`
  - React Query `useMutation` ラッパー。`mutationFn` は `fetch('/api/receive/edge-resolve?key=...')`。
  - `onSuccess` で `dispatch({ type: 'resolve/success', payload })`。
  - `onError` で `dispatch({ type: 'resolve/error', payload })`。
- `useDownloadZip`
  - `startDownload(url: string)`：`fetch` + `ReadableStream` 読み込み。`progress` を `dispatch({ type: 'download/progress' })` で通知。
  - `abort()`：`AbortController` 連携でキャンセル。
- `useZipEntries`
  - `extractMetadata(zip: JSZip)`：`metadata.json` をパースし、`effects.animationPreset` を `anime.js`/`tsParticles` のプリセットと紐付け。
  - `listEntries(zip)`：`JSZip.forEach` で `items` 配列生成。
  - `mapEffects(metadata)`：レア度 → アニメーション種類を決定（`standard`/`rare`/`super-rare`）。

### 5.4 ロジックフロー
1. `App.tsx` で `ReceiveProvider` をラップし、初期クエリを `useReceiveKey.parseInput` で取得。`useEffect` で `dispatch({ type:'submitValid', payload:{ key } })` を発火。
2. `ResolveGate` が `phase==='resolving'` を検知し `useEdgeResolve.mutate` を実行。結果を Context に格納。
3. 成功時、`IntroOverlay` がモーダルとしてレンダリングされ、`onComplete` / `onSkip` で `dispatch({ type:'intro/complete' })`。
4. `ReceiveDashboard` が `phase==='ready'` で CTA 表示。`onStart` で `useDownloadZip.startDownload(resolveResult.downloadUrl)`。
5. ダウンロード完了後、`useZipEntries` が `metadata` + `items` を解析し `dispatch({ type:'unpack/parsed', payload })`。
6. `RevealTimeline` が `phase==='revealing'` で `startSequence` を開始。通常アイテムは即座に `dispatch({ type:'reveal/next', payload })`、レアは `RareItemDialog` で演出完了後に次へ進む。
7. 全件表示後、`ReceiveDashboard` が保存・共有導線を表示し、`localStorage` に `completedKeys` を記録する。

### 5.5 フォーム & 検証詳細
- 入力パターン
  - 10 桁キー: `^[A-Za-z0-9]{10}$`
  - URL: `https?://[^\s]+` → `URLSearchParams` で `key` または `t` を抽出。
  - エラーメッセージ: `入力された受け取りIDを確認してください`, `旧形式のリンクです` など。
- バリデーションステップ
  1. `handleChange` で `setState`。
  2. `validateKey` でフォーマット確認。
  3. 無効時は `GlowButton` を `disabled` + `opacity-50 cursor-not-allowed`。
- 状態管理
  - `LandingForm` 内部で `const [keyInput, setKeyInput] = useState(initialKey ?? '')`。
  - `useEffect` で `initialKey` 更新に追従。
  - `onSubmit` 時に `dispatch({ type:'submitValid', payload:{ key } })`。

### 5.6 アイテム表示詳細
- `ItemRevealCard`
  - `item` インターフェース: `{ id, filename, displayName, description?, previewUrl, rarity, effects }`。
  - 保存ボタン: `GlowButton variant='primary' icon={DownloadIcon}` → `handleSave` 内で `useFileSaver.save(item)`。
  - 共有ボタン: 条件付きで `navigator.share` → 失敗時は `toast` 表示。
- `RareItemDialog`
  - `anime.js` で `scale`（1.0→1.15）、`opacity`（0→1）を 600ms で制御。
  - `particles.js` プリセット: `rare` → `fireworks`, `super-rare` → `aura`。
  - `onClose` で `dispatch({ type:'reveal/next', payload:{ skipDialog:true } })`。
- `RevealTimeline`
  - `const interval = setTimeout(step, item.effects?.pace ?? 1200);`
  - `metadata.items` が `order` を持つ場合はソート、なければ ZIP 順。
  - `timeline.revealedIds` を `useMemo` で計算し、`ReceiveDashboard` のカードリストに受け渡す。

### 5.7 非同期エラーハンドリング
- `ResolveGate`：`NOT_FOUND` → `invalid`、`EXPIRED` → `invalid`（メッセージ差し替え）、その他 → `error`。
- `useDownloadZip`：`AbortError` は `idle` に戻し、ネットワークエラーは `error` に遷移。
- `useZipEntries`：`metadata` パース失敗時は `console.warn` + `fallbackOrder`。
- エラー画面では `GlowButton` で再試行、`mailto:` や Discord などのサポートリンクを表示。

## 6. データモデル & メタ情報仕様
### 6.1 Edge Function / DB スキーマ
- Vercel D1/PlanetScale 等で `receive_keys(id VARCHAR(10) PRIMARY KEY, blob_name TEXT, created_at TIMESTAMP, expires_at TIMESTAMP, message TEXT, theme JSON)` を想定。
- Edge Resolve API:
  - `GET /api/receive/edge-resolve?key=XXXXXXXXXX`
  - 成功レスポンス: `{ ok:true, blobName:string, downloadUrl:string, displayName:string, expiresAt:string, message?:string, theme?:object }`
  - 404/410 時は `{ ok:false, code:'NOT_FOUND'|'EXPIRED' }`。
- 既存の `/api/receive/resolve` は互換性のため残し、React ページでは新 API を優先。旧トークン `t` を受け取った際は既存 API をフォールバックで呼ぶ。

### 6.2 `metadata.json` 仕様
`blob-upload` React 版で生成される `meta/metadata.json`（詳しくは `doc/blob_upload_react_spec.md` §4 を参照）を受け取り側で解釈する。
```json
{
  "version": 1,
  "items": [
    {
      "filename": "rare_sword.png",
      "rarity": "UR",
      "order": 1,
      "displayName": "伝説のソード",
      "description": "○○回記念ガチャ",
      "effects": {
        "type": "rare",
        "palette": "crimson",
        "audio": "rare-fanfare.mp3"
      }
    },
    {
      "filename": "badge.jpg",
      "rarity": "R",
      "order": 2,
      "effects": { "type": "standard" }
    }
  ],
  "defaultMessage": "○○、ガチャを引いてくれてありがとう。景品大切にしてね"
}
```
- `useZipEntries` は `meta/metadata.json` を優先的に読み込み、存在しない場合はファイル名順でフォールバックする。ファイル自体が欠落している、もしくは JSON パースに失敗した場合は警告ログを残し、全アイテムを `rarity: 'UNKNOWN'`, `effects: { type: 'standard' }` で生成する。
- 個々のアイテムについて `rarity` または `effects` が欠落している場合は、`rarity` は `'UNKNOWN'`、`effects.type` は `'standard'` を与え、演出強度を最小構成に落とす。
- `defaultMessage` が欠落している場合は Edge Resolve API が返却するメッセージ（`resolveResult.message`）を利用する。
- `effects.type` が `rare` の場合は暗転演出、`super-rare` で特殊アニメーション、`standard` で通常表示などをマッピング。
- `effects.animationPreset` を追加予定（`"animejs-timeline"`, `"particles-explosion"` など）で、アニメーションテンプレートと紐付ける。

### 6.3 ダウンロード & 保存
- React 版でもストリーミングダウンロード → JSZip 展開の流れは踏襲しつつ、`ReadableStream` 非対応環境では自動フォールバックする。【F:receive/index.html†L240-L263】
- 保存系ユーティリティは `useFileSaver` Hook として切り出し、Web Share API と `<a download>` フォールバックをラップする。【F:receive/index.html†L265-L313】

## 7. アニメーション計画
### 7.1 イントロ演出
- `IntroOverlay` は全画面を覆うモーダルとしてマウントし、Edge API から受け取る `message` や `theme.palette` を背景グラデーションに反映。
- `anime.js` の `timeline` を用いて、フェードイン（0 → 1.2 秒）、メッセージの文字ごとのスケールイン、`GlowButton` のスライドアップを制御。
- `tsParticles`（`particles.js` 互換）で流星/光粒子プリセットを読み込み、配信者メッセージ背景に浮遊エフェクトを表示。
- イントロ終了後に `ReceiveContext` のステートを `ready` へ遷移させ、カードレイアウトを表示。スキップ時は `anime.remove` でアニメーションを停止。

### 7.2 アイテム逐次開封
- `RevealTimeline` は `requestAnimationFrame` もしくは `setTimeout` でテンポを制御し、通常アイテムはカードにフェード追加、レアアイテムは暗転ダイアログを経由。
- 暗転演出は `RareItemDialog` で背景を `backdrop-blur` + `bg-black/80` にし、アイテム画像をズームイン (`anime.js` の `scale`)、周囲に `TransitionCanvas` のパーティクル（`particles.js` の `confetti` プリセット）を重ねる。
- `metadata.effects.animationPreset` が `particles-explosion` の場合は `TransitionCanvas` で `tsParticles` の爆発プリセットを選択し、`anime.js` でアイテム名を `translateY` + `opacity` 制御する。
- 演出後はカードリストにスクロールフォーカスを与え、スクリーンリーダー向けに `aria-live` で新アイテムを告知。

### 7.3 進捗 & 状態遷移
- ダウンロード/解凍進捗は `ProgressBar` コンポーネントで Tailwind の `bg-gradient-to-r` を用い、`anime.js` の `update` コールバックでスムーズに幅を更新。
- ステート遷移時は `framer-motion` の `AnimatePresence` でカード全体をフェードさせ、エラー遷移では `animate-[shake_0.4s_ease-in-out]` カスタムキーフレームを追加して視覚的フィードバックを強化。
- `prefers-reduced-motion` が有効な場合は `anime.js` と `tsParticles` の初期化をスキップし、Tailwind の `transition-none` を適用。

## 8. API/バックエンド変更計画
1. Vercel 上に Edge Function `/api/receive/edge-resolve` を追加し、10 桁 ID → Blob 名の解決・有効期限検証・配信者メッセージ返却を行う。
2. 共有リンク発行ロジック（`issueReceiveShareUrl`）を拡張し、アップロード後に Edge Function の `POST /api/receive/edge-resolve`（仮称）を呼び出して ID を登録、レスポンスで短縮 URL を生成する。【F:src/blob-upload.js†L32-L199】
3. 旧トークン方式は段階的廃止とし、React 受け取りページで `?t=` を検出した場合は既存 API にフォールバックして互換を確保する。
4. `vercel.json` にエッジ関数のリージョン設定とキャッシュヘッダーを追加し、レイテンシを最適化する。
5. エラーコードをクライアントで扱いやすくするため、`code` フィールド（`NOT_FOUND`、`EXPIRED`、`RATE_LIMITED` など）を付与する。

## 9. Tailwind デザイン指針
- ベースは既存ダークテーマ（`--bg`, `--panel` など）を Tailwind の `theme.extend.colors` に登録し、カードやボタンは `rounded-2xl`, `shadow-xl`, `bg-panel` ユーティリティで再現する。【F:receive/index.html†L13-L160】
- Tailwind カスタムキーフレーム
  - `fade-in-up`: `{ from: { opacity:0, transform:'translateY(16px)' }, to: { opacity:1, transform:'translateY(0)' } }`
  - `shine`: `background-position` をアニメーションさせ、ボタンのグロー演出に使用。
  - `shake`: エラーメッセージ用に `transform: translateX(-4px)` ↔ `translateX(4px)`。
- レイアウトプリセット
  - `LandingForm`: `min-h-[calc(100vh-160px)] flex flex-col justify-center px-6`。
  - `IntroOverlay`: `text-shadow` を CSS 変数で追加し、`after:` 疑似要素でライトリム。
  - `ReceiveDashboard`: `lg:grid-cols-[360px,1fr]`、モバイルは `grid-cols-1`。
  - `ItemRevealCard`: `aspect-video` 画像ラッパー + `object-cover rounded-xl`。
- モバイルでは `sm:` ブレークポイント未満で単一カラム、`md:` 以上で 2 カラムを維持し、既存のレスポンシブ挙動を踏襲する。【F:receive/index.html†L79-L98】
- `rare` 演出では `bg-gradient-to-br from-amber-500/30 via-purple-500/20 to-sky-500/30` のオーバーレイを `mix-blend-screen` で適用。

## 10. 開発ロードマップ
1. **API 設計**: Edge Function スキーマと D1 テーブルを確定。`metadata.json` のフォーマット案を共有。
2. **React ベースセットアップ**: `/receive` 専用の Vite エントリ・Tailwind 設定・ESLint ルールを整備。
3. **Landing & Resolve 実装**: ID 入力フォームと Edge API フェッチを構築し、旧 `?t=` トークンの互換処理を追加。
4. **イントロ演出**: 配信者メッセージ表示とテーマカスタマイズ、スキップボタン（アクセシビリティ対応）を実装。
5. **ダウンロード & 展開 Hooks**: `useZipEntries` と保存ユーティリティを実装し、従来機能と同等のダウンロード体験を確認。【F:receive/index.html†L240-L389】
6. **逐次演出**: `RevealTimeline`・`ItemRevealCard`・`RareItemDialog` を組み合わせ、`metadata.json` 有無での分岐を実装。
7. **テスト & 計測**: Edge API の統合テスト、React コンポーネントのユニットテスト、Playwright での受け取り E2E テストを追加。
8. **移行フェーズ**: 旧 HTML ページと新 React ページを並行ホストし、短縮リンク提供後にリダイレクト設定を切り替える。

## 11. リスクと対策
- **Edge API 障害**: フォールバックとして旧トークン方式を一定期間保持し、Edge API が失敗した場合に切り替え可能とする。【F:api/receive/resolve.js†L53-L105】
- **metadata.json 欠落**: ファイルが存在しない場合でも従来通りファイル名ソートで一覧化するフォールバックを実装。
- **演出が長すぎる場合の UX 劣化**: イントロ演出はスキップボタンと「次回からスキップ」設定を提供し、`localStorage` で保持。
- **アクセシビリティ**: アニメーションは OS の「簡易表示」設定を尊重し、`prefers-reduced-motion` で演出を抑制。

## 12. 成果物
- React 受け取りページ実装（コンポーネント群 + Tailwind スタイル + Hooks）。
- Edge Function API 実装と DB マイグレーションスクリプト。
- `metadata.json` 仕様ドキュメントおよび配信者向けガイド。
- Playwright/E2E テストケース、Storybook イントロ演出サンプル。
