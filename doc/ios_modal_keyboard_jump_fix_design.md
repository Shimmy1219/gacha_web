# iOS モーダル入力時の画面外ジャンプ修正設計

## 1. 背景

iPhone / iPad でモーダル内の `input` をフォーカスし、ソフトウェアキーボードが表示された瞬間、または文字入力中に、対象フィールドが画面上部の可視領域外へ飛ぶ。

再現が多い箇所:

- サイト設定 > オーナー名
- サイト設定 > 配信アプリからの還元率
- サイト設定 > 登録済みガチャ名の編集（`autoFocus`）

## 2. 原因整理（確定）

### 2.1 PageSettingsDialog の高さ再計算がキーボード表示と衝突

`PageSettingsDialog` は `window.resize` を監視し、`window.innerHeight - 192px` を基準に `minHeight/maxHeight` を都度更新している。

- `VIEWPORT_PADDING_REM = 12`（= 192px）
- `updateViewport()` で `viewportMaxHeight` を更新
- `ModalBody` に `minHeight/maxHeight` を inline style で適用

対象:

- `apps/web/src/modals/dialogs/PageSettingsDialog.tsx`

iOS はキーボード表示・予測変換・候補バー変化で可視ビューポートが細かく変動するため、再レイアウトが連鎖し、スクロール位置とフォーカス保持が不安定になる。

### 2.2 fixed モーダル配置が visual viewport のオフセットを考慮していない

モーダルは `fixed inset-0` の中央寄せ配置。

- `apps/web/src/modals/ModalRoot.tsx`

一方、モーダルのキーボード対応は主に「高さ差分（`innerHeight - visualViewport.height`）」であり、`visualViewport.offsetTop` の変化を考慮していない。

- `apps/web/src/modals/ModalComponents.tsx`

そのため iOS の「可視領域そのものが移動する」ケースで、見かけ上モーダル/入力欄が上に飛ぶ。

### 2.3 scale=1 でも body transform レイヤーが有効

`siteZoomPercent` が 100% でも、`CSS zoom` 非対応環境では `siteZoomMode='transform'` になり、`body` に transform が当たる。

- `apps/web/src/features/theme/SiteThemeProvider.tsx`
- `apps/web/src/index.css`

倍率 1 でも transform コンテキストを作るため、iOS の fixed + keyboard 座標計算の不安定化を助長する。

## 3. 修正方針

### 3.1 基本方針

- キーボード表示中に「JavaScript で高さを押し戻す」実装をやめる
- モーダルの基準を「layout viewport」ではなく「visual viewport」に寄せる
- `zoom=100%` 時は transform レイヤー自体を生成しない

### 3.2 対象範囲

- 優先対応: `PageSettingsDialog`（症状の主戦場）
- 共通基盤: `ModalRoot` / `ModalComponents` / `SiteThemeProvider`

## 4. 詳細設計

## 4.1 P0（最優先・即時反映）

### A. PageSettingsDialog の JS 高さ制御を撤去

変更内容:

1. `viewportMaxHeight` state と `window.resize` 監視 (`updateViewport`) を削除
2. `maxBodyHeight` + `ResizeObserver` ベースの `desiredMinHeight` 算出を削除
3. `ModalBody` の `style={{ minHeight, maxHeight }}` を撤去
4. 高さは CSS で管理する

CSS 方針:

- `page-settings-dialog` は `min-h-0 max-h-full`
- 内部スクロール（`page-settings__content-scroll`）に集約して `overflow-y-auto`
- モバイル時は縦方向の余白を縮小し、キーボードで潰れにくくする

狙い:

- キーボード表示時の `resize` 連鎖で発生するジャンプを止める

### B. モバイル時のモーダル配置を top 寄せへ変更

変更内容:

- `ModalRoot` のコンテナ配置を切替
  - モバイル: `items-start`（上寄せ）
  - デスクトップ: 既存どおり `items-center`

狙い:

- 中央寄せ + キーボード縮退時に上へ押し出される現象を抑える

## 4.2 P1（恒久対策）

### C. visual viewport オフセット追従

変更内容:

- `ModalRoot` に `visualViewport` ベースの `top` / `height` 管理を追加
- `visualViewport.offsetTop` と `visualViewport.height` を監視し、モーダルルートラッパーへ反映

仕様:

- fallback は `top=0`, `height=window.innerHeight`
- 監視は `visualViewport.resize` + `visualViewport.scroll`
- 連続イベントは `requestAnimationFrame` で間引く

狙い:

- iOS で可視領域が移動しても、モーダル自体が同じ可視領域に追従する

### D. zoom=100% 時の transform 無効化

変更内容:

- `applyDocumentZoom()` で `scale === 1` の場合は `siteZoomMode='none'` とし、`zoom`/`transform` の適用を外す
- `index.css` 側は `data-site-zoom-mode='transform'` の場合のみ transform を適用

狙い:

- 不要な transform コンテキストを消し、fixed 要素の座標不安定化を予防

## 4.3 P2（必要時のみ）

### E. モーダル入力フォーカス時の可視化補助

- `onFocus` で `scrollIntoView({ block: 'nearest' })` を導入（対象を PageSettings の主要入力に限定）
- まずは P0/P1 の効果を確認し、未解消時のみ投入

## 5. 実装ステップ

1. `PageSettingsDialog` の高さ再計算ロジック削除（P0-A）
2. `ModalRoot` のモバイル top 寄せ（P0-B）
3. iOS 実機で再現確認（一次）
4. `ModalRoot` の visual viewport 追従（P1-C）
5. `applyDocumentZoom` の no-op transform 無効化（P1-D）
6. iOS 実機で再確認（二次）
7. 必要なら入力フォーカス補助（P2-E）

## 6. 検証計画

必須端末:

- iPhone Safari（最新 iOS）
- iPad Safari（最新 iPadOS）
- iOS PWA（standalone）

確認シナリオ:

1. サイト設定を通常遷移で開く
2. オーナー名入力をフォーカスし、キーボード表示直後の位置を確認
3. 還元率入力で数字連続入力（予測変換バー変動含む）
4. ガチャ名編集（`autoFocus`）開始直後の位置を確認
5. 画面回転（縦横）後に同シナリオを再実施
6. キーボード閉じる/再表示を複数回繰り返す

合格条件:

- 入力欄が可視領域上端の外に飛ばない
- 入力中にフォーカス対象が突然不可視にならない
- 既存デスクトップ表示のモーダル挙動が退行しない

## 7. リスクと対策

- リスク: `PageSettingsDialog` の高さ制御を外すことで desktop の見た目が変わる
  - 対策: desktop は既存クラスを維持し、変更をモバイル条件中心にする

- リスク: visual viewport 追従実装で他ダイアログへ副作用
  - 対策: `ModalRoot` の共通処理に閉じ、E2Eで代表ダイアログ（保存・ガチャ実行・設定）を通す

- リスク: zoom まわりの仕様変更
  - 対策: `siteZoomPercent !== 100` の時だけ既存挙動を維持する条件分岐を追加

## 8. 期待効果

- キーボード出現時/入力中の「フィールドが画面外へ飛ぶ」現象を再現不能レベルまで低減
- iOS 特有の visual viewport 変動に対して、モーダル共通基盤として耐性を持たせる
- PageSettingsDialog 以外の入力モーダルでも再発予防が可能
