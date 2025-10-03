# UserPanelFilter React/Tailwind 移行計画

## 1. 目的
- 旧 `subcontrols-body` ブロック（ユーザー内訳パネルのフィルタ UI）を React + Tailwind CSS で再構築し、クラス名を `user-panel-filter` へ改称する。
- 既存の `filters.js` が提供するガチャ／レア度フィルタ、切替スイッチ、テキスト検索などの機能をコンポーネント化し、React 状態とサービス層の購読に統合する。
- Tailwind を用いて現在の `index.css` が付与している視覚要素（高さアニメーション、レイアウトグリッド、ボタンスタイルなど）を再現・改善しつつ、アクセシビリティ（フォーカス管理、ARIA 属性）を維持する。

## 2. 現状の把握
### 2.1 DOM 構造
- `index.html` の `#usersPanel` 内に `div#subcontrolsBody.subcontrols-body` があり、ラベルとコントロールの 2 列グリッドで以下を保持している。
  1. ガチャ絞り込み (`#gachaFilterWrap` / `#gachaFilterBtn` / `#gachaPopover`)
  2. レア度絞り込み (`#rarityFilterWrap` / `#rarityFilterBtn` / `#rarityPopover`)
  3. はずれを隠す (`#hideMiss`)
  4. 獲得数を表示 (`#showCounts`)
  5. リアグのみを表示 (`#showSkipOnly`)
  6. ユーザー検索 (`#userSearch`)
- ボタンは `.btn subtle gf-btn` で、ポップオーバーは `.gf-popover`。トグルは `.toggle > input.switch`。

### 2.2 スタイル依存
- `index.css` では `.subcontrols-body` に高さ・不透明度のトランジション、`user-subcontrols`/`usc-grid` でラベルとコントロールを整列させている。
- ガチャ／レア度ボタンは `btn subtle` のバリアントを共有。Tailwind で `inline-flex`, `px`, `py`, `rounded` 等を再表現する必要がある。
- トグルスイッチのカスタム装飾が CSS に存在するため、Tailwind + 任意の `peer` 等で再構築、もしくは CSS モジュール化する方針を決める。

### 2.3 ロジック依存
- `src/filters.js` で `createMultiSelectFilter` が DOM ID で初期化し、ボタン→ポップオーバーの開閉、オートクローズ、AppState との同期を管理している。
- `syncFiltersFromApp` / `attachAppStateFilters` がサービス層の状態から候補を構築し、選択値を維持したまま更新している。
- 現状は `window.GachaFilter` / `window.RarityFilter` として公開し、他 UI からも利用される。

## 3. React 移行コンセプト
1. `UserPanelFilter` コンポーネントを `src/react/components/UserPanelFilter.tsx`（仮）へ追加し、`user-panel-filter` クラスをルート要素へ付与。
2. マルチセレクトポップオーバーは React コンポーネント化 (`MultiSelectFilter`) し、`createPortal` で body 配置と追従を再現。
3. フィルタ状態は `UserFilterStore`（Zustand など）または上位コンテナの `useState` で管理し、AppState サービス購読をカスタム Hook (`useGachaFilterOptions`, `useRarityFilterOptions`) で実装。
4. Tailwind クラス設計により、旧 `.usc-grid` 相当は `grid grid-cols-[auto,1fr] gap-x-3 gap-y-2 items-center` を基本とし、モバイル対応は `sm:grid-cols-[auto,1fr]` 等で調整。
5. 高さアニメーションは React Transition + Tailwind ユーティリティ（`transition-all`, `duration-200`, `overflow-hidden`）で再現し、折りたたみボタンと連携。

## 4. コンポーネント仕様
### 4.1 `UserPanelFilter`（root コンポーネント）
```ts
interface UserPanelFilterProps {
  services: {
    appState: AppStateService;
    rarityService?: RarityService;
  };
  defaultCollapsed?: boolean;
  value: UserFilterState;
  onChange(next: UserFilterState): void;
}

interface UserFilterState {
  selectedGachaIds: '*' | string[];
  selectedRarities: '*' | string[];
  hideMiss: boolean;
  showCounts: boolean;
  showSkipOnly: boolean;
  keyword: string;
}
```
- ルート要素: `<section className="user-panel-filter">`。
- 内部で `collapsed` 状態を保持。外部ボタン（`#subcontrolsToggle` の React 化）と連動し、`aria-expanded` を更新。
- 子コンポーネント
  - `<MultiSelectFilter type="gacha" />`
  - `<MultiSelectFilter type="rarity" />`
  - `<ToggleRow id="hideMiss" label="はずれを隠す" />` 等の再利用行。
  - `<TextInputRow id="userSearch" />`
- `onChange` はディープマージされた新しい `UserFilterState` を返却。

### 4.2 `MultiSelectFilter`
```ts
interface MultiSelectFilterProps {
  id: string;               // 例: 'gacha'
  label: string;            // 表示ラベル
  options: MultiSelectOption[];
  value: '*' | string[];
  onChange(value: '*' | string[]): void;
  autoCloseMs?: number;
}

interface MultiSelectOption {
  value: string;
  label: string;
  dataAttrs?: Record<string, string>;
}
```
- ボタンは Tailwind で `inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg border` 等を適用し、選択件数に応じて `text-sm font-semibold` を切替。
- ポップオーバーは `role="listbox" aria-multiselectable` を維持。`useFloating`（Floating UI）または独自計算でボタン位置に追従。
- 選択ロジック: `'*'` は全選択を表す。React state は `Set` ではなく `string[]` を基本とし、`useMemo` で `Set` 化して高速クリックに耐える。
- オートクローズは `useEffect`＋`setTimeout`。ポップオーバー操作時に `bumpAutoClose()` を呼び延長。
- 外側クリック／Escape で閉じる。`focus-trap` などでアクセシビリティ配慮。

### 4.3 `ToggleRow`
```ts
interface ToggleRowProps {
  id: string;
  label: string;
  value: boolean;
  onChange(next: boolean): void;
}
```
- Tailwind: `flex items-center gap-3`、`input` は `sr-only peer`＋`after:`疑似要素 Tailwind でスイッチを描画。
- キーボード操作はスペース／Enter で ON/OFF。

### 4.4 `TextInputRow`
```ts
interface TextInputRowProps {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange(next: string): void;
}
```
- Tailwind: `bg-slate-950/70 border border-slate-700 rounded-lg px-3 py-2 text-sm`. IME 入力で遅延しないよう `onChange` 直結。

## 5. Tailwind デザイン指針
- ルート: `user-panel-filter` + `transition-[height,opacity] duration-200 overflow-hidden`。開閉時に `max-h-[600px]` など十分な値を設定、`data-collapsed` 属性でスタイル切替。
- グリッド行: `grid grid-cols-[minmax(6rem,auto),1fr] gap-x-4 gap-y-3 items-center text-sm`. モバイルでは `@media (max-width:640px)` 相当で `grid-cols-1` とし、ラベルを上に表示。
- ボタン: `inline-flex items-center justify-between rounded-lg border border-slate-600 bg-slate-900/80 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-rose-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500`。
- ポップオーバー: `absolute z-50 mt-2 w-64 rounded-xl border border-slate-700 bg-slate-900/95 shadow-lg backdrop-blur`. 項目行は `flex items-center justify-between px-3 py-2 hover:bg-slate-800`。
- トグル: `peer` を用いた Tailwind カスタムまたは `@layer components` にスイッチスタイルを定義。

## 6. 状態同期とサービス連携
1. `useFilterOptions(services)` Hook を作成し、`attachAppStateFilters` と同等の役割を React 内に実装。
   - `useEffect` で `appState.onChange` を購読し、`gachaOptions`, `rarityOptions` を更新。
   - 既存の `syncFiltersFromApp` のロジックを TypeScript 化して共有（ユーティリティへ切り出し）。
2. `UserPanelFilter` は上位（UsersPage コンテナ）が保持する `UserFilterState` とオプション配列を props 経由で受け取り、UI からの変更で `onChange` を呼ぶ。
3. 既存の非 React 部分が共存する期間は、React コンポーネントの `useEffect` で `window.GachaFilter` 等へ互換 API を供給するアダプタを提供し、段階的移行を実現。

## 7. 移行手順
1. 既存 DOM (`subcontrols-body`) と関連 CSS (`.subcontrols-body`, `.usc-grid`, `.toggle` 等) を分析し、必要なスタイルを Tailwind `@layer` へ移植またはコンポーネント内クラスとして置換。
2. React 基盤プロジェクトに `UserPanelFilter` コンポーネントと補助コンポーネントを作成。
3. 既存 `filters.js` のロジックを TypeScript 化したユーティリティに再実装。DOM ID 依存を排除し、`useEffect` 内で `portal` など React API を使用。
4. 上位の UsersPanel React 化のタイミングで `UserPanelFilter` を組み込み、`user-panel-filter` クラス名へ置き換え。
5. 残余の CSS セレクタや JS が `subcontrols-body` を参照していないか確認し、リネームを反映。
6. UI リグレッション確認（ポップオーバー開閉、オートクローズ、キーボード操作、タッチ操作）を実施。

## 8. テストと検証
- ユニットテスト: `useFilterOptions` が AppState モックの変化で正しい候補と選択維持を返却するか検証。
- コンポーネントテスト（React Testing Library）: ボタン押下でポップオーバー表示、項目クリックで値が更新、オートクローズが発火するか確認。
- スナップショット/Storybook: Tailwind スタイルと状態別 UI を Storybook で確認、デザインレビューしやすくする。
- 統合テスト: Users パネルのフィルタリング結果が選択に応じて変化すること、折りたたみトグルと `aria-expanded` の整合性をチェック。

## 9. 今後の拡張余地
- フィルタの保存・復元機能（ローカルストレージ）を `UserFilterState` レベルで追加。
- ポップオーバーを共通ライブラリ化し、他 UI（ガチャタブなど）でも再利用。
- Tailwind テーマトークンを導入し、`index.css` に定義されているカラーパレットを `tailwind.config.js` へ移管。
