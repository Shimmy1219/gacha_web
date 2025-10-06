# SaveOptionsModal (React) 仕様書

## 1. 目的とスコープ
- ユーザー単位の保存手段（ローカル保存 / shimmy3.com アップロード / Discord 送信案内）をまとめて提示するモーダル。
- React 版では表示状態と直近のアップロード結果を `SaveOptionsModalStore` (Zustand) で管理し、UI は `SaveOptionsModal` コンポーネントが担う。
- どの画面からでも `openSaveOptionsModal(targetUserId)` を呼び出すと開き、閉じるとターゲット情報は破棄される。

## 2. モーダルライフサイクル
1. `openSaveOptionsModal(userId)` が呼ばれると `SaveOptionsModalStore` に `isOpen=true` / `targetUserId=userId` をセット。
2. モーダル初期表示時に `last-upload:<userId>` を localStorage から読み込み、結果があれば `lastResult` に反映。
3. 閉じる操作（×ボタン、フッターの閉じるボタン、`Escape`）で `close()` を呼び、`isOpen=false` / `targetUserId=null` / `lastResult=null` に戻す。閉じたら呼び出し元のフォーカスを返却。

## 3. UI レイアウト
```
┌──────────────────────────────────────┐
│ ヘッダー: 対象ユーザー名 + 閉じるボタン          │
├──────────────────────────────────────┤
│ メッセージ: 保存対象の概要                       │
│ ・最新共有URL があれば Info バナーで表示           │
├──────────────────────────────────────┤
│ アクションカード (grid sm:grid-cols-3 gap-4)      │
│ 1. デバイスに保存 (Primary)                       │
│ 2. shimmy3.com へアップロード (Secondary)         │
│ 3. Discord に直接送信（案内）                      │
├──────────────────────────────────────┤
│ 結果カード: 共有URL + コピー操作 (成功時のみ)      │
├──────────────────────────────────────┤
│ フッター: 成功/エラー表示 + 閉じるボタン           │
└──────────────────────────────────────┘
```
- カードは `ModalBody` 内で `Card` コンポーネントを縦積み（モバイル）→ 3 カラム（SM 以上）で表示。
- Discord カードには「現在は shimmy3.com に ZIP をアップロードし、そのリンクを Discord リスナーへ渡す準備を進めています。」と案内を載せ、ボタンは disabled。

## 4. アクションカード要件
| アクション | ラベル | ステート | 説明 |
|------------|--------|----------|------|
| ローカル保存 | `デバイスに保存` | `idle` / `loading` / `done` | ZIP 生成後 File System Access → Web Share → `<a download>` の順でフォールバック。完了時はグローバルトーストで通知。|
| Blob アップロード | `ZIPをアップロード` | `idle` / `loading` / `done` | `useBlobUpload()` を通じて shimmy3.com へアップロードし、共有 URL を生成。成功時は結果カードを表示。|
| Discord 送信 | `自分のDiscordサーバーに直接送信` | 常時 `disabled` | 現段階では仕様未確定。ボタンは押下不可で、説明テキストのみ表示。|

## 5. 成功時 UI
- ローカル保存成功: グローバルトーストで完了を通知する。モーダル内の状態は変えない。
- Blob アップロード成功:
  - `SaveOptionsModalStore.setResult({ kind: 'upload', url, expiresAt })` を呼び出す。
  - モーダル内に共有 URL カードを表示し、`コピー` ボタンでクリップボードへ複製できる。
  - メッセージセクションの Info バナーを「共有リンクを作成しました」に差し替える。

## 6. エラーハンドリング
- 各アクションは `loading` → `error` に遷移したらボタンを再有効化し、フッターにエラーメッセージを表示。
- ユーザーキャンセル（`AbortError` / `NotAllowedError` などの `DOMException`）はログのみに留め、UI では静かに無視。
- エラー発生時は `ga.event('save_options_error', { action, message })` を送信する。

## 7. ストア構成
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
- `lastResult` は最新の Blob アップロード結果。React ルートの `useEffect` で localStorage (`last-upload:<userId>`) と同期する。
- `open` / `close` は `openSaveOptionsModal` / `closeSaveOptionsModal` 経由で公開する。
# 保存オプションモーダル (SaveOptionsDialog) 仕様書

## 8. コンポーネント API
```ts
interface SaveOptionsModalProps {
  targetUserId: string;
  onClose(): void;
  initialResult?: SaveOptionsModalState['lastResult'];
}
```
- モーダル内部で `useSaveOptionsActions(targetUserId)` を呼び、各ボタンのハンドラを取得。
- `initialResult` は localStorage からロードした値。`setResult` が更新すると UI も同期される。

## 9. 依存モジュール
- `useZipBuilder()`：ZIP 構築ロジックを Promise ベースで提供。`doc/blob_upload_react_spec.md` 参照。
- `useBlobUpload()`：CSRF 取得と Vercel Blob へのアップロードをまとめたフック。
- `ToastContext`：グローバルトースト表示に利用。
- `ga`（Google Analytics）イベント送信ユーティリティ。

## 10. アクセシビリティ
- ルート要素に `role="dialog"` / `aria-modal="true"` を付与。
- オープン時は最初のアクションカード内ボタンへフォーカスを移し、閉じると呼び出し元トリガーへ戻す。
- `Escape` キーで閉じられるようにする。背景クリックは閉じない。

## 11. テレメトリ
- `ga.event('save_options', { action: 'open' | 'close' | 'download' | 'upload' })`。
- 失敗時は `ga.event('save_options_error', { action, message })`。

## 12. 未決事項
- Discord 送信フローの具体実装は別タスクで策定。`useSaveOptionsActions().sendToDiscord` はスタブを返し、UI は disabled 表示を継続。
- 共有 URL の有効期限延長や履歴表示など、拡張要件は今後の検討事項。
