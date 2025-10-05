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
