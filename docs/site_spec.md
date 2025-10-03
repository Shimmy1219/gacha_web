# 四遊楽ガチャツール 仕様書（stgブランチ現況）

## 1. プロジェクト概要
- 本サイトは他サービスで引いたガチャ結果を集計・共有するビューアであり、設定データや履歴のインポートとリアルタイム追記を中心にワークフローが組まれている。【F:index.html†L148-L206】
- 画面冒頭のスプラッシュでは TXT/JSON 読み込みや新規ガチャ作成といった導線を提示し、Discord ログインボタンも配置している（ログイン UI は API 応答に応じて状態更新）。【F:index.html†L151-L170】【F:index.html†L50-L88】
- メイン UI はレアリティ設定、アイテム画像設定、ユーザー集計、リアグ（リアルグッズ）ビュー、ガチャ編集パネルで構成され、モバイルではボトムタブでページを切り替える設計となっている。【F:index.html†L194-L289】

## 2. 技術スタックとデプロイ
- エントリーポイントは単一の `index.html` で、`index.css` / `index_mobile.css` によるレスポンシブ UI を採用している。JavaScript モジュールは `/src` 配下から読み込む構成。【F:index.html†L11-L19】
- ローカル資産として `JSZip` と `pako` を優先読み込みし、存在しない場合は CDN からフォールバックするガードが入っている。【F:index.html†L21-L101】
- PWA 対応は `manifest.webmanifest` と `sw.js` で実装され、サービスワーカーはプレキャッシュ・ネットワーク戦略・即時更新通知を担う。【F:manifest.webmanifest†L1-L13】【F:sw.js†L1-L117】
- Vercel デプロイを前提に `vercel.json` で manifest と service worker にキャッシュ制御ヘッダーを付与し、`package.json` は Vercel Blob や Upstash Redis などのサーバサイド依存を管理している。【F:vercel.json†L1-L21】【F:package.json†L1-L13】

## 3. クライアントアーキテクチャ
### 3.1 サービス初期化
- グローバルな `Services` オブジェクトを初期化し、アプリ状態・レアリティ・画像管理・リアグ管理の各サービスをローカルストレージキーと紐付けて読み込む。【F:index.html†L25-L42】【F:src/services/indexService.js†L1-L21】
- 起動前にアプリ状態が保存済みか検査し、初期描画のちらつきを抑えるスタイル適用を行う。【F:index.html†L103-L119】

### 3.2 UI構造
- ヘッダーにはハンバーガーメニューとキャッチコピーが配置され、モバイル時はドロワーにツールバーを移設する仕組みを備える。【F:index.html†L123-L146】
- スプラッシュ画面から開始モーダルを開き、TXT・JSON・新規作成タイルや隠しファイル入力でインポートフローを制御する。【F:index.html†L148-L325】
- メインツールバーではリアルタイム入力ボタン、全体エクスポート/インポート、Discord ログイン領域を提供し、`#controlsPage` がモバイルドロワーと連動する。【F:index.html†L175-L192】
- ユーザーパネルにはガチャ・レア度フィルタ、はずれ/カウント/リアグトグル、ユーザー検索があり、折りたたみ状態は `ui-toolbar.js` がローカル保存して制御する。【F:index.html†L205-L268】【F:src/ui-toolbar.js†L35-L169】
- 画像設定やリアグ設定は専用モーダルでファイル/URL 入力・リアグ管理・対象選択を行い、ガチャ削除やガイドモーダルなど多段のモーダル群を備える。【F:index.html†L328-L400】
- モバイルでは下部タブ (`#mobileTabs`) でレアリティ/景品/ガチャ/ユーザー/リアグページを切り替える。【F:index.html†L278-L285】

### 3.3 入力とワークフロー
- カタログ貼り付け、リアルタイム結果貼り付け、リアルグッズ設定など一連のワークフローがモーダルで段階的に実装されている。【F:index.html†L328-L400】
- `src/parsers.js` はカタログのタブ区切り/縦並び形式やリアルタイムブロック（`#なまずつーるず` 区切り）を解析し、レアリティ・コード・個数を抽出する。【F:src/parsers.js†L1-L67】

## 4. 状態管理とデータモデル
- `AppStateService` は `meta`（ガチャIDと表示名）、`catalogs`（レアリティ別アイテム一覧）、`data`（ユーザー×ガチャの保有アイテム集合）、`counts`（ユーザー×ガチャ×レアリティ×コードの獲得数）、`selected` を保持する。【F:src/services/appstateService.js†L14-L115】
- ガチャの作成・名称変更・削除、アイテムコードのリネームやレアリティ移動、ヒット追記などの操作を一貫して `patch` 内で更新することでローカルストレージと UI を同期している。【F:src/services/appstateService.js†L39-L200】
- サービスは保存時にデバウンスを行い、structuredClone 相当で状態をコピーして副作用を回避する。【F:src/services/appstateService.js†L18-L36】

## 5. レアリティ設定
- `RarityService` は `gachaId::rarity` 形式で色・レアリティ順序数・排出率（emitRate）を保持し、ガチャ単位での一覧取得や追加、移動、削除、コピーといった操作をサポートする。【F:src/services/rarityService.js†L1-L104】
- 外部データやインポート時にレアリティ設定をまとめて適用する `setGacha` / `upsertMany` / `ensureDefaultsForGacha` などのバルク API も提供し、排出率の再設定やレアリティ名変更に対応する。【F:src/services/rarityService.js†L105-L173】

## 6. 画像・リアグ管理
- `ImagesService` は IndexedDB `gachaImagesDB` に原寸ファイルを保存し、`map`（サムネール URL）・`orig`（オリジナル blob 情報）・`skip`（リアグ指定）をローカルストレージに同期する。レアリティやアイテムキーのリネーム、不要データの掃除、ガチャ単位のクリアを備える。【F:src/services/imagesService.js†L1-L117】
- `RiaguService` はリアグ対象のメタデータと skip セットを管理し、リアグキー追加・削除、メタ保存、アプリ状態と連動した当選者集計 (`winnersForKey`) を実装している。【F:src/services/riaguService.js†L1-L87】【F:src/services/riaguService.js†L104-L139】

## 7. インポート機能
- TXT インポーターは Base64 から JSON への復号、raw-deflate/zlib への対応、履歴リストからの集計とカタログ生成、レアリティ設定反映、`gacha_global_setting_v2` 初期化までを自動化している。【F:src/imp_txt.js†L1-L200】
- JSON インポーターはユーザー名ベースのデータからカタログ・カウントを組み立て、表示名に紐付くガチャ ID を確保したうえで `upsertHit` によって内製フォーマットへ変換し、レアリティの既定色も補完する。【F:src/imp_json.js†L1-L120】【F:src/imp_json.js†L135-L199】
- リアルタイム結果解析では `splitLiveBlocks` と `parseLiveBlock` がユーザー名・連数・レアリティ別明細を抽出し、同一ユーザー・ガチャで加算できるように整形する。【F:src/parsers.js†L29-L57】

## 8. 保存・エクスポート
- `imp_exp_file.js` は IndexedDB の画像/音声/動画とアプリ状態を ZIP（`.shimmy`）にまとめ、File System Access API、Web Share、ダウンロードリンクで保存するほか、逆方向の復元も担う。ZIP には IDB のキー情報と状態スナップショットを含める。【F:imp_exp_file.js†L1-L93】【F:imp_exp_file.js†L94-L157】
- `src/blob-upload.js` は端末保存と Vercel Blob へのアップロード、受け取りリンクの発行、CSRF トークン取得、UI フィードバックをまとめて制御し、既存のグローバル関数との互換性も維持している。【F:src/blob-upload.js†L1-L200】

## 9. サーバー/API 構成
- `/api/blob/csrf` は 32 バイトの CSRF トークンをセキュア属性付きクッキーに設定し、JSON レスポンスでも返す（二重送信クッキー方式）。【F:api/blob/csrf.js†L1-L31】
- `/api/blob/upload` は許可オリジンの検証、CSRF 照合、IP×時間窓によるレートリミット、ZIP MIME 制限、決定論的保存パス設定を行い、Vercel Blob の `handleUpload` を通じて署名付き URL を生成する。【F:api/blob/upload.js†L1-L190】
- `/api/receive/token` は共有 URL 発行 API で、同一オリジン検証・CSRF チェック・ダウンロード先ホスト検証を行い、AES-256-GCM で暗号化したトークンを生成して `/receive` 用の共有リンクを返す。【F:api/receive/token.js†L1-L188】
- `/api/discord/me` は Discord セッションを検証し、`?soft=1` クエリでは未ログインを 200 応答で返す軽量なユーザー情報 API となっている。【F:api/discord/me.js†L1-L27】

## 10. 受け取りページ
- `/receive/index.html` は共有リンクの閲覧・ダウンロード・展開をサポートする単独ページで、進捗バー表示や「URLをコピー」「一括保存」操作、JSZip を用いた ZIP 展開と個別保存 UI を備えている。【F:receive/index.html†L1-L200】

## 11. オフライン・PWA 機能
- サービスワーカーはインストール時にプレキャッシュ、アクティベーション時に旧キャッシュ削除とクライアント通知を行い、ナビゲーションはネットワーク優先、ライブラリはキャッシュ優先、その他は stale-while-revalidate 戦略で配信する。【F:sw.js†L1-L117】
- `manifest.webmanifest` はスタンドアロン表示、テーマカラー、アプリアイコンを定義し、PWA としてホーム画面追加できるように設計されている。【F:manifest.webmanifest†L1-L13】

## 12. 環境・設定値
- ローカルストレージキー（アプリ状態、画像マップ、リアグ、レアリティなど）は head スクリプトで先に定義され、サービス生成時に使用される。【F:index.html†L25-L42】
- `package.json` の依存はサーバー/API 関連に限定され、ESLint/Prettier が開発補助として含まれている。【F:package.json†L1-L13】
- `vercel.json` は manifest と service worker をキャッシュレス配信するためのリライトルールを設定し、PWA 更新を確実にしている。【F:vercel.json†L1-L21】

## 13. ユーザーインタラクション補助
- `ui-toolbar.js` がユーザー一覧フィルタの状態を保存・復元し、トグル変化時にユーザーリスト・アイテムグリッド・リアグパネルを再描画する。カスタムイベント `toolbar:changed` で他コンポーネントに通知できる設計。【F:src/ui-toolbar.js†L35-L169】
- Discord ログイン UI は `/api/discord/me` を `credentials: include` で叩き、成功時にアバター URL を計算、失敗時は未ログイン表示に戻す。UI 更新は `renderDiscordLoginButton` に委譲される。【F:index.html†L50-L88】

## 14. データ受け渡しと共有
- アップロード済み ZIP の受け取りリンクは `issueReceiveShareUrl` で `/api/receive/token` に登録し、`receive` ページがダウンロード進捗やメディアの個別保存機能を提供することで、ガチャ結果を安全に共有できる仕組みになっている。【F:src/blob-upload.js†L31-L200】【F:receive/index.html†L107-L200】
