# アイテム削除確認モーダル (ItemDeleteConfirmDialog) 仕様書

## 1. 概要
- ガチャ内の特定アイテムを削除する際の確認モーダル。ユーザー履歴やカタログからの削除影響を通知する。【F:index.html†L452-L467】【F:index.html†L1258-L1324】

## 2. 現行実装
### 2.1 DOM
- `#itemDeleteModal` は対象タグ `#idelTarget`、警告テキスト `#idelWarn`、キャンセル/削除ボタンで構成される。【F:index.html†L452-L467】

### 2.2 スクリプト
- `openItemDeleteConfirm(it)` が `pendingDeleteItem` を設定し、対象を表示。`countUsersWithItem` で所有ユーザー数を計算し、警告の表示/非表示を制御する。【F:index.html†L1266-L1283】
- `#idelCancel` は `pendingDeleteItem` をクリアし、モーダルを閉じる。【F:index.html†L1285-L1288】
- `#idelConfirm` は対象アイテムをカタログ・ユーザー履歴・獲得数から削除し、再描画と保存を行う。【F:index.html†L1290-L1338】

## 3. React 移行後仕様
### 3.1 コンポーネント API
```ts
interface ItemDeleteConfirmDialogProps {
  gachaId: GachaId;
  rarityId: RarityId;
  itemId: ItemId;
  itemCode: string;
  affectedUsers: number;
  onConfirm(payload: { gachaId: GachaId; rarityId: RarityId; itemId: ItemId; itemCode: string }): Promise<void> | void;
  onDismiss(): void;
}
```
- `itemId` は CatalogStore の不変キー（`itm-xxxxxxxxxx` 形式）。`itemCode` は旧 UI 互換のために保持するが、削除ロジックは `itemId` を正とする。
- `useItemDeletion(itemId)` Hook が `affectedUsers`, `isDeleting`, `error` を返す。

### 3.2 UI
- 警告メッセージを `Alert` コンポーネントとして表示し、`affectedUsers > 0` の場合は強調色（`bg-error/10`）。
- ボタンレイアウトは `flex justify-end gap-3`、削除ボタンは Danger。
- ローディング中は削除ボタンにスピナーを表示し、複数クリックを防止する。

### 3.3 挙動
- `onConfirm` は以下の処理をまとめて行う:
  1. `imageService.clear` と `skipDel` 相当の処理で関連画像/リアグ状態をクリア。【F:index.html†L1302-L1314】
  2. `catalogService.removeItem` で `itemId`（`itm-xxxxxxxxxx` 形式）をキーにカタログから該当アイテムを削除し、互換用途で `itemCode` も連動削除。【F:index.html†L1296-L1300】
  3. `userHistoryService.removeItem` で全ユーザーの履歴と獲得数から削除（`itemId` を主キーにし、旧 `itemCode` はフォールバックに利用）。【F:index.html†L1302-L1334】
  4. AppState を保存 (`saveAppStateDebounced`) し、UI を再描画。【F:index.html†L1335-L1338】
- 成功後に `ModalProvider.pop()`、`useToast` で削除完了通知。

## 4. サービス/メソッド要件
- `itemService.deleteItem(it)`：カタログ・履歴・画像をまとめて削除するサービス層 API。
- `userHistoryService.countUsersWithItem`：事前に影響ユーザー数を算出するユーティリティ。
- `useModal` から `pop()` を呼び、削除後に親モーダルや呼び出し元カードへフォーカスを返す。

## 5. テスト観点
- `affectedUsers` が 0 の場合に警告が非表示になること。
- `onConfirm` の副作用（画像クリア・ユーザーデータ更新・保存）が順番どおり呼ばれることをユニットテスト。
- キャンセル時に `pendingDeleteItem` がクリアされることを確認。
