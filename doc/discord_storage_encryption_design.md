# Discordローカル保管の暗号化設計（案B）

## 目的
Discord関連データを `localStorage` の平文保存から排除し、端末上での露出リスクを低減する。
ただし **XSS/悪性拡張機能に対しては完全防御ではない** ことを前提に、
「保存時の平文露出」と「開発者ツールからの閲覧」を抑制する。

## 対象データ（現状）
- `discord.userState::${discordUserId}`（ギルド選択・メンバーキャッシュ）
- `discord.guildSelection::${discordUserId}`（旧フォーマット）
- `discord.memberCache::${discordUserId}::${guildId}`（旧フォーマット）
- `discord:pwa:pending_state`（PWAログインstate）

## 方式概要
- 保存先: `IndexedDB` の専用DB / store に移行
- 暗号方式: Web Crypto `AES-GCM` 256bit
- 鍵管理: サーバーから **短命セッション鍵** を取得し、**メモリのみ保持**
- 互換性: 旧 `localStorage` のデータは **復号不要で移行**（読み込んで暗号化保存→削除）
- フォールバック: **localStorageへは戻さない**。利用不可ならメモリ保持のみ

## 脅威モデルと制約
- 防げる: 端末閲覧・開発者ツールでの平文閲覧、storageファイルの直接解析
- 防げない: XSS/悪性拡張機能（JSが鍵を取得できるため）
- 前提: HTTPS、SameSite/HttpOnlyクッキーでセッション維持

## データモデル（IndexedDB）
- DB名: `discord-secure-cache`
- store名: `records`
- keyPath: `key`（既存の論理キーをそのまま使用）

### レコード構造
```ts
interface EncryptedRecord {
  key: string;              // 例: discord.userState::123
  ver: 1;                    // 形式バージョン
  alg: 'AES-GCM';
  iv: string;                // base64
  cipher: string;            // base64
  createdAt: string;         // ISO
  expiresAt?: string | null; // 任意: TTL
  keyId: string;             // サーバーが発行する鍵ID
}
```

## 鍵管理
### 仕様案
- エンドポイント: `GET /api/discord/storage-key`
- 応答:
```json
{
  "ok": true,
  "keyId": "dk_2026_01_29_abcd",
  "key": "base64-raw-key",
  "expiresAt": "2026-01-30T00:00:00.000Z"
}
```
- 鍵は **メモリ保持のみ**（React Query cache / module-level singleton）
- TTL切れ後は再取得し、既存データは再暗号化

### クライアント側の保持方針
- リロードで鍵は消える
- 起動時に鍵取得 → 既存レコードを復号
- 取得失敗時は暗号化保存を行わず、読み込みは `null` を返す

## 主要フロー
### 1) アプリ起動 / Discord機能初期化
1. `/api/discord/storage-key` を呼ぶ
2. キーを SubtleCrypto で `CryptoKey` 化
3. IndexedDB の暗号化レコードを読み込み・復号
4. 復号失敗なら該当レコードを削除（改ざん耐性）

### 2) 保存（例: メンバーキャッシュ）
1. JSONを `TextEncoder` でバイト列化
2. `AES-GCM` で暗号化（IVは 96bit ランダム）
3. `EncryptedRecord` を upsert

### 3) 読み込み
1. `EncryptedRecord` を取得
2. `keyId` が現在の鍵と一致しない場合は再暗号化を試行
3. 復号できない場合は削除して `null` を返す

### 4) ログアウト
- `records` を一括削除
- メモリ鍵を破棄

## 既存localStorageからの移行
- 起動時に `discord.*` の旧キーを読み込み
- JSONが有効なら暗号化保存
- 保存成功後に `localStorage` を削除
- 失敗時は安全側に倒し **削除はしない**（ユーザーのキャッシュ保持を優先）

## 失敗時の挙動
- Web Crypto / IndexedDBが使えない環境: **永続化しない**
- 鍵取得失敗: **永続化しない**
- 復号失敗: **該当レコード削除**（改ざん/破損扱い）

## 実装対象（想定）
- `apps/web/src/features/discord/discordUserStateStorage.ts`
- `apps/web/src/features/discord/discordMemberCacheStorage.ts`
- `apps/web/src/features/discord/discordGuildSelectionStorage.ts`
- `apps/web/src/features/discord/useDiscordSession.ts`（PWA pending_stateの保存先変更）
- 新規: `apps/web/src/features/discord/discordEncryptedStorage.ts`

## テスト観点
- `localStorage` に Discordキーが残らない
- 旧データが暗号化ストレージへ移行される
- 復号失敗時に安全に削除される
- ログアウトで暗号化ストレージが消える
- 鍵TTL切れで再暗号化できる

## メリット / デメリット
### メリット
- `localStorage` からの平文露出を排除
- 端末上のストレージ解析に対して耐性が上がる
- 既存UI/UXを大きく変えずに移行できる

### デメリット
- **XSSには無力**（JSが鍵を持つため）
- 鍵取得APIが必要で、初期化が複雑
- 鍵切れ・復号失敗時の再暗号化や削除フローが増える
- Web Crypto / IndexedDBが使えない環境では永続化できない

## 追加検討事項
- PWA `pending_state` を暗号化ストレージに統一するか、`sessionStorage` を使うか
- 鍵の寿命（例: 24時間）と再暗号化タイミング
- サーバー側での鍵ローテーション・失効管理
