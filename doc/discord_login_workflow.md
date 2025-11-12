# Discordログイン ワークフロー解説

このドキュメントでは、Discordログイン機能に関わるクライアント（フロントエンド）、API（バックエンド）、そしてデータベース（Upstash Redis KV）の連携を、IT初心者でも理解しやすいように段階的に説明します。

## 全体像
1. ユーザーがブラウザで「Discordでログイン」ボタンを押す。
2. ブラウザが自分のサイトのAPIにリクエストして、Discord認可画面へ遷移するためのURLを取得する。
3. ユーザーがDiscordの認可画面で許可を与える。
4. Discordが当サイトのコールバックAPIに認可コードを返す。
5. コールバックAPIがDiscordからアクセストークンとユーザー情報を取得し、セッションを作成してクッキーへ保存する。
6. 以後の画面表示では、セッションIDを使ってログイン状態を確認する。

## クライアント側の流れ
クライアント実装は `apps/web/src/features/discord/useDiscordSession.ts` と `apps/web/src/pages/gacha/components/auth/DiscordLoginButton.tsx` 周辺にまとまっています。

1. **ログインボタンの表示**
   - `useDiscordSession` フックが `/api/discord/me?soft=1` を呼び、現在のログイン状態を取得します。
   - ログイン済みならユーザー名・アイコンを表示し、未ログインなら「Discordでログイン」ボタンを表示します。

2. **ログイン開始**
   - ボタン押下で `useDiscordSession().login()` が実行されます。
   - `/api/auth/discord/start?context=...` を `fetch` し、JSON応答で Discord 認可画面へのURLと `state` を取得します。
   - PWA（スタンドアロン表示モード）であれば、受け取った `state` を `localStorage` に `discord:pwa:pending_state` として保存します。これにより、別ウィンドウでSafari認証を完了した後に復帰しても、同じ `state` を参照できます。
   - モバイルの場合は Discord アプリのディープリンクを優先し、失敗時はWebブラウザの認可画面へ遷移します。

3. **ログイン完了確認（ブラウザ）**
   - Discord側の認可が完了すると、ブラウザは `/api/auth/discord/callback` から `/` へリダイレクトされます。
   - 画面に戻った後、`useDiscordSession().refetch()` が走り、再度 `/api/discord/me?soft=1` を取得してログイン完了を検知します。

4. **ログイン完了確認（PWA復帰フロー）**
   - iOS PWAではSafariのポップアップで認証するため、メイン画面に戻った際に `useDiscordSession` の `useEffect` が `localStorage` に保管された `state` を読み取ります。
   - `state` が残っている場合、`/api/auth/discord/claim-session` へ `POST` し、クッキー `d_pwa_bridge` と `state` を組にした検証を行います。
   - 検証に成功すると `sid` クッキーが再発行され、React Queryキャッシュを無効化してユーザー情報を再取得します。成功時は `localStorage` に保存していた `state` を削除し、失敗時は状況に応じてクリアして再試行ループを防ぎます。

5. **ログアウト**
   - ログアウト操作では `/api/auth/logout` に `POST` し、React Query のキャッシュを無効化して再読み込みします。

## API側の流れ
API実装は `apps/web/api/auth/discord/*.js` と `apps/web/api/discord/*.js` にあります。

1. **/api/auth/discord/start (GET)**
   - PKCE用の `state` と `code_verifier` を生成。
   - 値をHTTP-onlyクッキー（`d_state`, `d_verifier`, `d_login_context`）へ保存し、同時にUpstashへも `state` を保存します。
   - PWAコンテキストのログイン開始時には、端末ごとのブリッジ用シークレット `d_pwa_bridge` もクッキーで発行します（プレーンテキストは端末にのみ保持し、サーバー側にはハッシュを保管）。
   - Discord認可エンドポイントのURL（Web用とアプリ用）と `state` をJSONで返却します。

2. **/api/auth/discord/callback (GET)**
   - Discordから戻る際に、`state` と `code` を受け取ります。
   - クッキー、もしくはUpstashに保存した `state` 情報を使って本人確認を行い、`code_verifier` を復元します。
   - Discord APIへアクセストークン交換リクエストを送り、`/users/@me` でプロフィールを取得します。
   - 新しいセッションID (`sid`) を生成し、ユーザー情報＋アクセストークン等をUpstashに保存します。
   - `sid` をSecure属性付きクッキーへ保存し、PWAログインの場合は `state` と `sid` を関連付けた「ブリッジレコード」をUpstashへ保存します。このレコードには `d_pwa_bridge` クッキーのSHA-256ダイジェストを保持し、端末固有トークンとの一致を必須にすることでセッション奪取を防ぎます。
   - 最後にブラウザを `/` にリダイレクトし、`d_state` などの使い終わったクッキーを削除します。

3. **/api/auth/discord/claim-session (POST)**
   - PWA復帰時に `state` を受け取り、`d_pwa_bridge` クッキーの値をハッシュ化してUpstashのブリッジレコードと照合します。
   - ハッシュが一致し、かつ `state` に紐付く `sid` が有効であれば、同じ `sid` を再度Secureクッキーとして発行します。
   - セッションが引き渡された後はブリッジレコードと `d_pwa_bridge` クッキーを破棄し、再利用を防ぎます。

4. **/api/discord/me (GET)**
   - クッキーから `sid` を取得し、Upstashからセッション情報を読み込みます。
   - トークンの期限が近い場合は自動でリフレッシュします。
   - 成功時は `{ ok: true, user: { id, name, avatar } }` を返し、未ログイン時は `{ ok: false, loggedIn: false }` を返します。

5. **/api/auth/logout (POST)**
   - クッキーの `sid` を削除し、Upstashのセッションを無効化します。

## データベース（Upstash Redis KV）での管理
Discordログインで利用する主要キーは以下の通りです。

| キー形式 | 例 | 用途 | 保存期限 |
| --- | --- | --- | --- |
| `discord:auth:{state}` | `discord:auth:AbCd...` | 認可開始時に発行した `state` と `code_verifier` を保存。クッキーが欠損しても復元できるようにする。 | 10分 |
| `discord:pwa-session:{state}` | `discord:pwa-session:AbCd...` | PWAログイン専用のブリッジレコード。`sid` と `d_pwa_bridge` ダイジェスト、端末情報メタデータを保持し、復帰時のセッション引き渡しに使用。 | 10分 |
| `sess:{sid}` | `sess:K9x...` | ログインセッション本体。ユーザーID、Discordトークン、期限などを保持。 | 30日（アクセス毎に延長） |
| `user:{discordId}:sessions` | `user:123456789:sessions` | あるDiscordユーザーに紐づくすべての `sid` を集合で管理。ログアウト時のクリーンアップ用。 | 30日（セッション削除時に更新） |

### セッションの中身
`sess:{sid}` には以下の情報が保存されます。

- `uid`: DiscordユーザーID
- `name`: Discord表示名
- `avatar`: アバターID（アイコンURL組み立てに使用）
- `access_token` / `refresh_token`: Discord API呼び出し用トークン
- `access_expires_at`: アクセストークンの有効期限（ミリ秒）
- `ver`: セッションレコードのバージョン番号（更新回数）
- `created_at`, `last_seen_at`: セッション作成/最終アクセス時刻

`/api/discord/me` では `access_expires_at` を確認し、期限が近い場合は `refresh_token` を使ってDiscordにトークン再発行を依頼し、レコードを更新します。

## よくあるエラーと対処ポイント
- **クッキーがブロックされている**: `sid` が取得できず未ログイン扱いになる。ブラウザ設定を確認。
- **`state` 不一致**: `start` で発行した `state` が `callback` で一致しない場合、セッションは作成されない。リロードして再度ログインを試す。
- **PWAセッション引き渡しに失敗**: `/api/auth/discord/claim-session` が 401/403 を返す場合は、`d_pwa_bridge` クッキーが欠損・失効している。再度ログイン開始からやり直す。404/410 の場合はブリッジレコードの期限切れであり、保留中の `state` を削除して再ログインする。
- **環境変数不足**: `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` / `DISCORD_REDIRECT_URI` が未設定だと認可が開始できない。
- **Upstash接続エラー**: セッションの保存・取得に失敗しログインできない。ネットワークや認証情報を確認。

## 改善候補・課題
- `d_state` クッキーのドメインが固定値になっているため、開発環境では適切に設定されているか定期確認が必要。
- セッション保存内容に `last_seen_at` があるが、参照更新が行われていない。利用状況に応じて更新処理を追加すると、アクティブセッション管理が容易になる。
- ログイン後のリダイレクト先が固定 (`/`) のため、元いたページへ戻す仕組み（stateへreturnToを入れる等）があるとUX向上が見込める。
- エラーログは記録されるが、ユーザー向けのわかりやすいエラーメッセージ表示が限定的。クライアント側での補足表示があると親切。

---
このワークフローを理解しておくと、Discordログインの障害調査や機能追加（例: ギルド選択など）を行う際に、どこで何が起きているのか把握しやすくなります。
