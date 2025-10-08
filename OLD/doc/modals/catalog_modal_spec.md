# Catalog Modal（削除対象）仕様書

## 1. 現状概要
- `#catalogModal` はカタログテキストを貼り付けてガチャとアイテム一覧を初期登録するためのモーダル。【F:index.html†L328-L344】
- 現在は UI 上の導線が撤去されており、利用頻度がゼロであるため React 移行後は廃止する。

## 2. DOM とスクリプト
- DOM にはガチャ名入力、テキストエリア、`#catParse` / `#catClose` ボタンが含まれる。【F:index.html†L334-L341】
- `#catParse` クリック時に `parseCatalogText` を使用して `gCatalogByGacha` を再構築し、`renderTabs()` などを呼び出す。【F:index.html†L1812-L1827】
- パース成功後は `startDone()` → `close(catalogModal)` → `open(guideModal)` を実行し、ガイドモーダルを表示する。【F:index.html†L1826-L1829】
- DOMContentLoaded フックで `#catClose` の閉じるイベントがバインドされている。【F:index.html†L1751-L1756】

## 3. React 移行方針
- React 版ではモーダルとしては廃止し、インポートフローは専用ページ/ウィザードへ移行する。
- `CatalogImportDialog` コンポーネントは作成せず、既存の `parseCatalogText` 等を `features/importers/services/catalog.ts` へ移管する。
- `ModalProvider` のスタックからも対象を削除し、`useModal` から参照されないようにする。

## 4. 撤去ステップ
1. React 化のタイミングで `CatalogImportDialog` を実装しないことを仕様として明記する。
2. `index.html` の `#catalogModal` DOM と `catalogModal` 変数、`#catParse` ハンドラを削除する。【F:index.html†L328-L341】【F:index.html†L1723-L1756】
3. `parseCatalogText` / `parseCatalogModal` 関連ユーティリティをページ専用の React サービスへ移し、モーダル依存を排除する。
4. リリース前に Playwright テストで `#catalogModal` が存在しないことを確認し、旧 UI の遺残がないことを担保する。

## 5. テスト・確認事項
- Jest/Vitest で `parseCatalogText` の単体テストを維持し、モーダル撤去後もロジックが有効であることを検証する。
- Start フロー（TXT/JSON 読込・新規作成）がカタログモーダルなしでも完結することを E2E で確認する。
- ガイドモーダル表示が他のフローから引き続き呼び出せることを確認し、導線欠落を防ぐ。
