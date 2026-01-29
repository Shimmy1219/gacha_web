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
- 鍵管理: `crypto.subtle.generateKey` で **端末生成・非抽出** の `CryptoKey` を作成
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
}
```

## 鍵管理
### 基本設計
- 初回アクセス時に `crypto.subtle.generateKey` で端末鍵を生成
- 鍵は `extractable: false`（非抽出）で作成
- 端末鍵は `IndexedDB` に **`CryptoKey` として保存**（構造化クローン対応）
- 取得できない場合は **永続化せずメモリのみ** で運用

### 詳細設計
- 生成パラメータ
  - `algorithm: { name: 'AES-GCM', length: 256 }`
  - `extractable: false`
  - `keyUsages: ['encrypt', 'decrypt']`
- 保存先
  - DB名: `discord-secure-cache`
  - store名: `keys`
  - key: `discord:encryption-key:v1`
- 起動時の取得順序
  1. `keys` から `CryptoKey` を取得
  2. なければ新規生成し保存
  3. 生成/保存に失敗した場合は「永続化不可」として扱い、暗号化保存は行わない
- 鍵喪失時の扱い
  - `keys` が存在しない場合は **既存暗号化レコードを破棄**（復号不能のため）
  - 端末のサイトデータ削除で復号不能になることを許容

## 暗号化/復号の詳細
### 暗号化
1. 文字列JSONを `TextEncoder` で `Uint8Array` 化
2. `iv` は 12byte（96bit）のランダム値
3. `crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData })`
   - `additionalData` には **論理キー（例: discord.userState::123）** を `Uint8Array` で付与
4. `cipher` は base64 で保存

### 復号
1. `cipher` と `iv` を base64 から `Uint8Array` に復元
2. `crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData })`
3. 復号結果を `TextDecoder` で文字列化し、JSON parse
4. 失敗時は改ざん/破損として削除

## 主要フロー
### 1) アプリ起動 / Discord機能初期化
1. `keys` store から `CryptoKey` を取得
2. なければ `generateKey` で生成し保存
3. 既存暗号化レコードを読み込み・復号
4. 復号失敗なら該当レコードを削除（改ざん耐性）
5. **Discordギルド情報の再取得モーダルを表示**

### 2) 保存（例: メンバーキャッシュ）
1. JSONを `TextEncoder` でバイト列化
2. `AES-GCM` で暗号化（IVは 96bit ランダム）
3. `EncryptedRecord` を upsert

### 3) 読み込み
1. `EncryptedRecord` を取得
2. 復号できない場合は削除して `null` を返す
3. **Discordギルド情報の再取得モーダルを表示**

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
- 鍵生成/取得失敗: **永続化しない**
- 復号失敗: **該当レコード削除**（改ざん/破損扱い）
  - 削除後、**ギルド情報の再取得モーダル**を表示して再取得を促す

## 復号失敗時のUI
- 目的: 破損/改ざんデータを削除した上で、ユーザーに再取得を促す
- 表示タイミング: 復号失敗でデータ削除が発生した直後
- モーダル内容（例）
  - タイトル: 「Discord連携情報を再取得してください」
  - 説明: 「保存データの復号に失敗したため、安全のため削除しました。ギルド情報を再取得します。」
  - ボタン: 「再取得する」（Discordギルド情報の再取得API/フローを起動）

## 詳細設計（クライアント）
### 影響範囲の棚卸（現状）
#### localStorage の直接アクセス（Discord関連）
- `apps/web/src/features/discord/discordUserStateStorage.ts`
  - `loadDiscordUserState` / `updateDiscordUserState` / `clearDiscordUserState` / `clearAllDiscordUserStates`
  - キー: `discord.userState::${discordUserId}`
- `apps/web/src/features/discord/discordMemberCacheStorage.ts`
  - 旧フォーマット読み取り・削除（`discord.memberCache::${discordUserId}::${guildId}`）
  - `discordUserStateStorage` 経由で新フォーマットの読み書きを実施
- `apps/web/src/features/discord/discordGuildSelectionStorage.ts`
  - 旧フォーマット読み取り・削除（`discord.guildSelection::${discordUserId}`）
  - `discordUserStateStorage` 経由で新フォーマットの読み書きを実施
- `apps/web/src/features/discord/useDiscordSession.ts`
  - `discord:pwa:pending_state` の読み書き/削除（PWAログインstate）

#### 読み書き呼び出し元（主な箇所）
- ギルド選択: `DiscordBotInviteDialog`, `DiscordPrivateChannelCategoryDialog`, `DiscordLoginButton`, `UserDiscordProfileDialog`
- メンバーキャッシュ: `DiscordMemberPickerDialog`, `DiscordBotInviteDialog`
- ギルド必須チェック: `openDiscordShareDialog`, `SaveOptionsDialog`, `DrawGachaDialog`
- クリア操作: `PageSettingsDialog`

#### まとめ
- Discord関連の永続化は **単一のストレージファイルには集約されていない**。
- 実際の localStorage 書き込みは **`discordUserStateStorage.ts` / `discordMemberCacheStorage.ts` / `discordGuildSelectionStorage.ts` / `useDiscordSession.ts` の4箇所**。
- 暗号化ストレージへ移行する場合は、上記4箇所の **読み書き実装を置き換えることが影響範囲の中心**。
### モジュール構成
- `discordEncryptedStorage`（新規）
  - 鍵の生成/取得/永続化
  - 暗号化/復号の実装
  - `records` store への保存/読み込み/削除
  - 復号失敗イベントの発火
- `discordEncryptedStorageCache`（新規 or 既存ストレージ層に内包）
  - 取得済みデータのメモリキャッシュ
  - 読み込みAPIはキャッシュ優先で即時応答
- `DiscordStorageRecoveryDialog`（新規モーダル）
  - 復号失敗時に再取得導線を提供

### 暗号化ストレージAPI（案）
```ts
type DecryptFailureReason = 'invalid' | 'missing-key' | 'corrupted';

interface DecryptFailureEvent {
  key: string;
  reason: DecryptFailureReason;
}

interface DiscordEncryptedStorage {
  initialize(): Promise<void>;
  load<T>(key: string): Promise<T | null>;
  save<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clearAll(): Promise<void>;
  onDecryptFailure(listener: (event: DecryptFailureEvent) => void): () => void;
}
```

### キャッシュ戦略
- `initialize()` 時に `records` のうち `discord.*` を一括ロードしてメモリに保持
- 既存の `loadDiscordGuildSelection` など **同期呼び出し箇所はキャッシュ参照**に置き換える
- キャッシュが未初期化の場合は `null` を返し、UIは `useEffect` で初期化完了後に再取得する

### 復号失敗時の挙動（詳細）
1. 復号失敗を検知
2. 対象レコードを削除
3. `onDecryptFailure` を発火
4. UI層が `DiscordStorageRecoveryDialog` を表示
5. 「再取得する」選択で以下のどちらかを実行
   - ギルド選択が無い状態として扱い、既存の「お渡し鯖の設定」モーダルを開く
   - もしくは専用の再取得フロー（今後追加）に遷移

### 既存ストレージ関数の置き換え方針
- `discordUserStateStorage.ts` などは以下の方針で差し替える
  - `load*` は **キャッシュ**を参照（同期）
  - `save/update` はキャッシュ更新 + 非同期保存
  - `clear` はキャッシュ削除 + 非同期削除

### IndexedDBストア設計（詳細）
- DB名: `discord-secure-cache`
- store: `keys`
  - key: `discord:encryption-key:v1`
  - value: `CryptoKey`（非抽出）
- store: `records`
  - keyPath: `key`
  - value: `EncryptedRecord`

### 互換移行（詳細）
- 初期化時に `localStorage` を走査（`discord.*`）
- JSON parse 成功 → 暗号化保存 → `localStorage` 削除
- 暗号化保存に失敗した場合は **削除しない**（復旧可能性を残す）

## サーバーサイド変更
- **原則なし**（鍵は端末生成のためAPI不要）
- 追加API/DB変更は不要

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
- 復号失敗時に再取得モーダルが表示される
- ログアウトで暗号化ストレージが消える
- 鍵喪失時に復号不能データが削除され、再取得導線が表示される

## メリット / デメリット
### メリット
- `localStorage` からの平文露出を排除
- 端末上のストレージ解析に対して耐性が上がる
- 既存UI/UXを大きく変えずに移行できる

### デメリット
- **XSSには無力**（JSが鍵を持つため）
- 端末のサイトデータ削除で復号不能になる
- 鍵喪失時の削除フローが増える
- Web Crypto / IndexedDBが使えない環境では永続化できない

## 追加検討事項
- PWA `pending_state` を暗号化ストレージに統一するか、`sessionStorage` を使うか
- 鍵ローテーション（端末内）と再暗号化の要否
