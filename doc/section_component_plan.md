# PTControls React 移行詳細計画

## 1. 目的
- レアリティ設定セクションに存在する `pt-controls` UI を React + Tailwind CSS で再構築し、フォーム構造・永続化ロジックをコンポーネントとして切り出す。
- 既存 DOM 挿入スクリプト（`src/pt-controls.js`）が担っている PT 課金設定の作成・保存・自動復元を、React 状態管理とフックス化されたストアへ移管する。
- Tailwind で視覚トークンを統一し、既存テーマカラーやボタンスタイルを React コンポーネント側で再現しつつ、アクセシビリティとバリデーションを強化する。

## 2. 現状整理
- DOM 操作ベースで `.subcontrols` 配下にフォームを挿入し、`gacha_global_setting_v2` を localStorage / window / AppState に多重保存している。【F:src/pt-controls.js†L1-L172】
- `index.css` の `.pt-controls`, `.pt-controls-row`, `.pt-item-row`, `.pt-input` などに依存した固定レイアウトで、`btn small` 等の共通ボタンスタイルを流用している。【F:index.css†L30-L120】
- バンドル行・保証行の追加/削除は都度 DOM を組み立てており、レアリティ一覧は Services.rarity から直接取得する。【F:src/pt-controls.js†L72-L156】

## 3. React 化の要件
### 3.1 機能要件
1. ガチャ ID ごとの PT 設定（perPull, complete, bundles[], guarantees[]）を編集・保存できる。
2. レアリティタブ変更・データ取込イベントを購読し、選択されたガチャ ID に応じてフォームを自動切り替え・同期する。
3. バンドル/保証行の追加・削除がリアクティブにレンダリングされ、保存が自動反映される。
4. 旧ストレージ（`gacha_global_setting_v1`）からの初期値移行と互換保存（window, AppState, localStorage への反映）を保持する。
5. Tailwind クラスでレイアウト・余白・影・ボタンを再構築し、モバイル幅でも読みやすいレスポンシブデザインを持つ。

### 3.2 非機能要件
- React コンポーネント単位で単体テスト（Vitest）と Storybook ドキュメントを作成する。
- Tailwind `@layer components` に PTControls 専用のカスタムスタイルを追加しない。ユーティリティのみで構成し、テーマトークンは `react_migration_plan.md` の設計に従う。
- Context / Hook を通じてのみ状態とやり取りし、グローバル window 直接操作は互換保存レイヤーに閉じ込める。

## 4. データモデリング
### 4.1 TypeScript 型
```ts
// packages/domain/pt-controls/types.ts
type PtBundle = { id: string; pt: number; pulls: number; };
type PtGuarantee = { id: string; minPulls: number; minRarity: string; };

export interface PtSetting {
  gachaId: string;
  perPull: number;
  complete: number;
  bundles: PtBundle[];
  guarantees: PtGuarantee[];
  updatedAt: string;
}
```
- 追加・削除操作を React で安定追跡するため、各行に `id` を持たせる。
- `updatedAt` はオートセーブ発火時に ISO 文字列で更新する。

### 4.2 ストア構造
```ts
interface PtControlsState {
  byGachaId: Record<string, PtSetting>;
  selectedGachaId: string | null;
  status: 'idle' | 'saving' | 'error';
  error: string | null;
}
```
- `selectedGachaId` は RarityStore と同期し、LS (`rarity_tab_selected`) をソースオブトゥルースとする。
- 永続化は `PtControlsService`（下記）経由で行い、副作用は hook 内で封じ込める。

## 5. サービス抽象化
- `packages/domain/pt-controls/service.ts`
  - `loadAll(): Promise<Record<string, PtSetting>>` — window/AppState/localStorage からの統合読み込み。
  - `saveAll(map: Record<string, PtSetting>): Promise<void>` — 3 箇所へ書き戻し。
  - `loadFor(gachaId)` / `saveFor(gachaId, data)` — 既存 API と同名で提供。
  - `listRarities(gachaId)` — RarityService を注入し、React 側では hook 経由で利用する。
- React から直接 DOM を参照しないよう、ストレージ書き込みはサービスレイヤに閉じる。

## 6. コンポーネント分解計画
### 6.1 コンポーネント階層
```
PtControlsPanel
├─ PtControlsHeader (タイトル/説明)
├─ PtNumericField (perPull, complete)
├─ PtBundlesSection
│   ├─ PtBundleRow (pt / pulls 入力 + 削除ボタン)
│   └─ AddBundleButton
├─ PtGuaranteesSection
│   ├─ PtGuaranteeRow (minPulls + rarity セレクト + 削除ボタン)
│   └─ AddGuaranteeButton
└─ AutoSaveIndicator
```
- `PtControlsPanel` が Context (`usePtControls`) に接続し、現在の設定を props として下位コンポーネントへ渡す。
- 行追加・削除は `dispatch({ type: 'addBundle', gachaId })` などの reducer アクションで行う。
- レアリティセレクトは `useRarityOptions(gachaId)` Hook で `[{ value, label, color }]` を取得し、選択時に `applyRarityColor` を利用したスタイルを適用する（Tailwind での背景色切替は `data-color` 属性を使い `style` バインド）。

### 6.2 アクション一覧
- `setSelectedGacha(gachaId)` — タブ切替イベントから発火。
- `hydrateSettings(payload)` — サービスから取得した設定で初期化。
- `updateField({ gachaId, field, value })` — perPull / complete の数値更新。
- `addBundle({ gachaId })` / `removeBundle({ gachaId, id })` / `updateBundle({ gachaId, id, patch })`。
- `addGuarantee({ gachaId })` / `removeGuarantee({ gachaId, id })` / `updateGuarantee({ gachaId, id, patch })`。
- `persist({ gachaId })` — デバウンス付きで `saveFor` を呼ぶ。

### 6.3 Tailwind レイアウト指針
- ルート: `flex flex-col gap-4 rounded-2xl border border-border/60 bg-surface/80 p-4 shadow-elevated`。
- 行レイアウト: `grid grid-cols-[auto,minmax(0,1fr)] gap-4 items-start sm:grid-cols-[12rem,1fr]`。モバイルは 1 列化。
- 入力: `w-full rounded-xl border border-border bg-panel-2 px-3 py-2 text-base font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-accent`。
- ボタン: `btn` 系ユーティリティ (`inline-flex items-center justify-center rounded-xl bg-gradient-to-b from-accent to-accent-2 text-white shadow-elevated`).
- リスト: `space-y-3`, 行: `grid grid-cols-[minmax(0,1fr),auto] items-center gap-3 rounded-xl border border-dashed border-accent/40 bg-panel-2/60 px-3 py-3`。

## 7. イベント / フロー
1. **マウント時**: `usePtControls` が `loadAll()` を呼び出し、Context state を初期化。`rarity_tab_selected` から選択ガチャ ID を読み取る。
2. **タブ切替**: `rarity:tab:changed` カスタムイベントを React 側の EventBridge Hook で購読し、`setSelectedGacha` を dispatch。
3. **入力変更**: 数値・セレクト変更は直ちに state 更新。`useDebouncedEffect` で 300ms 後に `persist` を呼び出す。
4. **バンドル/保証追加**: `uuid` で行 ID を生成し state に追加。初期行は `pt=0` 等で生成し、`useEffect` で最初の入力へフォーカスする。
5. **外部更新** (`gacha:data:updated`): hydrating して現在の gachaId の設定を再描画。
6. **互換保存**: `persist` が `saveAll()` を呼び、window/AppState/localStorage を更新。旧 `gacha_global_setting_v1` が存在する場合は読み込み時にマージし、新形式へ保存する。

## 8. マイグレーション手順
1. `packages/domain/pt-controls` を追加し、TypeScript 型・サービス・reducer を実装。既存 JS のロジックを TypeScript へ移植。
2. React アプリの `features/rarity/PTControlsPanel.tsx` に上記コンポーネント群を実装。`useEffect` でイベントブリッジを設定。
3. Tailwind テーマに `bg-surface`, `bg-panel-2`, `border-border`, `shadow-elevated`, `text-foreground`, `accent` などのトークンを追加。`index.css` の変数値を Tailwind カスタムカラーに移植する。
4. 既存 HTML から `pt-controls.js` の読み込みを削除し、React ルート内で `PtControlsPanel` を配置。
5. Storybook に `PtControlsPanel` のダミーシナリオ（空設定、既存バンドル、複数保証）を追加。
6. 回帰テストとして、旧 UI からエクスポートされた JSON を読み込んだ際に PT 設定が保持されることを E2E で確認する。

## 9. テスト計画
- **ユニット**: reducer が各アクションで期待通りの state を返す。`persist` が save サービスを正しく呼ぶ。
- **統合**: `usePtControls` Hook をテストし、`rarity:tab:changed` イベントに応じて state が切り替わることを確認。
- **UI**: React Testing Library でフォーム入力 → debounced 保存が発火すること、削除ボタンで行が除去されることを検証。
- **E2E**: Playwright で複数ガチャ間の切替と自動保存を検証し、設定が localStorage に書き込まれていることを確認。

## 10. 移行後仕様
- PT 設定は React Context `PtControlsProvider` で一元管理し、他機能からは `usePtControlsSetting(gachaId)` で読み取り可能とする。
- UI は Tailwind ベースのレスポンシブグリッドで構成され、モバイル幅では縦並び、デスクトップでは 2 列構成を維持する。
- バンドル・保証行はそれぞれ独立したコンポーネントで、削除ボタンは `aria-label` を持ち、キーボード操作に対応する。
- 永続化は `saveAll` の成功時に状態が `idle` に戻り、UI の AutoSaveIndicator が "保存済み" を示す。エラー時はリトライボタンとトーストを表示。
- 外部から `rarity:tab:changed` / `gacha:data:updated` イベントを受けても、React 側が状態を正しく同期し手動リフレッシュは不要になる。

