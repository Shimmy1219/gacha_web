# 景品設定モーダル (PrizeSettingsDialog) 仕様書

## 1. 概要
- 旧「画像を設定」モーダルをリネームし、景品名・レアリティ・プレビュー・ファイル選択・運用タグ（ピックアップ/コンプリート対象）を一括管理するモーダル。
- ItemCard から呼び出され、リアグ設定モーダルへの遷移ボタンも内包する。【F:index.html†L374-L415】【F:index.html†L880-L918】

## 2. 現行実装の構造
### 2.1 DOM
- `#imageModal` には対象入力、レアリティセレクト、プレビュー枠、ファイル選択、URL 入力、保存/閉じるボタンが存在する。【F:index.html†L374-L411】
- プレビューは `#modalPreview`, 状態ラベルは `#modalStatus`、保存ボタンは `#applyBtn`、閉じるボタンは `#closeBtn` で定義されている。【F:index.html†L390-L411】

### 2.2 関連スクリプト
- `openImageModal(it)` が現在のアイテム情報を読み込み、プレビューとフォームを初期化する。【F:index.html†L1341-L1408】
- `#fileInput` / `#urlInput` の変更でプレビューを更新し、`#applyBtn` が `images.putBlob` などの保存処理を行う。【F:index.html†L1411-L1563】
- 保存後に `renderItemGrid`, `renderUsersList`, `renderRiaguPanel` を再描画し、`closeImageModal()` がモーダルを閉じる。【F:index.html†L1507-L1563】
- ItemCard の「画像設定」ボタンから呼び出され、`hasImage` に応じて解除/設定を切り替える。【F:index.html†L883-L913】
- 現状はリアグ設定ボタンが ItemCard 側にあり、モーダル内には存在しない。【F:index.html†L889-L917】

## 3. React 移行後仕様
### 3.1 コンポーネント API
```ts
interface PrizeSettingsDialogProps {
  gachaId: string;
  rarityId: string;
  itemCode: string;
  initialName: string;
  initialPreviewUrl?: string;
  initialPickup: boolean;
  initialCompleteTarget: boolean;
  onSave(input: PrizeSettingsInput): Promise<void> | void;
  onOpenRiagu(): void;
  onDismiss(): void;
}

interface PrizeSettingsInput {
  name: string;
  rarityId: string;
  file?: File;
  pickup: boolean;
  completeTarget: boolean;
}
```
- `usePrizeSettings(gachaId, rarityId, itemCode)` Hook でフォーム状態とプレビュー URL、既存タグ状態を提供する。【F:doc/modal_component_plan.md†L87-L91】

### 3.2 UI レイアウト
- ヘッダー: タイトル「景品設定」と対象タグ (`Badge` で `gachaName / rarity:code`) を表示。
- ボディ: `grid gap-6 lg:grid-cols-[minmax(0,1fr),minmax(0,1fr)]` で左にプレビュー、右にファイル/操作ボックスを配置。【F:doc/modal_component_plan.md†L88-L90】
  - 左: `AspectRatio` コンポーネントでサムネイル表示、下に状態ラベルと「現在の画像」情報。
  - 右: `FileDropZone` + `Button` でファイル選択、`Switch` コンポーネントで「ピックアップ対象」「コンプリートガチャ対象」を並べる。URL 入力は廃止する。【F:doc/modal_component_plan.md†L90-L91】
  - `OpenRiaguDialogButton` を右列のアクション群に配置し、クリックでリアグ設定モーダルを開く。
- フッター: `保存`, `リアグ設定を開く`, `閉じる` の 3 ボタンを `flex justify-between` で配置し、閉じるボタンで未保存確認ダイアログを表示する。【F:doc/modal_component_plan.md†L91-L91】

### 3.3 振る舞い
- 保存実行時:
  1. 名前・レアリティの変更を `appState.renameItemCode` / `appState.moveItemRarity` 相当のサービスで処理する。【F:index.html†L1435-L1496】
  2. 画像ファイルがあれば `imageService.putBlob` へアップロードし、なければ既存プレビューを維持。
  3. トグル状態を `itemTagService.setPickup/clearPickup`, `itemTagService.setComplete` など新設メソッドで保存する。
  4. `onSave` 完了後に関連ストア (`ImageAssetStore`, `PrizeTagStore`) を更新し、`ModalProvider.pop()` でモーダルを閉じる。
- 閉じる操作: 変更が検知された場合は `ConfirmDiscardDialog` を `ModalProvider.push` で表示し、「景品設定に戻る」「閉じる」選択肢を提示する。【F:doc/modal_component_plan.md†L91-L91】
- リアグボタン: `onOpenRiagu` で `RiaguConfigDialog` を別モーダルとして開き、閉じた後も景品設定モーダルはスタックに残す。

## 4. 状態管理
- `PrizeSettingsState`:
  ```ts
  interface PrizeSettingsState {
    name: string;
    rarityId: string;
    pickup: boolean;
    completeTarget: boolean;
    file?: File;
    previewUrl?: string;
    isDirty: boolean;
    isSaving: boolean;
    error?: string;
  }
  ```
- `usePrizeSettings` は `useReducer` で `SET_FIELD`, `SET_FILE`, `RESET`, `SET_ERROR` を扱い、`useEffect` で `file` を開放（`URL.revokeObjectURL`）。
- ピックアップ/コンプリート情報は `itemMetaService.getTags(key)` から取得し、`onSave` で更新する。

## 5. サービス/メソッド要件
- `imageService`：既存の `putBlob`, `renameKey`, `clear` を Promise ベースで提供する。【F:index.html†L1435-L1496】
- `appState`：`renameItemCode`, `moveItemRarity`, `saveDebounced` を React ストアへ移行する。【F:index.html†L1435-L1512】
- `prizeTagService`（新規）：ピックアップ/コンプリート種別を永続化する API (`get`, `set`, `clear`) を提供。
- `useConfirmDiscard` Hook：変更検知時の破棄確認モーダルを開くユーティリティ。

## 6. テスト観点
- 変更がない状態で閉じると確認ダイアログが表示されないこと、変更後はダイアログが表示されること。
- `onSave` が名前変更→レアリティ移動→画像保存→タグ保存の順で呼ばれることをモックで検証。
- ファイル選択後に別ファイルへ差し替えた場合、古い `ObjectURL` が破棄されること。
- リアグボタン押下で `RiaguConfigDialog` が開き、戻った後に `PrizeSettingsDialog` の状態が維持されること。
