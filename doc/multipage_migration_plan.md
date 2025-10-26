概要
マーケティングページとツールページを共存させるため、doc/marketing_pages_directory_plan.md で提案されているレイヤリング（app/routes・layouts・pages・content・styles）へ合わせてディレクトリとルーティングを再編し、ガチャ専用ロジックは GachaLayout 配下に集約しつつ公開ページ用の MarketingLayout を新設します。

1. ディレクトリ構成とファイル移動
apps/web/src/components/app-shell/ のヘッダー関連（AppHeaderShell.tsx、HeaderBrand.tsx、MobileMenuButton.tsx、ResponsiveToolbarRail.tsx、ToolbarActions.tsx）を apps/web/src/layouts/gacha/ へ移し、ガチャ系レイアウト専用モジュールとして構成します。

apps/web/src/components/dashboard/（DashboardShell.tsx、DashboardDesktopGrid.tsx、DashboardMobileTabs.tsx、ControlsPanel.tsx、useResponsiveDashboard.ts）を apps/web/src/pages/gacha/components/dashboard/ に移し、ページ配下で完結させます。

ガチャセクション群を以下のように移設し、pages/gacha/components/ 直下へ統合します。

アイテム: features/items/components/{ItemsSection.tsx, ItemContextMenu.tsx} → pages/gacha/components/items/。

ユーザー: features/users/components/{UsersSection.tsx, UserFilterPanel.tsx} → pages/gacha/components/users/。

リアグ: features/riagu/components/RiaguSection.tsx → pages/gacha/components/riagu/。

レアリティ: features/rarity/components/ 配下一式を pages/gacha/components/rarity/ へ。PtControlsPanel や RarityTable を利用しているモーダルの import も合わせて更新します。

features/gacha/components/GachaTabs.tsx を pages/gacha/components/common/ に、features/dev/MockStorageButton.tsx を pages/gacha/components/dev/ に移し、ガチャページから直接参照できるようにします。

公開ページ用ディレクトリを新設: pages/home/、pages/privacy-policy/、pages/receive/ と、文面・コピーを置く content/{home.ts, privacy-policy.json}、マーケティング専用スタイルの styles/marketing.css を追加します。

既存の index.css を styles/app.css にリネームし、main.tsx の import を更新します（Tailwind 指令とカラートークンを保持）。

2. ルーティング改修
app/routes/AppRoutes.tsx からダッシュボード固有実装を切り離し、marketing-routes.tsx と gacha-routes.tsx を新設して useRoutes([...marketingRoutes, ...gachaRoutes, fallback]) 構成へ変更します。旧来の DashboardPage 内部ロジックは pages/gacha/GachaPage.tsx に移管します。

marketing-routes.tsx では / 配下に MarketingLayout を配置し、/home・/privacyPolicy を子ルート化、/receive だけは受け取り専用レイアウト/ページへ直結させます（必要に応じて Navigate で / → /home リダイレクト）。

gacha-routes.tsx は /gacha を GachaLayout で包んで GachaPage を index ルートに据え、追加ツールが発生した際に拡張しやすい形にします。

AppRoutes の onDrawGacha props を廃止し、GachaLayout の Outlet コンテキスト経由で必要なコールバックを子ページへ供給します（DashboardMobileTabs のガチャボタン用）。

3. ガチャ領域のレイアウトとページ
GachaLayout を新設し、旧 App.tsx で行っていたヘッダー描画、モーダル発火、ジェスチャー阻止、メイン余白計算などの副作用をすべて移植します。useModal、useAppPersistence、useDomainStores の利用箇所もここに集約し、AppHeaderShell や <main> の clsx ロジックを保持します。

GachaPage.tsx では従来の DashboardPage と同様に DashboardShell へセクション配列と MockStorageButton を渡し、Outlet コンテキストから受け取った onDrawGacha を再利用します。

各セクション移行後は、SectionContainer、useTabMotion、GachaTabs、useGachaDeletion 等の相対 import を新しいディレクトリ階層に合わせて更新し、PtControlsPanel や PrizeSettingsDialog などモーダル側の import も追従させます。

ToolbarStateProvider と ModalProvider、AppPersistenceProvider は GachaLayout 内部でラップし、ガチャ配下のみで初期化されるようにします。

4. 公開ページの整備
MarketingLayout.tsx を作成し、共通のヘッダー・フッター・OGP メタ情報設定やライトテーマ適用を管理します。ナビゲーションに /home・/gacha・/receive・/privacyPolicy などを配置し、レスポンシブ対応を追加します。

HomePage.tsx では content/home.ts にまとめたコピーと CTA リンクを読み込み、ヒーロー、機能紹介、ツール導線セクションを sections/ 配下コンポーネントとして分割します。

PrivacyPolicyPage.tsx は content/privacy-policy.json を fetch/静的 import してセクション毎にレンダリングできるようにし、更新しやすいようデータドリブン化します。

ReceivePage.tsx は doc/receive/receive_page_react_plan.md のフローに沿って、ReceiveProvider（Context+Reducer）、landing・resolve・intro・dashboard・reveal などのサブコンポーネントと hooks を pages/receive/ 以下に配置し、フェーズ遷移・Edge API 解決・ZIP 展開・演出制御のステートマシンを実装します。

5. プロバイダーとテーマ管理の見直し
AppProviders はグローバル領域として QueryClientProvider + BrowserRouter + SiteThemeProvider のみに整理し、ガチャ専用の永続化／モーダル／ツールバー状態は GachaLayout で包む構造へリファクタリングします。

SiteThemeProvider は AppPersistenceProvider が存在しない場合でもデフォルトテーマで動作できるよう、useDomainStores への依存をオプショナル化する（新規 useOptionalDomainStores を AppPersistenceProvider.tsx に追加）などのガードを導入します。

AppPersistenceProvider.tsx から AppPersistenceContext を利用したオプションフック（永続化／DomainStores を null 許容で取得）をエクスポートし、マーケティングページが余計なストレージ同期を行わないよう制御します。

6. エントリーポイントとスタイル資産
main.tsx のスタイル import を ../styles/app.css に差し替え、新設する styles/marketing.css は MarketingLayout 内で読み込むか、app.css から @import する形で適用範囲を制御します。

index.html の <title>・<meta> を公開サイト向けコピーへ更新し、modal-root は従来どおり維持します（ガチャレイアウトのモーダルが利用）。必要に応じて OG タグや Favicon を追記します。

Tailwind の対象パスは ./src/**/* を指しているため新ディレクトリでも検出されますが、styles/ に移動した CSS が含まれるか確認し、必要ならコメントを追記します。

7. パス解決と依存参照の更新
tsconfig.json / vite.config.ts に @layouts/*、@pages/*、@content/*、@styles/* などのエイリアスを追加し、移動後の import を簡潔にします（既存の @domain エイリアスは温存）。

すべての移動ファイルに対する import 文を一斉置換し、CreateGachaWizardDialog や PrizeSettingsDialog などモーダル類での参照先も新ディレクトリへ変更します。

余剰となった旧ディレクトリ（空の components/app-shell、components/dashboard、features/*/components など）は削除し、エクスポートの再編（必要なら index.ts の再調整）を行います。