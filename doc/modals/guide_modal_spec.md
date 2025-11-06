# Guide Modal (GuideInfoDialog) 仕様書

## 1. 概要
- カタログ貼り付け完了後に手動入力導線を案内するインフォメーションモーダル。
- React 版では `GuideInfoDialog` として `StartWizardDialog` から遷移、またはライブ貼り付け完了時のトースト代わりに表示する。

## 2. 現行実装
### 2.1 DOM 構造
- `#guideModal` にタイトル、説明文、`#guideOk` ボタンのみを持つシンプルなレイアウト。【F:index.html†L346-L357】

### 2.2 関連スクリプト
- `startDone()` → `open(guideModal)` のフローで表示され、`#guideOk` クリックで `close(guideModal)` を呼ぶ。【F:index.html†L1742-L1748】【F:index.html†L1812-L1823】

### 2.3 状態
- `guideModal` は `open/close` 共通関数により `modalCount` を更新、スクロールロックと FAB 制御を共有する。【F:index.html†L1727-L1740】

## 3. React 移行後仕様
- `GuideInfoDialogProps`:
  ```ts
  interface GuideInfoDialogProps {
    onAcknowledge(): void;
    context?: 'catalog-complete' | 'live-prompt';
  }
  ```
- UI:
  - `ModalBody` に案内文、`ModalFooter` にプライマリボタンのみ配置。
  - `context` に応じて文章を切り替え、将来的にリンクを追加できるよう `description` スロットを用意。
- 動作:
  - `onAcknowledge` 実行時にモーダルを閉じ、`ModalProvider.pop()` を呼ぶ。
  - 開始フローでは `replace` で `GuideInfoDialog` を表示して案内を完結する。

## 4. 状態遷移
1. カタログ解析完了時またはユーザーがガイドをリクエストしたときに `push(GuideInfoDialog)`。
2. ユーザーが「分かった」を押すと `onAcknowledge` → `pop()`。
3. `context` が `catalog-complete` の場合、モーダルを閉じた後に手動入力ボタンへフォーカスを移動させる。

## 5. 必要なメソッド
- `useGuidePrompt()` Hook: `context` に応じて文章とフォーカス遷移ターゲットを決定。
- `focusLiveButton()` ユーティリティ：既存の `#openLivePaste` ボタンにフォーカスを移すロジックを React へ移植。【F:index.html†L180-L183】

## 6. テスト観点
- カタログ完了後に `GuideInfoDialog` が表示され、「分かった」で閉じると `modalCount` が 0 に戻ることを検証。
- `Escape` キーで閉じても `onAcknowledge` が 1 回だけ呼ばれること。
- 案内文が `context` に応じて切り替わるスナップショットテストを Storybook で追加する。
