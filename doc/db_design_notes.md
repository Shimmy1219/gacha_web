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
| `discord:auth:{state}` | Discord OAuthの `state` と `code_verifier` | JSON `{ verifier, loginContext? }` | 10分 (`DISCORD_AUTH_TTL_SEC`) | `saveDiscordAuthState`, `getDiscordAuthState`, `consumeDiscordAuthState`, `deleteDiscordAuthState` | `/api/auth/discord/start`, `/api/auth/discord/callback` |
| `receive:token:{short}` | 共有リンクの短縮トークン→暗号化トークン | 文字列（AES-GCMで暗号化したトークン） | 共有リンクの期限まで（最大14日） | `storeShortToken`, Upstash `kv.get` | `/api/receive/token`, `/api/receive/resolve` |
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

## 運用上の注意点
- UpstashのRESTエンドポイントはリージョンによってレイテンシが異なるため、APIがホストされるリージョンと合わせるとレスポンスが安定します。
- TTLが設定されているキーは、期限切れ後に自動削除されます。`user:{uid}:sessions` の集合はセッション削除時に手動でクリーンアップされるため、漏れがないか定期的に確認してください。
- ロックキー `lock:sess:{sid}` は自動削除前提の短期キーです。万一残っていても5秒で失効しますが、長時間残る場合は `kv.del` で手動削除が必要です。

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
