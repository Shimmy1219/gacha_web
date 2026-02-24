# 受け取りリンク `TOKEN_NOT_FOUND` 調査メモ (2026-02-24)

## 結論（先に要点）
- 提示ログの `TOKEN_NOT_FOUND` は、**Blob上のファイル有無ではなく、短縮トークン (`receive:token:{short}`) がKVに存在しない** ときに発生します。
- 「Blobにファイルが無いのに共有URLが発行されるか？」は **Yes（理論上可能）** です。
  - 理由: `/api/receive/token` は `url` の**ホスト許可のみ**を確認し、Blob実在確認（HEAD/GET）をしていないため。
- ただし通常UIフロー（`useBlobUpload`）では、`put` 成功後に `/api/receive/token` を呼ぶ実装なので、**通常操作では起きにくい**です。

## 事象ログの意味
提示ログ:
- `GET /api/receive/resolve?t=5RioOBx7pP`
- `404 TOKEN_NOT_FOUND`

この404は `apps/web/api/_lib/receiveToken.js` の以下分岐でのみ返ります。
- `SHORT_TOKEN_PATTERN` に一致する10桁トークンを `kv.get(receive:token:{short})` で引く
- `kv.get` が null の場合に `TOKEN_NOT_FOUND` を返却

つまり、以下のいずれかです。
1. 期限切れでKVキーが自然失効した
2. KVデータ消失/環境違い（別KV）
3. そもそも未発行または誤入力トークン

## コード経路の整理

### 1) 通常フロー（Blobありで発行）
1. `/api/blob/upload` でアップロード許可トークン発行
2. クライアントが `@vercel/blob/client` の `put` 実行
3. 成功時のみ `downloadUrl` を使って `/api/receive/token` 実行
4. `shareUrl (/receive?t=...)` 返却

根拠:
- `apps/web/src/features/save/useBlobUpload.ts`
  - `put(...)` 成功後にのみ `issueReceiveShareUrl(...)` を呼ぶ

### 2) Blob未配置でも共有URLを発行できる経路（理論上）
- `/api/receive/token` は `urlHostAllowed` でホストを許可するだけで、実ファイル存在チェックをしません。
- そのため、許可ドメイン配下の存在しないURLを直接POSTすると、短縮トークンと共有URLは発行され得ます。

根拠:
- `apps/web/api/receive/token.js`
  - `normalizeDownloadUrl(url)`
  - `urlHostAllowed(normalizedUrl)`
  - `storeShortToken(...)`
  - ここに Blob existence check がない

### 3) 発行後にBlobが消える経路
- `/api/receive/delete` は Blob削除のみ行い、短縮トークンKVは削除しません。
- そのため、共有URLはしばらく有効でも、実体Blobが404になる状態が発生し得ます。

根拠:
- `apps/web/api/receive/delete.js`
  - `del(url, { token: blobToken })` のみ
  - `receive:token:{short}` の削除処理なし

## 運用ログ実測（Vercel Runtime Logs）
対象: production / `shimmy3.com` / 直近7日

- `/api/blob/upload`: 12件（全200）
- `/api/receive/token`: 12件（全200）
- `/api/receive/resolve`: 49件（200/304/404混在、404は13件）

観察:
- 発行件数（12）より resolve が多く、404が散発。
- `TOKEN_NOT_FOUND` は「定期的に少数発生」で、発行失敗の連鎖というより **古い/無効トークンアクセス** の特徴に近い。

## `TOKEN_NOT_FOUND` が増える設計上の要因
- 短縮トークンKVのTTLは `exp` と同時に消えるため、期限後は `EXPIRED(410)` ではなく `TOKEN_NOT_FOUND(404)` になりやすい。
- 共有URLの再利用導線（保存済みリンクの再コピー、外部チャット履歴の古いリンク）で、期限後アクセスが継続し得る。

## 改善案（優先度順）

### 高優先
1. `/api/receive/token` で Blob実在チェックを追加
- `HEAD`（必要なら `GET` フォールバック）で2xx確認後のみ発行
- タイムアウト短め（例: 3秒）

2. `TOKEN_NOT_FOUND` の可観測性向上
- 404時に `ua`, `referer`, `ipHash`, `tokenPrefix` を構造化ログに追加
- bot/人間/アプリ内ブラウザを区別可能にする

3. 期限判定UXを改善
- 短縮キーTTLを `exp + grace` にするか、短縮キー値に `exp` を持たせる
- 期限後は `410 EXPIRED` を返しやすくする

### 中優先
4. `/api/receive/delete` で短縮トークンも無効化
- 削除時に `t` が短縮形式なら `receive:token:{t}` を削除
- 「URLは有効だがBlobなし」の状態を減らす

5. `/api/receive/token` への追加制限
- セッション必須化、または署名付き内部呼び出しヘッダを導入
- 任意URL発行の濫用余地を下げる

## 参考コード
- `apps/web/api/_lib/receiveToken.js`
- `apps/web/api/receive/token.js`
- `apps/web/api/receive/resolve.js`
- `apps/web/api/receive/delete.js`
- `apps/web/src/features/save/useBlobUpload.ts`
