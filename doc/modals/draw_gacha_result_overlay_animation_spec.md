# ガチャ結果サムネイル演出 詳細設計（DrawGachaDialog）

## 1. 目的
- `DrawGachaDialog` で抽選確定後に、結果サムネイルを順番に表示する演出を追加する。
- 既存の「結果テキスト一覧（集計）」は維持しつつ、演出レイヤーを追加して視認性と体験を向上する。
- 要件: 左上から右方向に並べ、端を超えたら改行、下端を超えたらスクロール表示、画像下にレアリティ/アイテム名、音声は `♫` 表示。

## 2. 対象範囲
- 対象 UI: `apps/web/src/modals/dialogs/DrawGachaDialog.tsx`
- 対象スタイル: `apps/web/src/index.css`
- 非対象:
  - 抽選確率ロジックそのものの仕様変更
  - `apps/web/src/logic/gacha/engine.ts` の戻り値変更
  - 共有（X/Discord）フォーマット変更
  - ガチャ外画面（ItemsSection 等）の UI 変更

## 3. 要件を満たす画面フロー
1. ユーザーが「ガチャを実行」ボタンを押下。
2. 抽選処理が完了し、既存の集計結果（`resultItems`）を確定。
3. モーダル上に、既存 UI の上から半透明オーバーレイを表示。
4. `resultItems` を UI 側で件数分に展開したカード列を 1 件ずつ順番に出現させる。
5. サムネイルカードは左上起点で横並び、はみ出し時に折返し。
6. 下方向にはみ出す場合はオーバーレイ内で縦スクロール。
7. 各カード下に「レアリティ」「アイテム名」を表示。
8. 音声アイテムは画像を使わず、正方形枠中央に `♫` を表示。

## 4. 状態設計（DrawGachaDialog）
### 4.1 追加 state
```ts
interface DrawRevealCardModel {
  revealIndex: number;
  itemId: string;
  name: string;
  rarityId: string;
  rarityLabel: string;
  rarityColor?: string;
  guaranteed: boolean;
  assetId: string | null;
  thumbnailAssetId: string | null;
  digitalItemType: DigitalItemTypeKey | null;
}

const [isRevealOverlayVisible, setIsRevealOverlayVisible] = useState(false);
const [revealCards, setRevealCards] = useState<DrawRevealCardModel[]>([]);
const [revealedCount, setRevealedCount] = useState(0);
const [isRevealAnimating, setIsRevealAnimating] = useState(false);
const revealTimerRef = useRef<number | null>(null);
```

### 4.2 状態遷移
- `idle`（演出なし）
- `executing`（抽選処理中）
- `reveal-ready`（集計結果からカード配列生成済み）
- `revealing`（順次表示中）
- `revealed`（全件表示完了）
- `dismissed`（オーバーレイを閉じて通常結果表示へ）

### 4.3 遷移トリガー
- 抽選成功時: `idle -> reveal-ready -> revealing`
- 最後のカード表示時: `revealing -> revealed`
- 「スキップ」押下: `revealing -> revealed`（即時全表示）
- 「閉じる」押下: `revealed -> dismissed`
- モーダルクローズ/ガチャ変更時: タイマー停止して `idle` へリセット

## 5. 集計結果の擬似展開（engine.ts 変更なし）
`ExecuteGachaResult.items`（アイテム別集計）を UI で展開して演出用カード列を作る。

### 5.1 展開ユーティリティ（`DrawGachaDialog.tsx` 内または分離関数）
```ts
function expandResultItemsToRevealCards(args: {
  aggregatedItems: DrawGachaDialogResultItem[];
  itemAssetById: Map<string, { assetId: string | null; thumbnailAssetId: string | null; digitalItemType: DigitalItemTypeKey | null }>;
  rarityOrderIndex: Map<string, number>;
  itemOrderIndex: Map<string, number>;
}): DrawRevealCardModel[]
```

### 5.2 擬似順序ルール
1. まず `aggregatedItems` を既存結果リストと同じ並び順でソート。
   - レアリティ順 (`rarityOrderIndex`)
   - 同レアリティ内はアイテム順 (`itemOrderIndex`)
   - 最後に名前昇順
2. 各アイテムを `count` 回だけ複製して 1 次元配列へ展開。
3. `guaranteedCount` がある場合、各アイテムの先頭 `guaranteedCount` 件を `guaranteed: true` に設定。
4. 最後に `revealIndex` を 0..N-1 で採番。

### 5.3 注意点（仕様）
- この並びは「演出用の疑似順序」であり、実際の抽選順ではない。
- 要件として許容されるため、`engine.ts` の API は変更しない。

## 6. アイテム資産（サムネイル）解決
### 6.1 解決元
- `catalogState.byGacha[selectedGachaId].items[itemId].assets[0]` を primary asset として参照。
- `assetId`, `thumbnailAssetId`, `digitalItemType` を `Map<itemId, AssetMeta>` 化して使用。

### 6.2 解決規則
1. `assets[0]` が存在する場合:
   - `assetId`: `assets[0].assetId`
   - `thumbnailAssetId`: `assets[0].thumbnailAssetId ?? null`
   - `digitalItemType`: `assets[0].digitalItemType ?? null`
2. `assets[0]` が無い場合はすべて `null`。

### 6.3 音声判定
- 優先判定: `digitalItemType === 'audio'`
- 補助判定: `useAssetPreview(...).type?.startsWith('audio/')`
- どちらか真なら音声扱い。

## 7. UI 構成
### 7.1 レイアウト階層
`DrawGachaDialog` を以下の構成へ整理。

```tsx
<div className="draw-gacha-dialog__frame relative flex min-h-0 flex-1 flex-col" id="draw-gacha-dialog-frame">
  <ModalBody className="draw-gacha-dialog__body ...">...</ModalBody>
  <ModalFooter className="draw-gacha-dialog__footer ...">...</ModalFooter>

  {isRevealOverlayVisible ? (
    <DrawResultRevealOverlay
      cards={revealCards}
      revealedCount={revealedCount}
      isAnimating={isRevealAnimating}
      onSkip={...}
      onClose={...}
    />
  ) : null}
</div>
```

### 7.2 新規サブコンポーネント
- `apps/web/src/modals/dialogs/draw-result/DrawResultRevealOverlay.tsx`
- `apps/web/src/modals/dialogs/draw-result/DrawResultRevealCard.tsx`

責務:
- Overlay: 半透明背景、スクロールコンテナ、進捗表示、操作ボタン
- Card: サムネイル/音声プレースホルダー、レアリティ、アイテム名

### 7.3 命名規則（新規 class / id）
- ルート: `draw-gacha-result-overlay`（`id`）
- ブロック: `draw-gacha-result-overlay__*`
- カード: `draw-gacha-result-card__*`
- 音声枠: `draw-gacha-result-card__audio-placeholder`

※ 既存規約に合わせ、固有 class を先頭に置き、その後 Tailwind ユーティリティを連結する。

## 8. 並び・スクロール仕様
### 8.1 配置アルゴリズム
- CSS `flex-wrap` による左上起点の横並び折返しを採用。
- カードは固定幅（例: `--draw-result-card-size: 116px`）の正方形サムネイル + テキストエリア。

### 8.2 CSS 仕様（要点）
```css
.draw-gacha-result-overlay__grid {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 12px;
  overflow-y: auto;
  overflow-x: hidden;
  max-height: 100%;
}

.draw-gacha-result-card {
  width: var(--draw-result-card-size, 116px);
  min-width: var(--draw-result-card-size, 116px);
}

.draw-gacha-result-card__thumb {
  aspect-ratio: 1 / 1;
}
```

- これにより「右端で折返し」「下端でスクロール」を満たす。

## 9. アニメーション仕様
### 9.1 オーバーレイ
- フェードイン: `160ms ease-out`
- 背景: `bg-black/55` + `backdrop-blur-[1px]`

### 9.2 カード出現
- 表示間隔: `90ms`（既定）
- カード自体: `opacity 0 -> 1`, `transform translateY(8px) scale(0.96) -> translateY(0) scale(1)`
- 1カードのアニメーション長: `220ms`

### 9.3 低モーション環境
- `prefers-reduced-motion: reduce` 時は全件即時表示（`revealedCount = cards.length`）。

### 9.4 スキップ
- 「スキップ」押下でタイマー停止、全件即時表示。

## 10. 音声アイテム表示仕様
- 音声カードのサムネイル領域は以下を表示:
  - 正方形枠
  - 中央寄せ `♫`
  - 補助ラベル（任意）`AUDIO`
- `<audio controls>` は演出中は表示しない（情報過多と高さ崩れ回避のため）。
- 画像未設定の非音声は既存 `ItemPreview` の no-image 表示を利用。

## 11. 既存 UI との共存
- 演出オーバーレイ表示中は、背面（既存結果リスト/共有ボタン）はクリック不可。
- 演出終了後はオーバーレイを閉じて既存結果ブロックをそのまま操作可能。
- 既存の `resultItems` 集計表示、共有機能、Discord 送信機能は変更しない。

## 12. エラーハンドリング
- プレビュー取得失敗時:
  - 画像: no-image 表示
  - 音声: `♫` 表示は維持（`digitalItemType` ベースで成立）
- タイマーは必ず cleanup で解放し、メモリリークを防止。
- モーダルクローズ時に演出中でも安全に終了できるよう `isMounted` ガードを入れる。

## 13. テスト設計
### 13.1 ユーティリティ（Vitest）
- `expandResultItemsToRevealCards` のテストを追加。
  - `count` 件数ぶん展開される。
  - `guaranteedCount` が先頭から `guaranteed: true` になる。
  - `revealIndex` が連番になる。

### 13.2 UI（React Testing Library）
- `DrawGachaDialog` 抽選成功後に `draw-gacha-result-overlay` が表示される。
- タイマー経過で `revealedCount` が増える（`vi.useFakeTimers()`）。
- スキップ押下で即時全件表示。
- 音声アイテムカードに `♫` が表示される。
- カード数が多いとき `draw-gacha-result-overlay__grid` に `overflow-y: auto` が適用される。

### 13.3 回帰観点
- 既存の結果集計表示（件数・保証数・共有導線）が壊れない。
- 抽選失敗時にオーバーレイが表示されない。

## 14. 実装ステップ
1. `DrawGachaDialog.tsx` に集計結果展開ユーティリティと演出 state を追加。
2. `DrawResultRevealOverlay` / `DrawResultRevealCard` を新規作成。
3. `index.css` に `draw-gacha-result-overlay__*` とアニメーション keyframes を追加。
4. ユーティリティテストと UI テストを追加。
5. `npm run test` と編集ファイル対象の `eslint` を実行。

## 15. 今回の設計上の判断
- 実抽選順ではなく「擬似順序」で十分という要件のため、`engine.ts` は変更しない。
- レイアウトは JS 座標計算より CSS `flex-wrap + overflow-y:auto` が堅牢で、レスポンシブ時の破綻が少ない。
- 音声は視覚情報が少ないため、演出では `♫` に限定して密度を抑える。
