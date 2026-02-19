# グローバル通知（トースト）汎用化設計

## 1. 目的
- 「保存オプション」モーダルで使っている画面上部の通知を、ページ/モーダルを問わず再利用できる共通機能にする。
- 通知バリエーションを `成功（緑）` のみから、`警告（黄）` と `失敗・エラー（赤）` まで拡張する。

## 2. 現在仕様（実装ベース）

### 2.1 SaveOptionsDialog の通知仕様
対象: `apps/web/src/modals/dialogs/SaveOptionsDialog.tsx`

- 通知状態はローカル state で管理。
  - `uploadNotice: { id: number; message: string } | null`
  - `noticeTimerRef` で 4 秒後に自動クローズ。
- 通知描画は `createPortal` で `#modal-root` 配下に表示。
- 表示位置は画面上部中央（`fixed inset-x-0 top-10`）。
- 見た目は成功専用（緑系 + `CheckCircleIcon`）のみ。
- 発火タイミング:
  - ZIPアップロード成功時: 「アップロードが完了しました」
  - Discord共有成功時: 「◯◯さんにDiscordで共有しました」

### 2.2 同画面内の他メッセージ
- 失敗時は上部通知ではなく、モーダル内 `errorBanner`（赤系）に表示。
- 警告は `lastDownload.warnings` として下部カード内に表示。

### 2.3 他画面/他モーダル
- `DrawGachaDialog` にも独自の成功通知 state (`discordDeliveryNotice`) があるが、上部通知ではなく結果欄のテキスト表示。
- 一部機能は `window.alert` を直接使用しており、通知体験が分散している。

## 3. 現状課題
- 通知実装が画面単位で重複している（state/timer/portal を各所で持つ）。
- 成功以外の通知表現が統一されていない。
- 画面横断で同じ UX を提供できない。
- `window.alert` と独自バナーが混在し、UI 一貫性が低い。

## 4. 汎用化設計

### 4.1 全体アーキテクチャ
- `NotificationProvider` を追加し、`AppProviders` 配下でアプリ全体をラップする。
- `useNotification()` フック経由で、任意の画面/モーダルから通知発火できるようにする。
- `GlobalNotificationHost` が通知キューを監視し、画面上部へ一元描画する。

推奨配置:
- `HapticsProvider` の内側（通知タイプに応じた触覚フィードバックを任意で追加可能）
- `ModalProvider` と同階層または内側（どちらでも可）
- ルーティング境界より外側（ページ遷移中も通知を維持可能）

### 4.2 公開 API（案）
```ts
export type NotificationVariant = 'success' | 'warning' | 'error';

export interface NotifyOptions {
  id?: string;          // 指定時は重複抑止に利用
  title?: string;       // 任意
  message: string;      // 必須
  variant: NotificationVariant;
  durationMs?: number;  // 既定: success=4000, warning=5000, error=7000
  dismissible?: boolean;// 既定: true
}

export interface NotificationContextValue {
  notify: (options: NotifyOptions) => string; // 返り値は notificationId
  dismiss: (id: string) => void;
  dismissAll: () => void;
}
```

使用例:
```ts
const { notify } = useNotification();

notify({
  variant: 'success',
  message: `${memberName}さんにDiscordで共有しました`
});

notify({
  variant: 'warning',
  title: '一部未設定',
  message: 'オリジナル景品に未設定ファイルがあります。'
});

notify({
  variant: 'error',
  title: 'アップロード失敗',
  message: errorMessage
});
```

### 4.3 表示仕様（UI/UX）
- 表示位置: 画面上部中央（現在仕様を踏襲）。
- スタック: 同時表示は最大3件（超過分は古いものから閉じる）。
- 自動クローズ:
  - success: 4000ms
  - warning: 5000ms
  - error: 7000ms
- 手動クローズ: 右端の閉じるボタンを常時表示。
- アニメーション: フェード + 上下スライド（入退場を統一）。

### 4.4 バリアント仕様
- success（緑）
  - アイコン: `CheckCircleIcon`
  - 用途: 完了通知、共有成功、保存成功
- warning（黄）
  - アイコン: `ExclamationTriangleIcon`
  - 用途: 部分成功、注意喚起、再確認促し
- error（赤）
  - アイコン: `XCircleIcon`
  - 用途: 失敗、例外、ユーザー操作が必要なエラー

### 4.5 アクセシビリティ
- `success` / `warning`: `role="status"` + `aria-live="polite"`
- `error`: `role="alert"` + `aria-live="assertive"`
- キーボードで閉じるボタンに到達可能にする。

### 4.6 命名規則（このリポジトリ方針準拠）
通知UIは以下の固有 class を先頭に付ける。
- `global-notification-root`
- `global-notification__viewport`
- `global-notification-toast`
- `global-notification-toast--success`
- `global-notification-toast--warning`
- `global-notification-toast--error`
- `global-notification-toast__icon`
- `global-notification-toast__content`
- `global-notification-toast__title`
- `global-notification-toast__message`
- `global-notification-toast__close-button`

※ `className` は「固有class → Tailwindユーティリティ」の順序を維持する。

## 5. 適用方針（段階的移行）

### Step 1: 基盤追加
- `NotificationProvider` / `useNotification` / `GlobalNotificationHost` を実装。
- `AppProviders` に組み込み。

### Step 2: SaveOptionsDialog 置換
- `uploadNotice` / `noticeTimerRef` / `noticePortalRef` / `createPortal` を削除。
- 成功通知は `notify({ variant: 'success', ... })` に置換。
- 失敗時は `errorBanner` 継続で問題ないが、必要に応じ `variant: 'error'` へ統合。

### Step 3: 横展開
- `DrawGachaDialog` の `discordDeliveryNotice` を共通通知に移行。
- `window.alert` 利用箇所を優先度順に共通通知へ置換。

## 6. テスト設計
- Provider 単体
  - `notify` でキューに追加される
  - `durationMs` 経過で自動削除される（fake timer）
  - `dismiss` / `dismissAll` が機能する
  - `id` 重複時の上書き/抑止が期待どおり
- Host 表示
  - variant ごとにクラス・role・アイコンが切り替わる
  - close ボタンで手動削除できる
- 統合
  - SaveOptionsDialog から通知が発火し、画面上部に表示される

## 7. 互換性とリスク
- リスク: 通知の多発で視認性が下がる。
  - 対策: 同時表示上限と重複抑止を導入。
- リスク: モーダル z-index と干渉。
  - 対策: Host の z-index をモーダルより高く固定し、回帰確認を実施。

## 8. 本件の結論
- 現在の「保存オプション」通知はローカル実装で、成功（緑）専用。
- 今後は `NotificationProvider + useNotification` に一本化し、成功/警告/失敗の3バリアントを標準化するのが最小コストで拡張性が高い。
