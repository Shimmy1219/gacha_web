# Start Modal (StartWizardDialog) 仕様書

## 1. 概要
- 起動時にユーザーへ初期フロー（外部TXT取込・JSON読込・新規作成）を提示するオンボーディングモーダル。
- React 移行後は `StartWizardDialog` として `ModalProvider` 配下から呼び出し、Tailwind のカードグリッドで 3 タイルを表示する。

## 2. 現行実装の構造
### 2.1 DOM 構造
- `#startModal` 内に 3 つの `.start-tile` ボタンと JSON/TXT の隠しファイル入力、閉じるボタンを配置。【F:index.html†L291-L324】

### 2.2 関連スクリプト
- `#openStart` クリックで `open(startModal)` を実行し、`#closeStart` で `close(startModal)` を呼び出す。【F:index.html†L1751-L1757】
- `startDone()` はスプラッシュ画面の非表示とメイン UI の表示を制御し、開始モーダルを閉じる。【F:index.html†L1742-L1748】
- 各タイルのクリックハンドラは別スクリプト（`src/ui-start.js` 相当の既存実装）でファイル選択や新規作成フローへ分岐する想定。（`tileTxt`, `tileJson`, `tileNew` の DOM ID）【F:index.html†L297-L314】

### 2.3 状態・入出力
- グローバル `modalCount` が `open/close` で更新され、`body.modal-open` クラス制御を行う。【F:index.html†L1727-L1740】
- JSON/TXT のファイル選択結果は `window.handleTxtImport`, `window.handleJsonImport` 等既存関数から取り扱われる（React 移行時に Hook 化する）。

## 3. React 移行後の仕様
- `StartWizardDialogProps`:
  ```ts
  interface StartWizardDialogProps {
    onSelectTxt(file: File): void;
    onSelectJson(file: File): void;
    onCreateNew(): void;
    onDismiss(): void;
  }
  ```
- UI:
  - `grid grid-cols-1 sm:grid-cols-3 gap-4` で 3 枚のカードを並べ、カードは `button` + `aria-describedby` で説明文を持つ。
  - Tailwind の `sr-only` ラベルでファイル入力を隠し、`useHiddenFileInput` Hook で `accept` を制御する。
- 動作:
  - `onSelectTxt`/`onSelectJson` は `ModalProvider` 経由で渡すハンドラを通じ、アップロード成功後に `startDone` 相当の状態更新を実行。
  - `onDismiss` 時は `startDone` を呼ばず単にモーダルを閉じる。

## 4. 状態遷移とイベントフロー
1. FAB やメニューから `push({ component: StartWizardDialog })` → モーダル開く。
2. タイル選択時に Hidden File Input を起動し、ファイル確定で `onSelect*` を呼ぶ。
3. `onSelect*` が完了したら `ModalProvider.pop()` → `StartWizardDialog` が閉じる。
4. `onCreateNew` は React ストアへ `app.createNewGacha()` を dispatch し、`startDone` 相当の UI 切替を行う。

## 5. 必要な関数・メソッド
- `useStartWizard()` Hook: TXT/JSON の読み込みロジックとスプラッシュ解除をカプセル化。
- `appState.createNewGacha()` / `appState.importFromTxt()` / `appState.importFromJson()`：既存グローバル関数を React サービスとして再公開する。
- `useModal()` から `replace` を使ってガイドモーダルに遷移する補助（TXT 貼り付けを開始する場合）。

## 6. テスト観点
- TXT/JSON ボタン押下後にファイル選択キャンセルしてもモーダルが閉じないことを確認。
- スプラッシュロック中 (`body` に `splash-locked`) で `StartWizardDialog` を開き、`onCreateNew` でメイン UI が表示されることを検証。
- キーボード操作 (Tab/Enter/Escape) によるフォーカス移動と閉じる挙動を React Testing Library + user-event で確認。
