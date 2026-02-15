# SR 4 がネップリではなくアイコンリング判定になる件の調査 (2026-02-15)

## 対象
- URL: `https://stg.shimmy3.com/receive?t=KG1rjusJyD`
- 事象: 受け取り画面で `SR / 4` が `ネップリ` ではなく `アイコンリング` 表示になる

## 再現結果
- PlaywrightでURLへアクセスし、`受け取る` ボタンを押下。
- 受け取り後の一覧で `SR / 4` のデジタル種別が `アイコンリング` 表示になることを確認。

## 調査結果
1. 受け取ったZIP (`202602151555.zip`) の `meta/items.json` には、全23件で `digitalItemType` キーが存在しない。
2. 受け取り画面は `loadReceiveZipInventory(..., { migrateDigitalItemTypes: true })` を呼び、`digitalItemType` が欠落している場合に推定を実行する。
3. 推定処理は `receiveZip.ts` 内で `inferDigitalItemTypeFromBlob` を呼ぶ実装になっている。
4. 判定ロジックでは、`nepuri` は主に `7:5` または `5:7` の比率を対象にしており、正方形 (`1:1`) かつPNG/WebP/GIFは `icon-ring` になる。
5. 問題の `SR / 4` 実ファイル `items/バナイベ闇ガチャ/4_2.png` は `1920 x 1920` の正方形PNGのため、ロジック上 `icon-ring` に分類される。

## 根本原因
- この受け取りZIPでは `digitalItemType` がメタデータに保存されておらず、受け取り時に画像比率ベース推定へフォールバックしている。
- `SR / 4` の実アセットが正方形PNGであるため、推定仕様通り `icon-ring` 判定になる。

## 影響
- `digitalItemType` 欠落ZIPでは、手動設定した景品種別（例: ネップリ）が受け取り画面で再現されない可能性がある。
- 特に正方形PNGは `icon-ring` に寄りやすく、誤表示や不要な「装着」ボタン表示を誘発する。

## 対応方針案
1. ZIP生成側で `meta/items.json` に `digitalItemType` を必ず出力する（最優先）。
2. 受け取り側の推定はあくまで最終フォールバックとし、欠落時でも他メタ情報から復元できる経路があれば優先する。
3. 必要なら推定ロジックに補助情報（明示ラベル、エクスポート時ヒント）を持たせる。
