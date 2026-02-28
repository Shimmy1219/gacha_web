# データベース設計書（Upstash Redis KV）

本プロジェクトでは、セッション管理や共有リンク管理に Upstash Redis (REST API) を利用しています。ここでは、主要なキー構造・保存データ・TTL・利用箇所・課題を整理します。

## 使用テクノロジー
- **Upstash Redis (REST API)**
  - ライト/リード用トークンを環境変数 `KV_REST_API_TOKEN` または `KV_REST_API_READ_ONLY_TOKEN` で指定。
  - SDK: `@upstash/redis` を `apps/web/api/_lib/kv.js` でラップして使用。
  - すべてのAPIルートからHTTP経由でアクセス可能。

## キースキーマ一覧

| キー形式 | 役割 | 値の構造 | TTL | 主な操作関数 | 利用API |
| --- | --- | --- | --- | --- | --- |
| `sess:{sid}` | ログインセッション本体 | JSONオブジェクト（下記参照） | 30日 (`SESSION_TTL_SEC`) | `saveSession`, `getSession`, `touchSession`, `deleteSession` | `/api/auth/discord/callback`, `/api/discord/me`, `/api/auth/logout` |
| `user:{uid}:sessions` | ユーザーが保持する `sid` の集合 | Set（Upstash上では `SADD` / `SMEMBERS`） | 30日（セッション削除時にクリーンアップ） | `saveSession`, `deleteSession`, `deleteAllSessions` | `/api/auth/discord/callback`, `/api/auth/logout` |
| `discord:auth:{state}` | Discord OAuthの `state` と `code_verifier` | JSON `{ verifier, loginContext?, claimTokenDigest? }` | 10分 (`DISCORD_AUTH_TTL_SEC`) | `saveDiscordAuthState`, `getDiscordAuthState`, `consumeDiscordAuthState`, `deleteDiscordAuthState` | `/api/auth/discord/start`, `/api/auth/discord/callback` |
| `receive:token:{short}` | 共有リンクの短縮トークン→暗号化トークン | 文字列（AES-GCMで暗号化したトークン） | 共有リンクの期限まで（最大14日） | `storeShortToken`, Upstash `kv.get` | `/api/receive/token`, `/api/receive/resolve` |
| `receive:edge:index` | 期限切れ候補のソート済みセット（スコア=expires_at[ms]、メンバー=id） | ZSET | TTLなし（日次Cronでpop） | `kv.zadd`, `kv.zrange` | `/api/cron/receive-cleanup` |
| `receive:edge:meta:{id}` | `/api/receive/edge-resolve` 用メタデータ | JSON `{ id, blob_name|pathname, expires_at, short_token? }` | TTLなし（Cronで削除） | `kv.set`, `kv.get`, `kv.del` | `/api/receive/edge-resolve`, `/api/cron/receive-cleanup` |
| `lock:sess:{sid}` | セッション更新のための排他ロック | 文字列 `'1'` | 5秒 | `getSessionWithRefresh` | `/api/discord/me` などセッションを参照するAPI |

### `sess:{sid}` の詳細構造
```json
{
  "uid": "DiscordのユーザーID",
  "name": "ユーザー名",
  "avatar": "アバターID",
  "access_token": "Discordアクセストークン",
  "refresh_token": "Discordリフレッシュトークン",
  "scope": "付与スコープ",
  "token_type": "Bearer",
  "access_expires_at": 1700000000000,
  "created_at": 1690000000000,
  "last_seen_at": 1690000000000,
  "ver": 1
}
```
- `saveSession` 実行時に `user:{uid}:sessions` へ `sid` が追加され、クリーンアップ時に利用します。
- `getSessionWithRefresh` では `access_expires_at` を確認し、有効期限が近い場合に `refresh_token` を使ってDiscordの `/oauth2/token` エンドポイントから再発行を行います。

### `receive:token:{short}` の詳細構造
- 値は暗号化済みのロングトークン（`v1.{iv}.{ciphertext+tag}`）です。
- Upstashには暗号化トークン自体は保存されず、短縮トークンからロングトークンへ解決するマッピングのみ保存します。
- `storeShortToken` で5回まで再試行し、競合が無ければ `nx` オプションで登録されます。

### `receive:edge:index` / `receive:edge:meta:{id}` の詳細構造
- `receive:edge:index` は **ソート済みセット** で、メンバーに 10 桁 ID、スコアに `expires_at` のエポックミリ秒を保存します。日次 Cron が `zrange ... byScore` で期限切れ候補を取得します。
- `receive:edge:meta:{id}` は **JSON 文字列** で保存し、最低限以下のフィールドを持ちます。

```json
{
  "id": "ABC123DEFG",
  "blob_name": "user_prize/<ownerDiscordId>/<receiverDir>/<fileName>",
  "pathname": "user_prize/<ownerDiscordId>/<receiverDir>/<fileName>",
  "expires_at": "2024-12-31T15:00:00.000Z",
  "short_token": "s1AbCdEfGh" // 短縮トークンが発行されている場合のみ
}
```

- `blob_name` と `pathname` はどちらか一方があれば Cron で削除対象を特定できます。`short_token` がある場合は `receive:token:{short_token}` も同時に削除します。

## アクセスパターン
1. **セッション取得**
   - クッキーの `sid` をキーに `getSessionWithRefresh` → `getSession` → `kv.get('sess:{sid}')`。
   - 必要に応じてトークンをリフレッシュし `saveSession` で上書き保存。

2. **OAuth stateの検証**
   - `/api/auth/discord/start` で `state` と `code_verifier` を `saveDiscordAuthState` で保存。
   - `/api/auth/discord/callback` で `consumeDiscordAuthState` を使い一度のみ取得し、クッキーの欠損にも対応。

3. **共有リンクの短縮**
   - `/api/receive/token` で暗号化トークン生成後、`storeShortToken` により `receive:token:{short}` を保存。
   - `/api/receive/resolve` で `kv.get` を呼び、短縮トークンをロングトークンへ変換。

4. **期限切れ受け取りデータのクリーンアップ**
   - アップロード完了時に `receive:edge:meta:{id}` へメタデータを `kv.set` し、同時に `receive:edge:index` に `zadd score=expires_at` で登録する。
   - 日次 Cron `/api/cron/receive-cleanup` は `kv.zrange('receive:edge:index', 0, now, { byScore:true })` で候補を取得し、`@vercel/blob.del` で `blob_name`/`pathname` を削除した後、`kv.del(metaKey)` と `kv.del(shortTokenKey)` を行う。
   - 取得上限は `RECEIVE_CLEANUP_BATCH_LIMIT`（未設定時は100件）。`limit` クエリで手動テスト時に調整できる。

## 運用上の注意点
- UpstashのRESTエンドポイントはリージョンによってレイテンシが異なるため、APIがホストされるリージョンと合わせるとレスポンスが安定します。
- TTLが設定されているキーは、期限切れ後に自動削除されます。`user:{uid}:sessions` の集合はセッション削除時に手動でクリーンアップされるため、漏れがないか定期的に確認してください。
- ロックキー `lock:sess:{sid}` は自動削除前提の短期キーです。万一残っていても5秒で失効しますが、長時間残る場合は `kv.del` で手動削除が必要です。

## `receive-cleanup` の手動検証手順
1. **前提環境変数**
   - `KV_REST_API_URL`, `KV_REST_API_TOKEN`（Upstashへの書き込み権限付き）
   - `BLOB_READ_WRITE_TOKEN`（削除テスト用のVercel Blobトークン）
   - `RECEIVE_CLEANUP_SECRET`（Authorizationヘッダー用の共有シークレット、または `x-vercel-cron` を模倣）

2. **テストデータ投入**（期限切れ状態のエントリを作成）
   ```bash
   node - <<'NODE'
   import { Redis } from '@upstash/redis';

   const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
   const id = 'TESTKEY123';
   const expiresAt = Date.now() - 60_000; // すでに期限切れ
   await kv.zadd('receive:edge:index', { score: expiresAt, member: id });
   await kv.set(`receive:edge:meta:${id}`, {
     id,
     blob_name: 'user_prize/demo/demo.zip',
     expires_at: new Date(expiresAt).toISOString(),
     short_token: 'short-demo',
   });
   await kv.set('receive:token:short-demo', id);
   console.log('seeded test entry', { id });
   NODE
   ```

3. **ローカルで Cron エンドポイントを起動**
   - Vercel CLI がある場合: `cd apps/web && npx vercel dev`（`/api/cron/receive-cleanup` が http://localhost:3000 で待ち受け）。
   - 簡易疎通: `curl "http://localhost:3000/api/cron/receive-cleanup?health=1"` でヘルス応答を確認。

4. **クリーンアップを実行**
   ```bash
   curl -X POST \
     -H "Authorization: Bearer $RECEIVE_CLEANUP_SECRET" \
     "http://localhost:3000/api/cron/receive-cleanup?limit=10"
   ```
   - 応答の `deleted`, `missingMeta`, `errors` を確認し、Upstash側で `zrange receive:edge:index 0 -1` が空になっていることを確認する。
   - Blob が実際に削除されたかは Vercel Blob 管理画面または `@vercel/blob` の `list` コマンドで確認する。

## Vercelデプロイ環境でのE2E検証フロー
1. **デプロイ先の環境変数を揃える**
   - `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `BLOB_READ_WRITE_TOKEN`, `RECEIVE_CLEANUP_SECRET` を Vercel プロジェクトに設定し、`vercel env pull` でローカルと差分がないか確認する。
   - Cron シミュレーション時は `RECEIVE_CLEANUP_SECRET` または `x-vercel-cron` ヘッダーのどちらかが必要になる。

2. **プレビュー/本番デプロイを用意する**
   - 検証ブランチをデプロイし、`https://<deployment>.vercel.app/api/cron/receive-cleanup?health=1` が 200 を返すことを確認する。
   - スケジュール起動の時刻（UTC 15:00）より前にデプロイが完了していることを確認する。

3. **テストデータをデプロイ先の Upstash に投入する**
   - 上記「テストデータ投入」のスクリプトをそのまま利用し、`KV_REST_API_*` にデプロイ環境の値が入っていることを必ず確認する（誤ってローカルの KV を操作しないように注意）。

4. **Vercel 経由で Cron を手動トリガーする**
   ```bash
   curl -X POST \\
     -H "Authorization: Bearer $RECEIVE_CLEANUP_SECRET" \\
     "https://<deployment>.vercel.app/api/cron/receive-cleanup?limit=10"
   ```
   - 自動スケジュール時の挙動を模倣したい場合は `-H 'x-vercel-cron: preview-manual'` を付与し、`RECEIVE_CLEANUP_SECRET` が空でも実行できるかを確認する。

5. **削除結果を両側で確認する**
   - レスポンスの `deleted` と `errors` を記録し、Upstash 側で `receive:edge:index` が空になっていることを `zrange` で確認する。
   - Blob 側は Vercel ダッシュボードまたは CLI の `npx vercel blob ls user_prize/<owner>/<dir>` で削除結果を確認する。

6. **スケジュール起動の実績を確認する**
   - Cron 実行時は自動で `x-vercel-cron` が付与されるため、`vercel logs --since 1h https://<deployment>.vercel.app | grep "receive-cleanup"` で直近の実行ログを取得し、定刻に走っているかを確認する。

## 既知の課題・改善案
1. **`last_seen_at` の未更新**
   - セッション構造に含まれているものの、アクセス時に更新されていません。分析やセッション無効化の指標に活用するなら、`getSessionWithRefresh` 内で更新処理を追加する必要があります。

2. **セッション大量発行時の集合肥大化**
   - `user:{uid}:sessions` はSetとして無制限に増えます。古い `sid` を一定数で切り捨てる仕組み（例: 最新5件のみ保持）があると、Redisのメモリ節約になります。

3. **環境変数の重複定義**
   - `kv.js` では `KV_REST_API_TOKEN` または `KV_REST_API_READ_ONLY_TOKEN` を期待しています。読み取り専用トークンしかない環境では書き込みが失敗するため、デプロイ前に権限を確認してください。

4. **共有トークンの監査ログ不足**
   - `receive:token:{short}` の発行・利用履歴はUpstashには残りません。重要な共有データの場合、別途監査ログを記録する仕組みを検討してください。

5. **バックアップ戦略**
   - Upstash Redisのデータは自動バックアップ対象外です。セッション・トークンは再発行可能とはいえ、障害時の影響範囲を理解し、必要であれば外部ストレージへのスナップショット取得を検討してください。

---
この設計書を参照することで、Redisキーの命名規則や保持データを素早く把握でき、API追加時に既存データと衝突しないよう計画できます。
