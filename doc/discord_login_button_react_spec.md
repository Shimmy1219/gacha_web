# Discord ログインボタン React 移行仕様

## 1. 目的
- 既存の `renderDiscordLoginButton` が担っている Discord 認証 UI を React + TypeScript + Tailwind で再実装し、複数ページで再利用できる汎用コンポーネントを提供する。【F:index.html†L49-L88】【F:src/discord-login-button.js†L1-L109】
- 未ログイン時のログイン開始と、ログイン済み時のメニュー表示という現行挙動を React 化する際に変更しない。
- ログイン済みメニューへ「ページ設定」アクションを追加し、ログアウトと同列に扱えるようにする。ページ設定押下時の実際の処理は別ドキュメントで定義されるため、トリガーイベントのみを用意する。

## 2. 現状整理
### 2.1 レンダリングフロー
- `index.html` では `refreshDiscordLoginUI` が `/api/discord/me?soft=1` を取得し、結果に応じて `renderDiscordLoginButton` を呼び出している。【F:index.html†L52-L87】
- メイン UI のツールバーとスプラッシュセクション内に `#discordLoginSlot` があり、ここへボタンが描画される想定になっている（将来的に複数箇所へ配置する必要がある）。【F:index.html†L175-L190】

### 2.2 スタイル
- 既存 CSS は `.btn.dlb` 系クラスでサイズや Discord ブランドカラー、ログインメニューのポップアップスタイルを定義している。React 化では Tailwind へ置き換えるが、同じ視覚トーンを維持する。【F:index.css†L766-L842】

### 2.3 機能挙動
- 未ログイン時は「Discordでログイン」ラベルのボタンを描画し、クリックで `/api/auth/discord/start` へ遷移する。【F:src/discord-login-button.js†L11-L53】
- ログイン済み時はアバターとユーザー名を表示し、クリックでメニュー（ログアウト／閉じる）をトグルする。【F:src/discord-login-button.js†L23-L106】
- ログアウト選択時は `/api/auth/logout` を POST 後にページをリロードしている。【F:src/discord-login-button.js†L79-L89】

## 3. React + TypeScript + Tailwind への移行方針
### 3.1 コンポーネント構成
- `components/auth/DiscordLoginButton/` に以下を作成する:
  - `DiscordLoginButton.tsx`: 表示とメニュー制御を担うプレゼンテーション。
  - `useDiscordSession.ts`: `/api/discord/me` の取得とキャッシュを行うフック。React Query もしくは SWR を利用可能にする。
  - `discordLoginButton.types.ts`: props／イベントの型定義。
- props 例:
  ```ts
  interface DiscordLoginButtonProps {
    placement?: "toolbar" | "splash" | string; // 将来の拡張を許す識別子
    onOpenPageSettings?: () => void;           // ページ設定を押した時に通知
    className?: string;                         // 配置側が追加スタイルを調整できる余地
  }
  ```
- ログイン状態は `useDiscordSession` の戻り値（`{ data, isLoading, refetch }`）で判断し、`DiscordLoginButton` は `data?.user` の有無で表示を切り替える。

### 3.2 Tailwind デザイン指針
- 既存 `.btn.dlb` のサイズを `className="inline-flex items-center gap-2 rounded-xl px-4 min-h-[44px] font-semibold"` などで再現する。
- Discord ブランドカラーは `tailwind.config.ts` の `extend.colors.discord` に `#5865F2` / `#4752C4` / `#3C45A5` を登録し、`bg-discord-primary hover:bg-discord-hover active:bg-discord-active` のユーティリティを用意する。
- メニューは `absolute` + `shadow-elevated` + `rounded-lg` + `bg-surface` で、`placement` に応じてドロップ方向を調整できるよう props でオフセットを扱う。

### 3.3 アクセシビリティ
- ボタンには `aria-label` を付与し、ログイン状態ではユーザー名を含める。
- メニューは `role="menu"`、各項目に `role="menuitem"` を付与し、Esc / フォーカス外クリックで閉じる。フォーカストラップはメニューを開いた瞬間に最初の項目へ移動する。
- ローディング中は `aria-busy=true` を設定し、スピナーなど視覚的フィードバックを追加する。

## 4. ログイン済みメニュー仕様
- メニュー構造は以下の順序で固定する:
  1. ページ設定（新規）
  2. ログアウト
  3. 閉じる
- 各項目は `MenuItem` コンポーネントで統一し、`onSelect` を呼び出す。`ページ設定` は `onOpenPageSettings` が定義されていなければプレースホルダ（`console.info`）で終わるが、UI 上は常に表示する。
- ログアウト項目は現行と同じエンドポイントへ POST し、成功／失敗問わずセッション情報を再取得した上でページをリロードまたは React 状態をリセットする。
- メニュー開閉は `useState` + `useClickAway`（もしくは独自実装）で制御し、複数配置時でもボタン単位で独立する。
- 今後の拡張に備え、項目リストを配列で管理しやすい構造（`const items: MenuItemDescriptor[] = [...]`）にする。

## 5. 配置とレイアウト要件
- デフォルトの `placement` はツールバー右端で想定し、`className` による追加余白調整を許可する。【F:index.html†L175-L190】
- スプラッシュ画面での利用時は中央寄せされた縦並びに対応するため、親要素から `flex` / `justify-center` を受け取れるようにする。ボタン自体は幅 100% にならないよう `w-auto` を基本とし、必要であれば `fullWidth` フラグで拡張する。
- 将来的に別ページへ埋め込むケースを見据え、メニューの `z-index` とオーバーフロー対策をユーティリティクラスで調整できるよう `portal` レンダリング（`ReactDOM.createPortal`）を検討する。

## 6. 状態・データフロー
- `useDiscordSession` は以下を提供する:
  ```ts
  interface DiscordSessionData {
    user?: { id: string; name?: string; avatar?: string };
  }

  interface UseDiscordSessionResult {
    data?: DiscordSessionData;
    isLoading: boolean;
    error?: Error;
    refetch: () => Promise<DiscordSessionData | undefined>;
    logout: () => Promise<void>;
  }
  ```
- `logout` は `/api/auth/logout` を呼んだ後に `refetch` し、必要ならコールバックで通知する。
- アバター URL の組み立ては現行ロジックと同じく `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=64` をユーティリティ化する。【F:index.html†L58-L67】

## 7. 実装ステップ
1. 既存 JS を参照しつつ、React 版の UI・メニュー仕様を Storybook でモックする。
2. `useDiscordSession` を作成し、未ログイン／ログイン済み／通信エラーを判定する。
3. メニューへ「ページ設定」「ログアウト」「閉じる」を配置し、クリック時のフロー（メニューを閉じる → ハンドラ呼び出し）を実装する。
4. 既存 DOM への挿入をやめ、React ルートから `DiscordLoginButton` を呼び出す。旧 `renderDiscordLoginButton` / `refreshDiscordLoginUI` は段階的に削除する。
5. Tailwind ユーティリティを整備し、既存 CSS の `.btn.dlb` 系セレクタを除去する準備を行う。
6. 主要配置箇所（ツールバー、スプラッシュ）での表示崩れがないか確認し、レスポンシブを調整する。

## 8. テスト計画
- **単体テスト**: `useDiscordSession.logout` が fetch を呼び、エラー時でもメニューを閉じることを確認する（fetch をモック）。
- **コンポーネントテスト**: React Testing Library で未ログイン表示、ログイン済みメニュー表示、`onOpenPageSettings` 発火を検証。
- **E2E テスト**: Playwright でログイン済みセッションをモックし、メニューから「ページ設定」「ログアウト」が選択できること、ログアウト後にセッションがクリアされることを確認する。

## 9. リスクと対策
- **複数配置時のメニュー競合**: メニュー開閉状態はボタン単位の state に閉じ込め、他のボタンを開いたときは共有ストアで閉じるシグナルを送る仕組み（またはカスタムイベント）を用意する。
- **API 応答遅延**: ローディング表示を追加し、複数回クリックされないようボタンを `disabled` にする現行挙動を維持する。【F:src/discord-login-button.js†L43-L53】
- **Tailwind 置換によるスタイル差異**: ブランドカラーをテーマ化して Storybook でデザイナー確認を受ける。
