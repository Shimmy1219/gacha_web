# API仕様書（Discordログイン・ZIPアップロード関連）

この仕様書は、Discordログイン機能とZIPファイルアップロード機能に関わるAPIエンドポイントの概要をまとめたものです。各エンドポイントの役割、リクエスト/レスポンス形式、認証、注意点、既知の課題を記載しています。

## 目次
1. [認証・セッション系エンドポイント](#認証セッション系エンドポイント)
2. [Discordユーティリティ系エンドポイント](#discordユーティリティ系エンドポイント)
3. [ZIPアップロード準備系エンドポイント](#zipアップロード準備系エンドポイント)
4. [共有リンク発行・解決エンドポイント](#共有リンク発行解決エンドポイント)
5. [既知の課題](#既知の課題)

---

## 認証・セッション系エンドポイント

| エンドポイント | メソッド | 概要 | リクエスト | レスポンス | 認証 | 備考 |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/auth/discord/start` | GET | Discord認可画面のURLを取得し、PKCE情報をクッキーとKVに保存する。 | `context`（任意、`browser`/`pwa`） | `200 OK` `{ ok, authorizeUrl, appAuthorizeUrl }` | 不要 | `Accept: application/json` を推奨。`format=json` 指定でも可。|
| `/api/auth/discord/callback` | GET | Discordから返ってきた認可コードをアクセストークンに交換し、セッションを発行する。 | クエリ: `code`, `state` | 成功時: `200 OK` HTML（リダイレクトスクリプト付き）。`Accept: json` または `format=json` の場合 `{ ok:true, redirectTo:'/' }` | 必須 (state検証) | 成功すると `sid` クッキーが設定される。|
| `/api/auth/logout` | POST | 現在のセッションを破棄する。 | ボディ不要 | `200 OK` `{ ok:true }`（予定）/ 現状は空レスポンス | `sid` クッキー | すべてのセッション削除は未実装。必要なら別途APIを拡張。|
| `/api/discord/me` | GET | ログイン中のDiscordユーザー情報を取得する。 | クエリ: `soft=1` で未ログイン時に `401` ではなく `200` を返す | `200 OK` `{ ok:true, user:{ id, name, avatar } }` / 未ログイン時 `{ ok:false, loggedIn:false }` | `sid` クッキー | セッション期限が近い場合は自動的にリフレッシュ。|

## Discordユーティリティ系エンドポイント
> **注記:** 本ドキュメントの主題はログインですが、ギルド選択等で利用するAPIも参考として記載します。

| エンドポイント | メソッド | 概要 | リクエスト | レスポンス | 認証 | 備考 |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/discord/csrf` | GET | Discord関連フォーム用のCSRFトークンを返す。 | なし | `200 OK` `{ ok:true, token }` | `sid` クッキー | Double Submit Cookie方式。|
| `/api/discord/guilds` | GET | ログインユーザーが所有するギルド一覧を返す。 | なし | `200 OK` `{ ok:true, guilds:[...] }` | `sid` クッキー | トークン不足時は `401`。|
| `/api/discord/find-channels` 等 | GET | ギルド内のチャンネル検索など補助機能。 | クエリパラメータ | JSON | `sid` クッキー | 詳細は実装ファイルを参照。|

## ZIPアップロード準備系エンドポイント

| エンドポイント | メソッド | 概要 | リクエスト | レスポンス | 認証 | 備考 |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/blob/csrf` | GET | ZIPアップロード用のCSRFトークンを発行する。 | なし | `200 OK` `{ ok:true, token }` | `sid` クッキー（推奨） | `csrf` クッキーに同じ値が保存される。|
| `/api/blob/upload` | POST | Vercel Blobへの直接アップロードを許可するためのトークンを発行する。 | JSON: `{ action:'prepare-upload', csrf, userId, fileName, ownerDiscordId?, ownerDiscordName?, receiverName? }` | `200 OK` `{ ok:true, token, pathname, fileName, expiresAt, ownerDirectory, receiverDirectory }` | `sid` クッキー + CSRF | `health` クエリでヘルスチェック可能。Origin/Referer検証あり。|

## 共有リンク発行・解決・削除エンドポイント

| エンドポイント | メソッド | 概要 | リクエスト | レスポンス | 認証 | 備考 |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/receive/token` | POST | Vercel BlobのダウンロードURLを暗号化し、共有リンクを生成する。 | JSON: `{ url, name, purpose, validUntil?, csrf }` | `200 OK` `{ ok:true, token, shortToken, shareUrl, exp }` | `sid` クッキー + CSRF | `url` は許可ホストのみ可。Upstashに短縮トークンを保存。フロント・バック双方でOrigin検証あり。|
| `/api/receive/resolve` | GET | 共有リンク（短縮トークン or 暗号化トークン）を解決し、ダウンロード先を返す。 | クエリ: `t`（必須）, `redirect=1`（任意） | `200 OK` `{ ok:true, url, name, exp, purpose }` / `redirect=1` の場合は `302` | 不要（公開） | 期限切れ時は `410 Gone`。ダウンロードURLは許可ホストに限定。|
| `/api/receive/delete` | POST | 受け取りリンクが指す元のBlobファイルを削除する。 | JSON: `{ token }` またはクエリ `t` | `200 OK` `{ ok:true }` | 同一オリジン必須 | 共有リンクの検証に成功した場合のみ削除。Vercel Blobが404の場合は成功扱いで終了。|

---

### 期限切れデータの取り扱いポリシー
- 共有リンクの有効期限 (`expiresAt`/`expires_at`) を `receive_keys` などの一次データストアに保存し、`blob_name` と合わせて日次 Cron ジョブで走査する。
- 日次 Cron は `/api/receive/edge-resolve` 用メタ（`receive_keys` 想定）を `now()` より古い `expiresAt` レコードで抽出し、`blob_name` をキーに Vercel Blob を削除する。削除成功後にメタレコードや短縮トークンも順次クリーンアップする。
- 削除結果や失敗件数はログ/メトリクスで計測し、監視通知の対象とする。

## 既知の課題
1. **CSRFクッキードメインが固定**
   - `/api/_lib/csrf.js` で `.shimmy3.com` 固定のドメインが設定されており、開発環境で無効になる可能性があります。環境変数で上書きできるよう改善が必要です。

2. **`/api/auth/logout` の応答形式が不明確**
   - 現状は単純にセッションを削除するだけで、成功レスポンスのJSONが定義されていません。クライアント実装に合わせて `200 OK` `{ ok:true }` を返すなど統一が望まれます。

3. **アップロードエラーメッセージの粒度**
   - `/api/blob/upload` や `/api/receive/token` で詳細なエラーが返るものの、クライアント側でユーザーに伝わる形になっていません。APIレスポンスの `error` 文言とUIの整合性を確認してください。

4. **共有リンクの有効期限設定**
   - 現状、API側がデフォルト値（7日）または最大14日で強制しています。ユーザーが任意に期限を指定できるようにする場合は、バリデーションとUI/UXをセットで設計する必要があります。

5. **ヘルスチェックエンドポイントの認証**
   - `/api/blob/upload?health` と `/api/receive/token?health` は誰でもアクセス可能です。監視用URLが漏洩した場合のリスクを考慮し、IP制限やトークン認証を検討してください。

---
この仕様書を参照することで、フロントエンド・バックエンド双方でAPIの契約を明確に保ち、変更時の影響範囲を素早く把握できるようになります。
