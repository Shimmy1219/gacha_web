# XSS対策 検証レポート

実施日: 2026-01-29
対象: apps/web (Vite + React SPA) と関連API
目的: XSSリスクの棚卸しと対策案の整理

## サマリ
- React側に `dangerouslySetInnerHTML` / `innerHTML` などのDOM挿入は見当たらず、文字列描画はReactの自動エスケープに依存できる。
- 受け取り画面のテキストプレビューで `iframe` に `blob:` URL を直接表示しており、sandbox無しのためXSS成立余地がある。
- CSPやセキュリティヘッダーが未設定のため、万一のXSS発生時に被害拡大を抑制できない。

## 検証内容（コード確認）
- DOM挿入系APIの使用状況を検索。
  - `apps/web/src` には `dangerouslySetInnerHTML` / `innerHTML` / `insertAdjacentHTML` / `document.write` の使用なし。
  - `OLD/` 配下に `innerHTML` が存在するが、現行ビルド対象外であることを前提に除外。
- `iframe` / `contentEditable` の使用箇所を確認。
  - `apps/web/src/pages/receive/components/ReceiveItemCard.tsx`: textプレビューで `iframe` を使用。
  - `apps/web/src/pages/gacha/components/rarity/RarityTable.tsx`: `contentEditable` を使用し、`textContent` 取得。
- 動的URLの生成元を確認。
  - Twitter/X共有: URLSearchParams + 固定ベースURLで生成。
  - Discord招待URL: 固定ベースURL + searchParams。
  - 共有リンク: サーバー側で origin を固定生成。

## 主要リスクと対策

### High: 受け取りテキストプレビューの `iframe` 無制限実行
該当箇所:
- `apps/web/src/pages/receive/components/ReceiveItemCard.tsx`

懸念:
- 受け取ったZIP内のテキストファイルを `iframe` で表示している。
- `sandbox` がないため、HTML/JSを含むコンテンツが同一オリジンで実行される可能性がある。

対策案（優先順）:
1) `iframe` を `sandbox` 付きに変更し、スクリプト/同一オリジンを遮断。
   - 例: `sandbox=""`（最小権限）
   - 必要なら `allow-downloads` など必要最小限の権限のみ追加。
2) テキストプレビュー方式を変更し、`<pre>` で `textContent` 表示にする。
   - `Blob.text()` で文字列化し、Reactで表示すればXSS経路を根本遮断できる。
3) Blob作成時に MIME type を `text/plain` に固定。
   - `JSZip` から取得した `blob` を再生成し、`text/plain` を付与する。

### Medium: CSP/セキュリティヘッダー未設定
該当箇所:
- `apps/web/vercel.json`

懸念:
- XSS発生時の被害拡大抑止（外部送信/スクリプト実行）に弱い。

対策案:
- CSPの導入（例）
  - `default-src 'self'`
  - `script-src 'self'`
  - `object-src 'none'`
  - `base-uri 'self'`
  - `frame-ancestors 'self'`
  - `img-src 'self' data: blob: https:`
  - `style-src 'self' 'unsafe-inline'`（現状インラインstyle使用のため）
  - `connect-src` はDiscord/Blobなど実際の通信先を列挙
- 追加ヘッダー
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
  - `Permissions-Policy`（不要機能をdeny）

### Low: URLスキームのホワイトリスト
該当箇所:
- 共有リンクや外部リンク (`href={...}`)

対策案:
- `http:`/`https:`/`blob:` 以外を拒否するヘルパーを導入。
- `new URL()` で検証し、異常時はリンクを無効化。

## 追加で観察したポイント
- `contentEditable` は `textContent` 取得のため直接XSSには繋がりにくいが、ペースト時にHTML断片が混入するため、
  `onPaste` でプレーンテキスト化するのが安全。

## 推奨アクション（優先度順）
1) `ReceiveItemCard` の `iframe` を `sandbox` 付きにする、もしくは `pre` 表示に置き換える。
2) `vercel.json` にCSP/セキュリティヘッダーを追加。
3) URLホワイトリスト/バリデーションのユーティリティを導入。

## 検証ログ（使用コマンド）
- `rg -n "dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document.write" apps/web/src`
- `rg -n "iframe|contentEditable" apps/web/src`
- `rg -n "href=\\{" apps/web/src`

