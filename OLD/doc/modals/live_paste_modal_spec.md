# Live Paste Modal (LivePasteDialog) 仕様書

## 1. 概要
- リアルタイム配信などで取得した結果テキストを貼り付け、ユーザー集計へ反映するモーダル。
- React 版では `LivePasteDialog` として `textarea`・反映ボタン・閉じるボタンを持ち、入力解析結果をストアへディスパッチする。

## 2. 現行実装
### 2.1 DOM 構造
- `#liveModal` には説明テキスト、`#liveText` テキストエリア、`#liveApply`（反映）・`#liveClose`（閉じる）ボタンを配置。【F:index.html†L360-L371】

### 2.2 関連スクリプト
- `#openLivePaste` ボタンから `open(liveModal)`、`#liveClose` で `close(liveModal)` を呼ぶ。【F:index.html†L1755-L1757】
- `#liveApply` クリック時に入力を `splitLiveBlocks` → `parseLiveBlock` で解析し、ユーザーごとの `delta` を構築後 `mergeIntoGData` 等を呼び出す。【F:index.html†L1824-L1876】
- 貼り付け成功後は `close(liveModal)`→`startDone()`→各 UI 再描画関数を実行する。【F:index.html†L1877-L1893】

### 2.3 状態・入出力
- 入力テキストは `textarea` の値を直接取得し、解析結果から `gData`, `gHitCounts`, `gCatalogByGacha` を更新する。【F:index.html†L1850-L1874】
- 解析失敗時は `alert` でエラーメッセージを表示し、モーダルは開いたまま。

## 3. React 移行後仕様
- `LivePasteDialogProps`:
  ```ts
  interface LivePasteDialogProps {
    defaultText?: string;
    onSubmit(blocks: string): Promise<void> | void;
    onDismiss(): void;
  }
  ```
- UI:
  - `Textarea` コンポーネント（`autosize` オプション付き）を使用し、`min-h-[220px]` とモノスペースフォントを適用。
  - エラー表示は `Alert` コンポーネントで `parseLiveInput` の結果を表示。
- 動作:
  - `onSubmit` は `parseLiveBlocks` Hook を経由し、React ストアの `importLiveResult(delta)` を呼ぶ。
  - 成功時は `ModalProvider.pop()`、失敗時はエラーをステートに保持して入力は保持する。

## 4. 状態遷移
1. `useModal().push(LivePasteDialog)` で表示。
2. ユーザーがテキストを入力して「反映」を押す → バリデーション。空なら警告。
3. 解析成功で `onSubmit` が `appState.applyLiveDelta(delta)` を実行し、`useToast` で完了通知を表示。
4. モーダルを閉じるときに `onDismiss` → `ModalProvider.pop()`、必要なら `confirm` で未保存テキスト破棄確認を出す。

## 5. 必要なモジュール
- `useLiveParser()` Hook：`splitLiveBlocks`, `parseLiveBlock`, `mergeIntoGacha` を React 化し、成功時の副作用をまとめる。【F:index.html†L1824-L1893】
- `appState.mergeLiveDelta(delta)`：既存の `mergeIntoGData`, `incCount` などをサービス層に再配置。

## 6. テスト観点
- 空テキストで警告が出て `onSubmit` が呼ばれないこと。
- 正常入力時に `appState.mergeLiveDelta` が期待どおり呼ばれ、`ModalProvider` のスタックが 1 減ること。
- 長文貼り付け時のパフォーマンスとスクロール挙動を Storybook で検証する。
