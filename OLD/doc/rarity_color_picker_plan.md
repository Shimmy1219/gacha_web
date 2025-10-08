# Rarity Color Picker React + Tailwind 設計書

## 1. 目的と背景
- 既存の `/src/color_picker.js` は DOM 直接操作とインラインスタイル注入で 20 色＋カスタム＋虹色・金属色を提供しているが、React 化後も同等以上の機能と視覚表現を維持する必要がある。【F:src/color_picker.js†L1-L144】【F:src/color_picker.js†L146-L229】
- レアリティ設定画面以外でも再利用できるよう、UI と状態管理を疎結合にし、Tailwind CSS ベースのユーティリティでスタイルを共有する。
- 金銀のメタリック表現と虹色の特別処理を React コンポーネント側で抽象化し、Tailwind の `bg-gradient`・`bg-clip-text` ユーティリティを活用して再現する。

## 2. 現行仕様の整理
- 定数パレット `DEFAULT_PALETTE` にラベル・色値を保持し、レアリティの既定色／実用色／モノトーン／虹色を提供する。【F:src/color_picker.js†L10-L43】
- ボタン型のチップを押下するとポップオーバーが固定位置で開き、ビューポートに収まるように補正している。【F:src/color_picker.js†L93-L132】【F:src/color_picker.js†L163-L185】
- カスタムカラーは `<input type="color">` を裏側で利用し、選択値をチップへ反映させる。虹色／金属色はクラスで背景を切り替え、通常色は `style.background` を直接設定している。【F:src/color_picker.js†L45-L90】【F:src/color_picker.js†L133-L162】
- 金属色の検出は `isGold`・`isSilver`・`isMetal` 関数で行い、スウォッチとチップ両方で利用している。【F:src/color_picker.js†L73-L86】

## 3. React コンポーネント構造
### 3.1 エクスポート構成
```
components/
  rarity/
    color-picker/
      RarityColorPicker.tsx      // 外部公開、制御/非制御両対応
      ColorChipButton.tsx        // 呼び出し元の trigger
      ColorPopover.tsx           // ポップオーバーとグリッド
      ColorSwatch.tsx            // 単一スウォッチ
      useColorPicker.ts          // カスタム Hook（状態・挙動を切り出し）
      palette.ts                 // DEFAULT_PALETTE 等の定数
```
- ルートコンポーネント `RarityColorPicker` は `value`／`defaultValue`／`onChange`／`palette`／`disabled`／`portalContainer` を props に持つ。
- trigger と popover の分離により、別画面で chip と一覧表示を切り替えるなど柔軟に再利用できる構造にする。

### 3.2 Props 詳細
| Prop | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `value` | `string \| null` | 任意 | 制御モード用。未指定時は内部 state を使用。 |
| `defaultValue` | `string \| null` | 任意 | 初期値（非制御モード）。 |
| `onChange` | `(next: string) => void` | 任意 | 選択値が確定したときに発火。虹色・金属色・カスタム HEX をそのまま返す。 |
| `palette` | `ColorOption[]` | 任意 | `[{ id, name, value }]`。未指定時は `DEFAULT_PALETTE` を利用。 |
| `portalContainer` | `HTMLElement` | 任意 | ポップオーバーを描画する DOM（未指定は `document.body`）。既存仕様の body 直下配置を尊重。 |
| `disabled` | `boolean` | 任意 | true の場合はポップオーバーを開かず、チップを半透明化。 |
| `renderLabel` | `(option: ColorOption) => ReactNode` | 任意 | スウォッチ tooltip や説明文をカスタムするためのレンダラー。 |

### 3.3 状態管理
- `useColorPicker` Hook で内部状態（`isOpen`, `anchorRect`, `activeValue`, `portalEl`）と制御/非制御の同期を行う。
- ビューポート内に収める位置調整は `useLayoutEffect` + `ResizeObserver` を利用し、`clampToViewport` 相当の計算を抽象化した `clampRectWithinViewport` ユーティリティを導入する。【F:src/color_picker.js†L114-L144】【F:src/color_picker.js†L146-L185】
- グローバルで 1 つだけ開く挙動は Context ではなく、`useColorPicker` 内で `useRef<() => void>` を共有するシングルトンマネージャーを導入し、React ツリーをまたがる多重起動を防止する。

### 3.4 サブコンポーネント責務
- `ColorChipButton`
  - 表示用のチップ。虹色・金銀はクラスで表現し、通常色は `style={{ backgroundColor: value }}` を設定。
  - `aria-haspopup="dialog"`、`aria-expanded` を設定し、キーボード操作（Space/Enter）に対応させる。
- `ColorPopover`
  - `@headlessui/react` の `Dialog` ではなく、軽量な `div` + Portal で実装。Focus Trap は `useEffect` で最初のボタンにフォーカスを合わせる。
  - `Esc` 押下・ポップオーバー外クリック・スクロール/リサイズで閉じる挙動を hook に委譲。
- `ColorSwatch`
  - `button` 要素。`data-value` 属性と `aria-label` を持ち、選択中は `ring-2 ring-offset-2` で視認性を確保。
  - 金銀は Tailwind のグラデーションユーティリティを使うため、`bg-[linear-gradient(...)]` ではなく `before:` 疑似要素を活用したカスタムクラスを追加する。

## 4. Tailwind スタイル設計
- ベーストークン
  - `chip` コンポーネント: `inline-flex h-8 w-11 items-center justify-center rounded-md border border-panel-border shadow-sm transition`。
  - 内側の `span`: `h-[18px] w-[28px] rounded bg-white/0`。選択中の色は `style` で適用。
- メタリック表現
  - `bg-gradient-gold` と `bg-gradient-silver` ユーティリティクラスを `@layer utilities` で定義し、`background-image` を既存 CSS と同等にする。【F:src/color_picker.js†L45-L72】
  - テキスト用途は `text-gradient-gold`・`text-gradient-silver` クラスを用意し、`bg-clip-text text-transparent` を組み合わせる。
- 虹色表現
  - `bg-gradient-rainbow` ユーティリティを定義し、`ColorChipButton` と `ColorSwatch` で共通使用。Tailwind の `from/to` グラデーションで 6 色を直線配置する。
- ポップオーバー
  - `absolute` ではなく `fixed` で描画し、`z-[4000] rounded-xl border border-panel-border bg-panel p-2.5 shadow-elevated` を基本スタイルとする。【F:src/color_picker.js†L52-L71】
  - スウォッチグリッドは `grid grid-cols-6 gap-2`、カスタム行は `mt-3 flex items-center gap-2`。
- カスタム入力
  - `button` は `border-dashed`・`text-sm`・`px-2.5 py-1.5`。`input[type=color]` は `sr-only` として非表示。

## 5. アクセシビリティと操作性
- キーボード: チップフォーカス時に `Enter/Space` で開閉、ポップオーバー内は `Arrow` キーで移動できるよう `roving tabindex` を `useMemo` で管理。
- スクリーンリーダー: 現在色を `aria-live="polite"` で読み上げ、虹色・金属色は `aria-label` に補足説明を付与する（例: "虹色 (グラデーション)"）。
- クリック外閉じ: `usePointerDownOutside` ヘルパーを導入し、ポインターデバイス共通で検知。
- フォーカストラップ: 開閉時に前のフォーカス要素を記録し、閉じる際に戻す。

## 6. 再利用戦略
- `palette` を機能側で差し替えられるよう、`ColorOption` を `{ id: string; name: string; value: string; type?: 'solid' | 'rainbow' | 'metal'; meta?: Record<string, unknown> }` で定義。
- レアリティ以外（例: テーマカラー設定、タグ色設定）でも使えるよう、ラベル表示とヘルパー関数 (`isMetal`, `isRainbow`) を `palette.ts` で公開し、他コンポーネントから流用可能にする。【F:src/color_picker.js†L73-L90】
- フォームライブラリ対応: `forwardRef` で `button` への参照を公開し、`react-hook-form` 等で `Controller` と組み合わせやすくする。
- カスタムレンダリング: `children` を `ColorPopover` に渡せば、グリッド下に注意書きやリンクを追加できるよう `slot` パターンを設計。

## 7. 実装ステップ
1. `packages/ui`（想定の共通 UI パッケージ）に `color-picker` ディレクトリを作成し、`palette.ts` に既存 `DEFAULT_PALETTE` と金属色定数を移植する。
2. Tailwind `@layer utilities` に虹色・金属グラデーション、`sr-only` 代替クラスを追加し、Storybook またはドキュメントでプレビューできるようにする。
3. `useColorPicker` Hook を作成し、`clampRectWithinViewport` とグローバルクローザー管理を実装。ユニットテストでポップオーバー位置補正の境界値を検証する。
4. `ColorChipButton`／`ColorPopover`／`ColorSwatch` を分割実装し、`RarityColorPicker` で統合。`forwardRef` と `useImperativeHandle` で `focus()` を公開する。
5. 既存の `/src/rarity.js`・`/src/rarity_style.js` を React 化するタイミングで `RarityColorPicker` を導入し、色変更時にレアリティ状態を更新する。虹色・金属クラスは Tailwind 化した `text-gradient-*` を利用する。【F:src/rarity.js†L1-L90】【F:src/rarity_style.js†L1-L120】
6. 別画面（例: ユーザーフィルタ、テーマ設定）での再利用サンプルを Storybook へ追加し、アクセシビリティチェック (Playwright Axe) を通過させる。

## 8. テスト計画
- コンポーネント単体テスト
  - `RarityColorPicker` の制御/非制御モードでの `onChange` 呼び出し回数。
  - `palette` 差し替え時にスウォッチ数・名称が一致するか。
  - `Esc` キー、クリック外、スクロールイベントで閉じるかの動作確認。
- ビジュアルリグレッション
  - 金銀・虹色・通常色のスナップショット比較。Tailwind カスタムユーティリティが正しく描画されるかを Chromatic 等で検証。
- アクセシビリティ
  - Storybook + Axe でコントラスト・ラベルの欠落を検出。
  - キーボード操作の e2e テストを Playwright で実施し、`Tab` 移動と `Enter` 選択を確認。

## 9. 今後の拡張余地
- カラーパレットをユーザー定義で保存する拡張に備え、`palette` を配列だけでなく `ColorGroup`（カテゴリ）配下に拡張できる設計にしておく。
- 色のトークン化（`rarity-ur`, `rarity-ssr` など）に対応するため、`value` に HEX 以外のシンボル文字列を受け入れ、呼び出し元でトークン→HEX の変換を提供できる API を検討する。
- 将来的に HSL スライダーやトーンバリエーションを追加できるよう、Popover コンテンツを `children` で差し込める headless デザインにする。
