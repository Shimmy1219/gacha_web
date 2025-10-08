# ガチャ削除確認モーダル (GachaDeleteConfirmDialog) 仕様書

## 1. 概要
- 選択中のガチャを完全に削除する前にユーザーへ確認を求めるモーダル。ユーザー集計や画像・リアグ情報も削除されることを通知する。【F:index.html†L439-L448】【F:index.html†L1188-L1256】

## 2. 現行実装
### 2.1 DOM
- `#deleteModal` はタイトル、対象タグ `#delTarget`、説明文、キャンセル/削除ボタンで構成される。【F:index.html†L439-L448】

### 2.2 スクリプト
- `openDeleteConfirm(gachaId)` が `pendingDeleteGacha` を設定し、表示名を取得してタグへ表示した後 `open(deleteModal)` を呼び出す。【F:index.html†L1198-L1214】
- `#delCancel` は `pendingDeleteGacha` をクリアしてモーダルを閉じる。【F:index.html†L1216-L1217】
- `#delConfirm` は AppState からガチャ削除、画像/リアグ/レアリティの掃除、再描画を行う。【F:index.html†L1219-L1256】

## 3. React 移行後仕様
### 3.1 コンポーネント API
```ts
interface GachaDeleteConfirmDialogProps {
  gachaId: GachaId;
  gachaName: string;
  onConfirm(gachaId: GachaId): Promise<void> | void;
  onDismiss(): void;
}
```
- `useGachaDeletion(gachaId)` Hook が表示名・関連リソース数・進行状態を返す。

### 3.2 UI
- 説明文に削除影響（ユーザー集計・画像・リアグ・レアリティ）を箇条書きで表示。
- ボタンレイアウトは `flex justify-end gap-3` で `キャンセル`（Ghost）と `削除`（Danger）。
- 削除時にスピナーを表示し、完了までボタンを無効化する。

### 3.3 挙動
- `onConfirm` 実行時に `gachaService.delete(gachaId)`（`gch-xxxxxxxxxx` 形式）を呼び、以下の処理をまとめる:
  1. AppState のガチャデータ、ユーザー履歴、カタログを削除。【F:index.html†L1224-L1231】
  2. 画像サービスで該当キーの Blob を削除し、リアグサービス・レアリティサービスを同期。【F:index.html†L1233-L1247】
  3. UI の再描画 (`renderTabs`, `renderItemGrid`, `renderUsersList`, `renderRiaguPanel`) をトリガする。【F:index.html†L1249-L1256】
- 成功後は `ModalProvider.pop()` を呼び、`useToast` で完了通知を表示。

## 4. サービス/メソッド要件
- `gachaService.delete(gachaId)`：AppState, counts, catalogs の削除を担うメソッド。
- `imageService.clearByPrefix`, `riaguService.pruneByCatalog`, `rarityService.deleteGacha` をラップしてまとめて実行する関数。
- `useModal` から `dismissAll()` を呼び、ガチャ削除時に関連モーダル（景品設定など）が開いていたら閉じる。

## 5. テスト観点
- 削除確認ダイアログが正しいガチャ名を表示するかスナップショットを作成。
- `onConfirm` がエラーを返した場合でもモーダルが閉じず、エラーメッセージを表示すること。
- 成功後に `renderTabs` 等が呼ばれ、UI から対象ガチャが消えることを E2E で確認。
