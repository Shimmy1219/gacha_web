# Discordローカルストレージ保管のセキュリティ改善案

## 背景・現状
現在、Discord関連の状態がブラウザの `localStorage` に平文で保存されています。
対象は以下のようなデータです。

- `discord.userState::${discordUserId}` (ギルド選択・メンバーキャッシュ)
- `discord.guildSelection::${discordUserId}` (旧フォーマットのギルド選択)
- `discord.memberCache::${discordUserId}::${guildId}` (旧フォーマットのメンバー一覧)
- `discord:pwa:pending_state` (PWAログインのstate)

`localStorage` は **JSから常時参照可能** であり、XSSや悪意ある拡張機能に対して脆弱です。
また、ブラウザの開発者ツールから容易に閲覧できるため、第三者に端末を触られた場合にも情報が露出します。

## 目的
- Discord関連データの **平文永続化をやめる**
- **保持対象を最小化** し、必要なら **暗号化/サーバー側保管** に移行する
- ログアウト時/期限切れ時に確実に削除される設計にする

## 修正案（候補）
### 案A: サーバー側保管に移行（推奨）
- ギルド選択・メンバーキャッシュをサーバー（Upstash等）に保存
- クライアントはメモリキャッシュ（React Query）に限定
- 取得APIを追加し、必要時に再取得
- 利点: XSSや端末覗き見からの露出を最小化できる
- 欠点: API追加とサーバー負荷、オフライン耐性の低下

### 案B: IndexedDB + 暗号化（中期）
- `localStorage` ではなく IndexedDB に保存
- Web Crypto (AES-GCM) で暗号化して保存
- 暗号鍵は「サーバー発行のセッション鍵」をログイン後に取得し、**メモリ保持のみ**
  - 例: `/api/discord/storage-key` で短命鍵を受け取る
- 期限切れ or ログアウト時に鍵破棄とDB削除
- 利点: データの「平文保存」を回避できる
- 欠点: XSSには依然弱い（JSが鍵を取得できるため）

### 案C: 保存データの最小化 + セッション限定（短期）
- メンバー一覧・チャンネル名などの詳細情報は保存しない
- `guildId` と `updatedAt` のみに縮小
- `discord:pwa:pending_state` は `sessionStorage` / メモリへ変更
  - 10分TTLは維持し、タブ終了で破棄
- 利点: 低コストでリスク低減
- 欠点: 再取得が増える、PWA復帰フロー要検証

### 案D: PWA pending_state を HttpOnly Cookie 化（長期）
- PWAログイン開始時、サーバーが `state` を HttpOnly Cookie に保存
- クライアントは `localStorage` に触れずに `claim-session` 実行
- 利点: `state` をJSから不可視化できる
- 欠点: PWA復帰の動作要件と整合を取る必要あり

## 推奨ロードマップ
1. **短期 (安全性改善をすぐ反映)**
   - 保存対象を最小化（案C）
   - ログアウト/期限切れ時の削除を強化
2. **中期 (保護強度アップ)**
   - サーバー側保管へ移行（案A）
   - 併用が難しい場合はIndexedDB + 暗号化（案B）
3. **長期 (PWA特化の強化)**
   - pending_stateのCookie化（案D）

## 影響範囲（現行の保存実装）
- `apps/web/src/features/discord/discordUserStateStorage.ts`
- `apps/web/src/features/discord/discordMemberCacheStorage.ts`
- `apps/web/src/features/discord/discordGuildSelectionStorage.ts`
- `apps/web/src/features/discord/useDiscordSession.ts`

## テスト観点（実装時）
- ログイン/ログアウト後に `localStorage` に Discordキーが残らない
- 保存されるデータの最小化（メンバー一覧が保存されない）
- PWA復帰フローで `state` が期限切れの場合に安全に破棄される
- サーバー側移行時の再取得・TTL動作
