# サイト設定「ズームスライダー」詳細設計

## 1. 目的
- サイト設定モーダルの「レイアウト」タブ内（デスクトップレイアウト項目の下）に、サイト要素の拡大率を調整できるスライダーを追加する。
- 動作イメージはブラウザのズーム機能に近づけ、`50%`〜`100%` の範囲で表示密度を調整可能にする。
  - `100%`: 通常表示（既存表示）
  - `50%`: 表示を縮小（より多くの情報を1画面に表示）

## 2. 要件整理

### 2.1 機能要件
1. レイアウトタブにスライダー UI を追加する。
2. スライダーは `min=50`, `max=100`（整数）で操作できる。
3. 変更時にサイト表示へ即時反映する。
4. 設定は永続化され、次回訪問時にも復元される。
5. `100%` をデフォルト値とする。

### 2.2 非機能要件
- 既存テーマ適用（`SiteThemeProvider`）と干渉しない。
- モーダルやヘッダーなど既存固定要素の挙動を壊さない。
- 既存の永続化スキーマ（`uiPreferences`）との互換性を維持する。

## 3. 変更対象（ファイル単位）

1. `apps/web/src/domain/stores/uiPreferencesStore.ts`
- ズーム設定の定数・正規化関数・getter/setter を追加。

2. `apps/web/src/features/theme/SiteThemeProvider.tsx`（または新規 `SiteZoomProvider.tsx`）
- ドキュメントへズーム値を適用する副作用を追加。

3. `apps/web/src/app/AppProviders.tsx`
- 上記 Provider の適用順を調整（新規 Provider を作る場合）。

4. `apps/web/src/modals/dialogs/PageSettingsDialog.tsx`
- レイアウトタブ内にズームスライダー UI を追加。

5. `apps/web/src/index.css`
- ズーム適用用の CSS 変数/フォールバックスタイルを追加。

6. `apps/web/src/domain/app-persistence/types.ts`（任意）
- `UiPreferencesStateV3.appearance` の注釈を追記（型安全のため）。

7. テストファイル（新規）
- `apps/web/src/features/theme/__tests__/siteZoom.test.ts`
- `apps/web/src/modals/dialogs/__tests__/PageSettingsDialog.siteZoom.test.tsx`（必要に応じて）

## 4. データモデル設計

## 4.1 保存先
- `uiPreferences.appearance.siteZoomPercent` に保存。
- 値は整数パーセント（`50`〜`100`）。

```ts
// イメージ
appearance: {
  siteTheme?: 'dark' | 'light' | 'custom';
  customAccentColor?: string;
  customBaseTone?: 'dark' | 'light';
  siteZoomPercent?: number; // 50..100
}
```

## 4.2 定数
`uiPreferencesStore.ts` に以下を追加。

```ts
export const SITE_ZOOM_PERCENT_MIN = 50;
export const SITE_ZOOM_PERCENT_MAX = 100;
export const DEFAULT_SITE_ZOOM_PERCENT = 100;
```

## 4.3 正規化仕様
- 数値へ変換できない場合: `null`
- 小数: 四捨五入して整数化
- 範囲外: `50..100` に clamp

```ts
normalizeSiteZoomPercent(value: unknown): number | null
```

## 4.4 Store API
- `getSiteZoomPercent(): number`
- `setSiteZoomPercent(percent: number, options?: UpdateOptions): void`

`setSiteZoomPercent` の方針:
- state 変更は即時反映
- 永続化は `persist: 'debounced'` を既定
- スライダー操作終了時（`onPointerUp` / `onKeyUp` / `onBlur`）に `persist: 'immediate'` を追加実行する設計も可能

## 5. UI設計（PageSettingsDialog）

## 5.1 配置
- 「レイアウト」タブ内
- 既存の「デスクトップレイアウト」RadioGroup の直下に以下のブロックを追加

## 5.2 表示要素
1. タイトル: `サイト表示倍率`
2. 補足文: `ブラウザのズームと同様に、表示サイズを50%〜100%で調整できます。`
3. スライダー: `input[type="range"]`
4. 現在値: `75%` のような数値表示
5. リセットボタン（任意）: `100%に戻す`

## 5.3 入力仕様
- `min=50`, `max=100`, `step=1`
- `aria-valuemin=50`, `aria-valuemax=100`, `aria-valuenow={current}`
- `id="page-settings-site-zoom-range"`

## 5.4 クラス命名（プロジェクト規約準拠）
- `page-settings__site-zoom-panel`
- `page-settings__site-zoom-header`
- `page-settings__site-zoom-title`
- `page-settings__site-zoom-description`
- `page-settings__site-zoom-controls`
- `page-settings__site-zoom-slider`
- `page-settings__site-zoom-value`
- `page-settings__site-zoom-reset-button`

## 6. ズーム反映エンジン設計

## 6.1 基本方針
- `percent` を `scale = percent / 100` に変換して document 全体へ適用する。
- 100% 以外で即時反映。
- 既存レイアウトへの影響を最小化するため、**ネイティブ `zoom` を優先**し、未対応ブラウザでは CSS transform フォールバックを使う。

## 6.2 適用アルゴリズム

```ts
function applyDocumentZoom(percent: number) {
  const clamped = clamp(round(percent), 50, 100);
  const scale = clamped / 100;
  const root = document.documentElement;

  root.style.setProperty('--site-zoom-scale', String(scale));
  root.style.setProperty('--site-zoom-percent', String(clamped));

  const canUseCssZoom = typeof CSS !== 'undefined' && CSS.supports?.('zoom', '1') === true;

  if (canUseCssZoom) {
    root.dataset.siteZoomMode = 'native';
    root.style.setProperty('zoom', String(scale));
  } else {
    root.dataset.siteZoomMode = 'transform';
    root.style.removeProperty('zoom');
  }
}
```

## 6.3 CSS設計

```css
:root {
  --site-zoom-scale: 1;
  --site-zoom-percent: 100;
}

/* fallback only */
:root[data-site-zoom-mode='transform'] body {
  transform: scale(var(--site-zoom-scale));
  transform-origin: top left;
  width: calc(100% / var(--site-zoom-scale));
  min-height: calc(100% / var(--site-zoom-scale));
}
```

補足:
- `zoom` 利用時は追加 CSS ほぼ不要。
- fallback 時は `body` の拡縮とサイズ補正で「縮小表示 + 情報量増加」を再現する。

## 6.4 適用責務

### 案A（推奨）
`SiteThemeProvider` からズーム副作用を分離し、新規 `SiteZoomProvider` を作成。
- 理由: テーマ適用とズーム適用の責務分離
- 監視対象: `uiPreferences` store
- 実行内容: `applyDocumentZoom(uiPreferences.getSiteZoomPercent())`

### 案B
`SiteThemeProvider` にズーム適用 `useEffect` を追加。
- 変更ファイルが少ないが、責務が肥大化する。

## 7. 挙動仕様（エッジケース）

1. 初回起動時
- `siteZoomPercent` 未保存なら `100%` を適用

2. 不正値保存時
- `NaN`, 文字列, 範囲外値は正規化して `50..100` に丸める

3. モバイル端末
- 要件上は PC 想定だが、実装は共通化可能
- 運用上の安全策として、`isMobile` 時に UI を非表示または read-only にする選択肢を持つ

4. パフォーマンス
- `input` 連続操作でも state 更新は軽量
- 永続化は debounced

## 8. 永続化・互換性
- `uiPreferences` は既存キー `gacha:ui-preferences:v3` を継続利用。
- 新規フィールド追加のみのためストレージバージョン更新は不要。
- 既存データに影響しない後方互換。

## 9. テスト設計

## 9.1 ユニットテスト
`uiPreferencesStore`:
- `getSiteZoomPercent` のデフォルト値（100）
- `setSiteZoomPercent` の clamp（49→50, 101→100）
- 小数丸め（75.6→76）

`siteZoom` 適用関数:
- `data-site-zoom-mode` の切替
- CSS変数 (`--site-zoom-scale`) が正しく設定される

## 9.2 UIテスト
`PageSettingsDialog`:
- スライダーの初期値表示
- スライダー変更で `%` ラベル即時更新
- 100% リセット操作

## 9.3 回帰確認
- 既存のテーマ切替（dark/light/custom）と共存
- モーダル表示位置・スクロール・固定ヘッダーが崩れない
- `/gacha`, `/receive`, `/home` で視認上の破綻がない

## 10. 実装ステップ
1. `uiPreferencesStore` に zoom 定数・normalize・getter/setter を追加
2. `SiteZoomProvider`（新規）作成、または `SiteThemeProvider` に zoom 反映を追加
3. `AppProviders` に Provider を組み込み
4. `PageSettingsDialog` レイアウトタブへスライダー UI 追加
5. `index.css` に zoom 用変数・fallback スタイル追加
6. テスト実装（store / zoom適用 / dialog）
7. 手動確認（Chrome, Firefox）

## 11. 受け入れ基準
- レイアウトタブで 50〜100% を調整できる。
- 50% 時に表示が縮小し、100% 時に通常表示へ戻る。
- ページ再読み込み後も設定が保持される。
- 既存のレイアウト切替・テーマ切替・モーダル表示に回帰がない。
