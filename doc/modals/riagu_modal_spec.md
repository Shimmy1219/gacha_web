# リアグ設定モーダル (RiaguConfigDialog) 仕様書

## 1. 概要
- 景品ごとのリアルグッズ情報（原価・タイプ）を設定し、リアグ対象フラグを付与するモーダル。
- React 版では景品設定モーダルから遷移するサブモーダルとして動作し、リアグ解除を含むメタ管理を提供する。【F:index.html†L417-L435】【F:src/ui-riagu.js†L268-L336】

## 2. 現行実装
### 2.1 DOM
- `#riaguModal` はタイトル、対象表示タグ `#riaguTarget`、原価入力 `#riaguCost`、タイプ入力 `#riaguType`、保存/解除/閉じるボタンで構成される。【F:index.html†L417-L435】

### 2.2 スクリプト
- `openRiaguModal(it)` が対象の gachaId/rarity/code を正規化し、リアグメタを取得してフォームへ代入、`getModalOpen()` でモーダルを開く。【F:src/ui-riagu.js†L268-L311】
- `closeRiaguModal()` は `getModalClose()` を通じて閉じ、`currentRiaguTarget` を破棄する。【F:src/ui-riagu.js†L313-L318】
- `#riaguSave` はリアグメタを保存し、画像解除→リアグマーク→描画更新を行う。【F:src/ui-riagu.js†L322-L360】
- `#riaguUnset` はリアグメタを削除し、描画を更新する。【F:src/ui-riagu.js†L210-L240】
- ItemCard の「リアグ」ボタンからモーダルを開くよう結線されている。【F:index.html†L883-L918】

## 3. React 移行後仕様
### 3.1 コンポーネント API
```ts
interface RiaguConfigDialogProps {
  gachaId: GachaId;
  rarityId: RarityId;
  itemId: ItemId;
  itemCode: string;
  defaultCost?: number;
  defaultType?: string;
  onSave(input: { cost: number; type: string }): Promise<void> | void;
  onUnset(): Promise<void> | void;
  onDismiss(): void;
}
```
- `itemId` は `RiaguStore.indexByItemId` の参照キーとなる `itm-xxxxxxxxxx` 形式。`itemCode` は旧 CSV/JSON 互換のために渡す。
- `useRiaguConfig(gachaId, rarityId, itemId, itemCode)` Hook が `cost`, `type`, `isSaving`, `error` を返し、`submit`/`unset` メソッドを提供する。

### 3.2 UI
- Tailwind `max-w-lg` のモーダルパネルを使用し、フォームは `space-y-4` で配置。
- 原価入力は `NumberField` コンポーネントで千区切り表示、タイプ入力は `TextField`。
- フッターは `保存`（Primary）、`リアグ解除`（Ghost Danger）、`閉じる`（Ghost）ボタンを `flex justify-end gap-3` で配置。【F:index.html†L431-L435】

### 3.3 挙動
- `onSave` は `riaguService.mark({ gachaId, rarityId, itemId, itemCode }, { cost, type })` を呼び、成功後に `ModalProvider.pop()`。
- `onUnset` は `riaguService.unmark`（`itemId` ベース）と `imageService.tryRemoveSkip` を呼び、景品設定モーダルへ制御を戻す。
- 閉じる操作は単に `pop()` し、必要に応じて親モーダルへフォーカスを戻すため `onDismiss` で `focusReturnRef` を使用する。

## 4. 状態管理
- `RiaguConfigState`:
  ```ts
  interface RiaguConfigState {
    cost: string;
    type: string;
    isSaving: boolean;
    error?: string;
  }
  ```
- コストはフォーム上では文字列で保持し、送信時に数値へ変換（`Math.max(0, parseInt(...))`）。【F:src/ui-riagu.js†L335-L356】
- リアグ解除時は `itemTagService` からリアグ関連タグを削除し、`PrizeSettingsDialog` 側の状態も同期させる。

## 5. サービス/メソッド要件
- `riaguService`：`mark`, `unmark`, `getMeta`, `pruneByCatalog` を Promise ベースで提供。【F:src/ui-riagu.js†L268-L360】
- `imageService`：リアグ解除時に画像 skip を外す `clearImage` 相当のメソッドを公開する。【F:index.html†L1509-L1524】
- `useModalStack`：サブモーダルから親モーダルへフォーカスを戻す `returnFocus()` をサポート。

## 6. テスト観点
- 保存時に `riaguService.mark` が正しい payload で呼ばれること、数値変換が行われることをユニットテストする。
- 解除ボタン押下で `riaguService.unmark` → `renderItemGrid` 相当の更新が走ることをモックで検証。
- 親モーダル（景品設定）が開いたままでもフォーカストラップが二重にならないことを Cypress/Playwright で確認。
