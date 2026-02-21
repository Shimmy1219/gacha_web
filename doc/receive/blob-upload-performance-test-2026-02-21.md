# Blobアップロード速度テスト（テストユーザー）2026-02-21

## 対象
- 実施日: 2026-02-21
- 対象URL: `https://stg.shimmy3.com/gacha`
- 対象ユーザー: `テストユーザー`
- 操作: ユーザーごとの獲得内訳 → テストユーザー → `保存` → 保存オプション

## 実施内容
1. `zipファイルをアップロード` を実行し、ZIPサイズとBlobアップロード速度を計測。
2. 続けて `Discordで共有` を実行し、Blobアップロード（再実行分）とDiscord API速度を計測。
3. `chrome-devtools-mcp` の Network/Performance 情報で計測。

## 計測結果（1回目: zipファイルをアップロード）
- 生成ZIP: `テストユーザー202602212204-94b8f98d487df61c088ce158.zip`
- ZIPサイズ: `72,112,054 bytes`（`68.77 MiB`）
  - 内訳: `8,388,608 bytes x 8 part + 5,003,190 bytes x 1 part`
- Multipart: 実施（`x-mpu-action=create/upload/complete`, `x-mpu-part-number=1..9`）
- Blob転送時間（mpu開始〜完了レスポンス）: `16,369.3 ms`
- Blob実効速度: `4.201 MiB/s`（`35.24 Mbps`）
- 関連API:
  - `/api/blob/upload`: `1,705.5 ms`
  - `/api/receive/token`: `1,781.2 ms`

## 計測結果（2回目: Discordで共有）
- 生成ZIP: `テストユーザー202602212205-5250e28e08c6aadfe5975131.zip`
- ZIPサイズ: `72,112,053 bytes`（`68.77 MiB`）
  - 内訳: `8,388,608 bytes x 8 part + 5,003,189 bytes x 1 part`
- Multipart: 実施（`x-mpu-action=create/upload/complete`, `x-mpu-part-number=1..9`）
- Blob転送時間（mpu開始〜完了レスポンス）: `15,645.4 ms`
- Blob実効速度: `4.396 MiB/s`（`36.87 Mbps`）
- Discord API:
  - `/api/discord/find-channels`: `2,963.1 ms`
  - `/api/discord/send`: `1,910.7 ms`
  - Discord API合計（find + send）: `4,873.8 ms`

## 判定（妥当性）
- Blobアップロードは約 `35〜37 Mbps` の実効スループットで、`68.77 MiB` を `15〜16秒` で転送している。
- このスループット自体は「極端に遅い」とは言い切れないが、UX上は待ち時間が長く感じやすい。
- 体感遅延の主因は、`Discordで共有` 実行時に **ZIP再生成 + Blob再アップロード** が毎回走る点。
  - 2回目のDiscord共有でも新しいZIPを再アップロードしてからDiscord送信していた。

## multipart確認
- 「multipartが試せるか」の観点では、現状実装で既にmultipartアップロードが有効。
- 9パート構成で並列アップロードされていることを確認。

## 速度向上の検討
1. `Discordで共有` 時は、直前に発行済みの有効な `shareUrl` があれば再アップロードをスキップして再利用する。
2. `shareUrl` の有効期限内はユーザー単位で再利用し、期限切れ時のみ再アップロードする。
3. `/api/discord/find-channels` の結果（channel_id）をユーザー単位でキャッシュし、毎回の探索コストを削減する。
4. 計測の常設化（ZIP生成時間・Blob転送時間・Discord API時間を分離してログ化）し、改善効果を継続比較できるようにする。

## 補足
- 今回のDiscord送信は最終的に `POST /api/discord/send` が `200` で完了し、`message_id` を返却。
- 共有リンク発行も `shareUrl` 取得まで成功。
