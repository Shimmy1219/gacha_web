# モーダル描画のパフォーマンス調査（コードベース分析）

## 調査の前提
- この環境では Chrome DevTools MCP が利用できないため、実測の Performance Insights / Memory / Rendering 結果は取得できませんでした。
- 代わりにコードベースの静的分析から、モーダル表示時の重さにつながりうる要因を洗い出しています。

## 主要な疑わしい要因
### 1) モーダル開閉で広範囲の再レンダリングが起きる構造
- `ModalProvider` が `stack` を含む context を提供しており、`useModal()` を使う全コンポーネントが `stack` 更新のたびに再レンダリングされます。
- `apps/web/src/pages/gacha/components/items/ItemsSection.tsx` や `users`, `rarity`, `riagu` など大きめのセクションも `useModal()` を使用しており、**モーダルを開くだけで重い一覧コンポーネントが再レンダリング**される可能性があります。
- 特にアイテム一覧は DOM 数が多くなりがちなので、モーダル開閉のたびにリスト全体が描画し直されると重くなります。

### 2) 景品詳細モーダルでのアセットプレビュー読み込み
- `PrizeSettingsDialog` のリスト内で `useAssetPreview()` を各アセットに対して呼んでいます。
- `useAssetPreview()` は `loadAssetPreview()` を呼び出し、**Blob を Object URL に変換して `<img>/<video>` に流す**ため、
  アセット数が多いと **非同期 I/O + Blob 生成 + URL 生成**が一気に発生します。
- この処理はモーダルの初期表示と同時に走るため、「開くのが遅い」「メモリが増える」といった症状に直結しやすいです。

### 3) backdrop-filter (blur) による描画負荷
- `ModalOverlay` と `ModalPanel` に `backdrop-blur` が設定されています。
- 画面全体に blur をかけるため GPU/ペイントの負荷が高く、
  **低スペック端末や要素数が多い画面で特に重さが出やすい**です。

### 4) `ModalPanel` の viewport 計測による Layout
- `useModalViewportMetrics()` が `useLayoutEffect` で `getComputedStyle` を呼び、
  `visualViewport` イベントに応じて state 更新 → layout 再計算が走ります。
- 1回あたりは軽いですが、**モーダル表示時はこの計測が必ず走る**ため、
  上記の再レンダリングや blur と組み合わさると影響が出る可能性があります。

## 追加で疑わしいポイント
- `ItemsSection` でモーダルを開く際、`assignmentUsers` を毎回組み立てています。
  大量のユーザー履歴がある場合は `assignmentUsersMap` 構築が重くなる可能性があります。

## DevTools での確認ポイント（手動での再計測推奨）
- Performance → Record → モーダルを開く（StartWizard / PrizeSettings）
  - **Main Thread** の長いタスクが `Rendering` / `Scripting` のどちらに偏るか
  - `Layout` / `Recalculate Style` が異常に大きいか
  - **Performance Insights** で “Long task”, “Forced reflow”, “Large layout shift” が出るか
- Memory → Heap Snapshot
  - モーダル開閉前後で `Blob` / `ArrayBuffer` / `Detached DOM` が増えていないか
- Rendering → “Paint flashing” / “Layer borders”
  - blur による repaint の広さを視覚化
- React DevTools Profiler
  - モーダル open で `ItemsSection` / `UserSection` などが再レンダリングされていないか

## 改善案（実装未着手）
1. **Modal Context を分離**
   - `stack` を読む Hook と `push/pop` のアクション Hook を分離し、
     大きいコンポーネントは `push` だけを購読するようにする。
2. **アセットプレビューの遅延ロード**
   - モーダル表示直後に全件読み込まず、
     画面内に表示される分だけ `useAssetPreview()` を呼ぶ（IntersectionObserver など）。
3. **Backdrop blur の段階的無効化**
   - モーダル初回表示中だけ blur を外す、
     または端末性能に応じて blur を無効化する。

## 次のアクション候補
- 実際の DevTools MCP / 手動計測で、
  **「モーダル開閉 → ItemsSection 再レンダリング」**が起きているかを確認。
- もし再レンダリングが確認できれば、`useModal` の分離修正が最優先。
