# API実行者追跡ログ 設計刷新プラン

## 1. 目的
- Vercelログ上で、**「誰がこのAPIを実行したか」**を可能な限り追跡できるようにする。
- 理想値は以下。
  - Discordログイン済み: `discordName` + `discordId`
  - 未ログイン（配信者名入力あり）: `ownerName`
  - それ以外: `anonymous`

## 2. 現状と課題（2026-02-25時点）
- API本体の大半は `createRequestLogger` / `createEdgeRequestLogger` を利用している。
  - ただしロガーには actor 付与ロジックがまだない。
- `withApiGuards` / `withEdgeGuards` が弾くリクエスト（origin/csrf/rate-limit）は、`createRequestLogger` を経由しない。
  - 既存 `console.warn` には actor 情報が乗らない。
- Discordセッションは `sid -> sess:{sid}` で取得可能だが、全APIで毎回KV参照する設計はコストが高い。
- `ownerName` は localStorage 永続 (`receivePrefs.ownerName`) で、サーバーから直接参照できない。

## 3. 設計方針（刷新版）
- API個別改修は最小化し、**共通レイヤー（logger + guards）で actor を自動付与**する。
- actor 判定は原則 Cookie ベース（KV参照なし）で行う。
- logger と guards で**同一の actor フォーマット**を出力する。
  - 成功ログだけでなく、ガード段階で拒否した失敗ログも同じ条件で検索できる状態を作る。

## 4. actor解決ロジック（追加設計）

### 4-1. 追加Cookie契約
- `d_uid` (httpOnly, Secure, SameSite=Lax, Path=/, TTL=30日)
- `d_name` (httpOnly, Secure, SameSite=Lax, Path=/, TTL=30日)
- `owner_name` (非httpOnly, Secure, SameSite=Lax, Path=/, 最大64文字)

### 4-2. actor優先順位
1. `d_uid` が存在する -> `discord`
2. `owner_name` が存在する -> `owner`
3. それ以外 -> `anonymous`

### 4-3. サニタイズ規約
- `trim`
- 制御文字除去: `[\u0000-\u001F\u007F]`
- 連続空白を単一空白化
- `d_name`: 最大64文字
- `owner_name`: 最大64文字

### 4-4. 統一出力スキーマ
```ts
type ActorType = 'discord' | 'owner' | 'anonymous';
type ActorTrust = 'server_cookie' | 'client_cookie' | 'unknown';

type ActorLogMeta = {
  actorType: ActorType;
  actorLabel: string; // 例: foo (123), owner:TKY, anonymous
  actorTrust: ActorTrust;
  discordId?: string;
  discordName?: string;
  ownerName?: string;
};
```

### 4-5. 返却例
- Discord:
```json
{
  "actorType": "discord",
  "actorLabel": "foo (123)",
  "actorTrust": "server_cookie",
  "discordId": "123",
  "discordName": "foo"
}
```
- Owner:
```json
{
  "actorType": "owner",
  "actorLabel": "owner:TKY",
  "actorTrust": "client_cookie",
  "ownerName": "TKY"
}
```
- Anonymous:
```json
{
  "actorType": "anonymous",
  "actorLabel": "anonymous",
  "actorTrust": "unknown"
}
```

## 5. logger + guards 同一フォーマット化（追加設計）

### 5-1. なぜ両方必要か
- `logger` は handler 内の通常ログを担保する。
- `guards` は handler 到達前の拒否ログ（CSRF不一致、origin拒否、rate-limit）を担保する。
- どちらか片方だけでは「全APIでの追跡」が欠ける。

### 5-2. 共通化方針
- 追加ユーティリティ（候補）:
  - `apps/web/api/_lib/actor.js`
  - `resolveActorFromSource(source): ActorLogMeta`
  - `withActor(meta, source): meta + ActorLogMeta`
- `logger.js` / `edgeLogger.js` は `formatMeta()` で `withActor` を適用。
- `apiGuards.js` / `edgeGuards.ts` の `console.warn` も `withActor` 付きpayloadで出力。

## 6. Cookieライフサイクル設計

### 6-1. Discordログイン成功時
- 対象: `apps/web/api/auth/discord/callback.js`
- `sid` 設定と同時に `d_uid` / `d_name` を設定する。

### 6-2. 既存ログインユーザーの補完
- 対象: `apps/web/api/discord/me.js`
- `sess.uid` / `sess.name` 取得時、`d_uid` / `d_name` が欠損していれば再設定する。

### 6-3. ログアウト時
- 対象: `apps/web/api/auth/logout.js`
- `sid` 削除と同時に `d_uid` / `d_name` を削除する。

### 6-4. owner_name 同期
- 対象:
  - `apps/web/src/modals/dialogs/PageSettingsDialog.tsx`
  - `apps/web/src/app/App.tsx`（起動時同期）
- 追加ユーティリティ（候補）:
  - `apps/web/src/features/receive/syncOwnerNameCookie.ts`
- 同期規約:
  - 値あり: `owner_name=<encoded>` を設定
  - 空/null: `Max-Age=0` で削除

## 7. 追跡保証レベル
- **強い追跡**: Discordログイン済み + `d_uid/d_name` あり
- **中程度追跡**: 未ログイン + `owner_name` あり（自己申告）
- **弱い追跡**: anonymous

## 8. 実装タスク分解（刷新版）
1. `actor-core`: actor解決/サニタイズ共通ユーティリティ実装
2. `actor-logger-node`: `api/_lib/logger.js` に actor 自動付与
3. `actor-logger-edge`: `api/_lib/edgeLogger.js` に actor 自動付与
4. `actor-guards-node`: `api/_lib/apiGuards.js` の拒否ログに actor 付与
5. `actor-guards-edge`: `api/_lib/edgeGuards.ts` の拒否ログに actor 付与
6. `discord-actor-cookies`: `callback.js` / `me.js` で `d_uid` / `d_name` 設定・補完
7. `logout-actor-clear`: `logout.js` で `d_uid` / `d_name` 削除
8. `owner-cookie-sync`: `PageSettingsDialog` + `App` で `owner_name` 同期
9. `docs`: 運用上のPII注意・検索クエリ例を追記

## 9. テスト観点（最小）

### 9-1. Node handlerログ
- Discordログイン済みで任意API実行 -> `actorType=discord` + `discordId` + `discordName`
- 未ログイン + `owner_name` -> `actorType=owner` + `ownerName`
- Cookieなし -> `actorType=anonymous`

### 9-2. Guard拒否ログ
- CSRF mismatch時も同じ actor キーが出る
- origin拒否/rate-limit時も同じ actor キーが出る

### 9-3. Edge API
- `/api/discord/bot-guilds` の通常ログ/拒否ログでも同一スキーマが出る

### 9-4. 回帰確認
- ログイン/ログアウト機能が壊れていない
- 既存レスポンス仕様は非変更

## 10. ロールアウト
1. `actor-core` + `logger/guards` を先行リリース（Cookieなしでも匿名追跡は統一）
2. `discord actor cookies` をリリース（Discord actor追跡を強化）
3. `owner_name sync` をリリース（未ログイン時追跡を強化）
4. 1週間観測し、ログ量・PII運用ルールをレビュー

## 11. 非機能・運用注意
- Discord ID/名前はPII。Vercelログ閲覧権限を最小化する。
- `owner_name` は自己申告値。監査証跡としては扱わず、調査補助として扱う。
- ログ汚染対策としてサニタイズ規約を必須化する。

## 12. この刷新で追加された設計ポイント（要約）
- actor解決ロジックの明文化（優先順位/サニタイズ/信頼度）
- logger + guards 双方で同一スキーマ出力する要件の追加
- ガード拒否ログも追跡対象に含める設計
- owner同期を「変更時」だけでなく「起動時」も対象に拡張

