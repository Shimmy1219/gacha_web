# SaveOptionsModal (React) — UI仕様

## 目的
ユーザー別の保存手段をまとめて提示するモーダル。React 化後はステート管理を `SaveOptionsModalStore` (Zustand) に委譲し、UI は `SaveOptionsModal` コンポーネントが担う。

- どこからでも `openSaveOptionsModal(targetUserId)` を呼び出すと開く。
- モーダルは **1 ユーザー** に限定され、閉じるとターゲット情報は破棄される。

## UIレイアウト
```
┌──────────────────────────────────────┐
│ ヘッダー: ユーザー名 + 閉じるボタン             │
├──────────────────────────────────────┤
│ メッセージ: 保存対象の概要                       │
│ ・最新共有URL があれば Info バナーで表示           │
├──────────────────────────────────────┤
│ アクションカード (Stack)                        │
│ 1. デバイスに保存 (Primary)                     │
│ 2. ZIPをアップロード (Secondary)                 │
│ 3. 自分のDiscordサーバーに直接送信 (TBD)         │
├──────────────────────────────────────┤
│ フッター: 成功/エラー表示 + コピーなどの補助操作 │
└──────────────────────────────────────┘
```

### ボタン要件
| アクション | ラベル | ステート | 説明 |
|------------|--------|----------|------|
| ローカル保存 | `デバイスに保存` | idle / loading / done | ZIP生成後に File System Access → Web Share → `<a download>` の順でフォールバック。|
| Blobアップロード | `ZIPをアップロード` | idle / loading / done | ZIP生成 → Vercel Blob アップロード → 共有URL発行。|
| Discord送信 | `自分のDiscordサーバーに直接送信` | disabled | **今は未実装**。ロジック確定まで常に disabled 表示。|

### 成功時UI
- ローカル保存: トースト (グローバル) で成功通知。
- Blobアップロード: モーダル内に共有URLカードを表示し、`コピー` ボタンでクリップボードに複製可能。成功メッセージは Info バナーに差し替え。

### エラー表示
- 各アクションの `loading` → `error` でボタンを再度有効化し、エラーメッセージをフッターに表示。ユーザーキャンセル (`DOMException` name が `AbortError`/`NotAllowedError` 等) は静かに無視。

## ストア構成
```ts
interface SaveOptionsModalState {
  isOpen: boolean;
  targetUserId: string | null;
  lastResult?: {
    kind: 'upload';
    url: string;
    expiresAt: number;
  } | null;
  open: (userId: string) => void;
  close: () => void;
  setResult: (result: SaveOptionsModalState['lastResult']) => void;
}
```
- `lastResult` は最新の Blob アップロード結果。React ルートで `useEffect` により localStorage (`last-upload:<userId>`) と同期する。

## アクセシビリティ
- `role="dialog"`, `aria-modal="true"` を付与。
- オープン時に最初のアクティブ要素へフォーカス移動。閉じると呼び出し元トリガーへフォーカス返却。
- Escape キーで閉じる。

## テレメトリ（任意）
- `ga.event('save_options', { action: 'open' | 'close' | 'download' | 'upload' })`
- 失敗時は `ga.event('save_options_error', { action, message })`

## 依存
- `useZipBuilder()` フック（本仕様で定義）
- `useBlobUpload()` フック（CSRF取得・Blob API 呼び出し）
- `ToastContext`

## 未決事項
- Discord 送信ボタンの仕様は別タスクで策定。
# 保存オプションモーダル (SaveOptionsDialog) 仕様書

## 1. 概要
- ユーザーごとのデータをエクスポートする手段（ローカル保存、shimmy3.com アップロード、Discord 直接送信）を提供するモーダル。【F:index.html†L474-L517】【F:src/blob-upload.js†L1-L209】

## 2. 現行実装
### 2.1 DOM
- `#saveOptionModal` には 2 枚のカード（ローカル保存、shimmy3.com アップロード）とアップロード結果表示、閉じるボタンがある。【F:index.html†L479-L515】

### 2.2 スクリプト
- `initSaveModal()` がイベントをバインドし、ローカル保存 (`#saveDeviceBtn`)、アップロード (`#uploadBlobBtn`)、結果コピー (`#copyUploadUrlBtn`) を処理する。【F:src/blob-upload.js†L99-L209】
- アップロード時は ZIP を生成 → Vercel Blob へアップロード → 受け取り URL を取得 → UI 更新 → `setLastUploadUrl` を呼び出す。【F:src/blob-upload.js†L144-L188】【F:index.html†L1001-L1033】

## 3. React 移行後仕様
### 3.1 コンポーネント API
```ts
interface SaveOptionsDialogProps {
  targetUser: string;
  gachaSnapshot: UserGachaSnapshot;
  lastShareUrl?: string;
  onClose(): void;
}
```
- `useSaveOptions(user)` Hook が ZIP 生成、アップロード、Discord 送信ロジックをまとめて提供する。

### 3.2 UI
- 3 カード構成 (`grid sm:grid-cols-3 gap-4`) とし、各カードにタイトル・説明・CTA ボタンを配置。【F:doc/modal_component_plan.md†L99-L100】
  1. **自分で保存して共有する**：ローカル ZIP 保存。既存機能を踏襲。
  2. **shimmy3.com のアップロード（無料）**：既存説明。
  3. **自分のDiscordサーバーに直接送信**：説明文に「これは shimmy3.com に ZIP ファイルをアップロードしたうえで、そのリンクを自動でリスナーに渡します。」と明記する。
- アップロード結果セクションは共通でリンク/コピー UI を表示。Discord 送信時も同じ結果ボックスを再利用する。【F:doc/modal_component_plan.md†L100-L101】
- 閉じるボタンは `ModalFooter` の右端に配置。

### 3.3 挙動
- ローカル保存: 既存の ZIP 生成 → 保存処理を `useSaveOptions().saveToDevice()` に移植。【F:src/blob-upload.js†L118-L143】
- shimmy3.com アップロード: 既存処理を `useSaveOptions().uploadToShimmy()` として再実装し、完了後に結果ボックスを表示する。【F:src/blob-upload.js†L144-L188】
- Discord 直接送信:
  1. `uploadToShimmy()` と同様に ZIP を生成し shimmy3.com へアップロード。
  2. 受け取った共有 URL を Discord Webhook/リスナー API に送信する（`discordService.sendShareLink({ user, shareUrl })`）。
  3. 成功時に結果ボックスへ共有 URL を表示し、「Discord へ送信済み」とメッセージを表示。
  4. 失敗時はエラー表示し、再送ボタンを有効化。
- モーダルを開いた際に `lastShareUrl` があれば `コピー` ボタンを表示する（従来どおり）。【F:index.html†L1008-L1017】

## 4. サービス/メソッド要件
- `zipService.buildForUser(user, snapshot)`：ZIP 生成を Promise で返す既存ロジックの抽象化。【F:src/blob-upload.js†L118-L134】
- `shimmyUploadService.upload(blob)`：`uploadZip` + `issueReceiveShareUrl` をまとめるサービス。
- `discordService.sendShareLink`：アップロード結果 URL を Discord Bot/Listener へ送信する新規メソッド。Webhook URL は設定から取得。
- `saveHistoryService.setLastUploadUrl(user, url)`：結果を永続化し、ユーザー一覧の「URLをコピー」ボタンを更新。【F:index.html†L1001-L1033】

## 5. テスト観点
- 3 カードが正しく表示され、各ボタンが固有のハンドラを呼ぶことをユニットテスト。
- Discord 送信が失敗した場合にエラーが表示され、結果 URL は保持されること。
- 既存の「URLをコピー」ボタンが Discord 経由の共有でも利用できること。
- `initSaveModal` 互換 API が引き続き動作し、非 React コードからもモーダルが開けることを回帰テスト。
