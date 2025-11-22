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
  itemId: ItemId; // itm-xxxxxxxxxx 形式の不変 ID
  initial: PrizeSettingsInitialState;
  onSave(itemId: ItemId, input: PrizeSettingsInput): Promise<void> | void;
  onOpenRiagu(itemId: ItemId): void;
  onRequestClose(): void;
}

interface PrizeSettingsInitialState {
  name: string;
  rarityId: RarityId;
  gachaId: GachaId;
  gachaDisplayName: string;
  previewUrl?: string;
  pickup: boolean;
  completeTarget: boolean;
}

interface PrizeSettingsInput {
  name: string;
  rarityId: RarityId;
  file?: File;
  pickup: boolean;
  completeTarget: boolean;
}
```
- Props の `itemId` は CatalogStore の `ItemCardModel.itemId` に一致し、React 側での唯一キーとして利用する。【F:doc/item_component_plan.md†L14-L43】
- `usePrizeSettings(itemId)` Hook でフォーム状態とプレビュー URL、タグ状態を提供する。【F:doc/modal_component_plan.md†L87-L91】

### 3.2 UI レイアウト
- ヘッダー: タイトル「景品設定」と対象タグ (`Badge` で `gachaDisplayName / rarityId`) を表示し、サブテキストで `itemId` を確認できるようにする。
- ボディ: `grid gap-6 lg:grid-cols-[minmax(0,1fr),minmax(0,1fr)]` で左にプレビュー、右にファイル/操作ボックスを配置。【F:doc/modal_component_plan.md†L88-L90】
  - 左: `AspectRatio` コンポーネントでサムネイル表示、下に状態ラベルと `imageAsset.hasImage` に応じたステータスメッセージを表示。
  - 右: `TextField` (景品名), `RaritySelect` (レアリティ), `FileDropZone` + `Button` でファイル選択、`Switch` コンポーネントで「ピックアップ対象」「コンプリートガチャ対象」を並べる。URL 入力は廃止する。【F:doc/modal_component_plan.md†L90-L91】
  - `OpenRiaguDialogButton` を右列のアクション群に配置し、クリックでリアグ設定モーダルを開く。リアグ遷移時も `itemId` を引き渡す。
- フッター: 左に `リアグ設定を開く`（セカンダリボタン）、右に `閉じる`（トーナリー）と `保存`（プライマリ）を `flex justify-between lg:justify-end lg:gap-3` で配置。閉じるボタンで未保存確認ダイアログを表示する。【F:doc/modal_component_plan.md†L91-L91】

### 3.3 振る舞い
- 保存実行時:
  1. CatalogStore の `updateItemCard(itemId, patch)` で `name`・`rarityId`・`pickupTarget`・`completeTarget` を更新。レアリティ変更時は `CatalogStore.moveItemToRarity(itemId, rarityId)` を併用する。【F:doc/item_component_plan.md†L29-L39】
  2. 画像ファイルがあれば `imageService.putBlob(itemId, file)` へアップロードし、結果の `assetHash`・`thumbnailUrl` を `updateItemAsset(itemId, patch)` で反映する。【F:index.html†L1435-L1496】【F:doc/item_component_plan.md†L33-L36】
  3. トグル状態を `CatalogStore.togglePickupTarget` / `toggleCompleteTarget` 相当のアクションで保存し、必要に応じて `prizeTagService` へ永続化する。
  4. `onSave(itemId, input)` を await し、成功後に `ModalProvider.pop()` でモーダルを閉じる。エラー発生時は `state.error` に格納してフッターにアラートを表示。
- 閉じる操作: 変更が検知された場合は `ConfirmDiscardDialog` を `ModalProvider.push` で表示し、「景品設定に戻る」「閉じる」選択肢を提示する。【F:doc/modal_component_plan.md†L91-L91】
- リアグボタン: `onOpenRiagu(itemId)` で `RiaguConfigDialog` を別モーダルとして開き、閉じた後も `PrizeSettingsDialog` の状態が維持されるよう `ModalStack` を利用する。

## 4. 状態管理
- `PrizeSettingsState`:
  ```ts
interface PrizeSettingsState {
  name: string;
  rarityId: RarityId;
  pickup: boolean;
  completeTarget: boolean;
  file?: File;
  previewUrl?: string;
  isDirty: boolean;
  isSaving: boolean;
  error?: string;
}
  ```
- `usePrizeSettings(itemId)` は `useReducer` で `SET_FIELD`, `SET_FILE`, `RESET`, `SET_ERROR`, `SET_PREVIEW` を扱い、`useEffect` で `file` の `ObjectURL` を開放する。初期化時に CatalogStore から `ItemCardModel` を取得し、`itemId` の更新イベントを購読する。
- ピックアップ/コンプリート情報は CatalogStore からの selector (`useItemFlags(itemId)`) を合成し、トグル時に `dispatch({ type: 'SET_FIELD', ... })` でローカル状態を更新。
## 5. サービス/メソッド要件
- `CatalogStore`：`updateItemCard`, `moveItemToRarity`, `togglePickupTarget`, `toggleCompleteTarget`, `updateItemAsset` を Promise ベースで提供し、`itemId` を唯一キーにする。【F:doc/item_component_plan.md†L24-L39】
- `imageService`：既存の `putBlob`, `renameKey`, `clear` を `itemId` 受け取りの API へ更新する。【F:index.html†L1435-L1496】
- `prizeTagService`（新規）：ピックアップ/コンプリート種別を `itemId` で永続化する API (`get`, `set`, `clear`) を提供する。
- `useConfirmDiscard` Hook：変更検知時の破棄確認モーダルを開くユーティリティ。

## 6. テスト観点
- 変更がない状態で閉じると確認ダイアログが表示されないこと、変更後はダイアログが表示されること。
- `onSave` が `updateItemCard` → `moveItemToRarity`（必要時）→ `imageService.putBlob` → `prizeTagService.set` の順で呼ばれることをモックで検証。
- ファイル選択後に別ファイルへ差し替えた場合、古い `ObjectURL` が破棄されること。
- リアグボタン押下で `RiaguConfigDialog` が開き、戻った後に `PrizeSettingsDialog` の状態が維持されること。
