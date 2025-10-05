# Modal Components React 移行詳細計画

## 1. 目的
- 既存の `index.html` に散在する 8 種類のモーダル（開始、ガイド、リアルタイム入力、景品設定、リアグ設定、ガチャ削除、アイテム削除、保存オプション）を React + Tailwind CSS へ集約し、共通のベースコンポーネントを構築する。旧カタログ貼り付けモーダルは導線がなくなったため、React 移行時に削除する。【F:index.html†L291-L517】
- `modal` / `dialog` クラスに依存する現在の表示・レイアウト・スタッキング制御を Tailwind ユーティリティと React 状態管理へ移し、重複コードとグローバル副作用を削減する。【F:index.css†L31-L141】【F:index.html†L1727-L1758】
- モーダル機能を `ModalProvider` として抽象化し、今後追加されるダイアログでも再利用できる設計を整える。React 全体構成のモーダルホスト方針と整合させ、各機能フォルダで具体モーダルを保守できるようにする。【F:doc/react_migration_plan.md†L174-L176】

## 2. 現状整理
- **Start Modal (`#startModal`)**: TXT/JSON 読込と新規開始タイル、ファイル入力、閉じるボタンを提供するオンボーディング入口。【F:index.html†L291-L325】
- **Catalog Paste (`#catalogModal`)**: 現在は導線がなく、React 移行後に削除予定。カタログ解析ロジックは別のインポート手段へ統合する。【F:index.html†L328-L344】
- **Guide (`#guideModal`)**: 次のステップ案内のみのシンプルな承諾ダイアログ。【F:index.html†L346-L357】
- **Live Paste (`#liveModal`)**: リアルタイム結果テキスト入力と反映ボタンを提供する大きなテキストエリアモーダル。【F:index.html†L360-L371】
- **Prize Settings (`#imageModal`, 移行後 `PrizeSettingsDialog`)**: 対象情報、プレビュー、ファイル選択、保存・閉じる操作をまとめた最大幅 880px の 2 カラムレイアウトモーダル。React 移行時に景品名・レアリティ入力、プレビュー、ファイル選択、「ピックアップ対象」「コンプリートガチャ対象」トグル、リアグ設定起動ボタンを内包する仕様へ拡張する。【F:index.html†L374-L415】
- **Riagu (`#riaguModal`)**: リアグ原価・タイプ入力、保存/解除/閉じるボタンを備える設定モーダル。【F:index.html†L417-L435】
- **Gacha Delete (`#deleteModal`)**: ガチャ削除確認とターゲット表示、キャンセル/削除ボタンを持つ確認ダイアログ。【F:index.html†L439-L448】
- **Item Delete (`#itemDeleteModal`)**: アイテム削除確認、警告表示、キャンセル/削除ボタン。【F:index.html†L452-L467】
- **Save Options (`#saveOptionModal`)**: 保存手段カード、アップロード結果表示、閉じる操作で構成される複合モーダル。【F:index.html†L474-L517】

### 2.2 現在の表示制御
- `.modal` は `display:none` → `.show` で grid 表示、`position:fixed`、オーバーレイ背景を提供し、`.dialog` はボーダー・角丸・影などのベーススタイルを担っている。【F:index.css†L124-L130】
- `open(modal)` / `close(modal)` 関数がクラス切り替え・`aria-hidden` 更新・モーダル数カウント・`body.modal-open` の付与を行い、FAB の表示抑止など他機能へ影響している。【F:index.html†L1727-L1758】【F:index.css†L424-L437】
- DOMContentLoaded 後に各モーダルへ開閉イベントがバインドされており、外部スクリプトからも `openXxxModal` 系関数で直接操作される構造になっている。【F:index.html†L838-L929】【F:index.html†L1751-L1758】【F:index.html†L1207-L1334】

### 2.3 技術的課題
- 開閉状態がグローバル関数と DOM 参照に依存し、React 化時に二重管理が発生しやすい。
- スタイルは共通 CSS クラスで固定されており、Tailwind へ移行する際にテーマトークン（背景・影・ボタン）を再定義する必要がある。【F:index.css†L2-L45】
- モーダルごとにフォーム状態やサービス呼び出しを直接参照しており、React ストアや Hook への置き換え計画が必要。

## 3. React + Tailwind への移行方針
1. `apps/web/src/components/modal/` に `ModalRoot`, `ModalOverlay`, `ModalPanel` などのベースコンポーネントを実装し、Tailwind プリミティブで共通スタイルを定義する。【F:doc/react_migration_plan.md†L21-L37】【F:doc/react_migration_plan.md†L174-L176】
2. `ModalProvider`（Context + reducer）でモーダルスタックを管理し、`useModal()` Hook から `push`, `replace`, `pop` 操作を提供する。`body.modal-open` の代わりに `useEffect` でスクロールロックと `aria-hidden` 管理を行う。【F:index.html†L1727-L1758】
3. Tailwind テーマへ `bg-surface`, `bg-surface-muted`, `border-border`, `shadow-elevated`, `text-muted`, `accent` などを追加し、既存 CSS 変数を移植する。【F:index.css†L2-L45】
4. 各具体モーダルは `apps/web/src/features/<domain>/dialogs/` に配置し、ドメインストア・サービス Hook と連携する。既存関数のロジックは対応する feature hook へ移す。

## 4. データモデリング
### 4.1 ベースモーダル型
```ts
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalBaseProps<T = unknown> {
  id: string;
  title: string;
  size?: ModalSize;
  description?: string;
  dismissible?: boolean;
  payload?: T;
  onClose?: () => void;
}
```
- `size` で `max-w-md`〜`max-w-5xl` を制御し、従来の `.dialog` 幅（`min(880px,96vw)`）を `lg` / `xl` バリアントに対応させる。【F:index.css†L127-L130】
- `payload` は `ModalProvider` が push 時に渡すデータで、削除確認などが対象 ID を受け取れるようにする。【F:index.html†L1207-L1316】

### 4.2 コンテキスト状態
```ts
interface ModalStackEntry {
  component: React.ComponentType<any>;
  props: ModalBaseProps<any>;
}

interface ModalState {
  stack: ModalStackEntry[];
  modalCount: number; // body スクロール制御用
}
```
- `modalCount` を維持して複数同時表示にも対応。既存の `modalCount` ロジックを React に置き換える。【F:index.html†L1727-L1739】
- `ModalProvider` は `useReducer` で `push`, `pop`, `replace`, `dismissAll` を処理し、`useEffect` で `document.body.dataset.modalOpen = stack.length ? '1' : '0'` を更新する。

## 5. コンポーネント分解計画
### 5.1 共通コンポーネント
- `ModalRoot`: ポータル先（`#modal-root`）にレンダリングし、背景オーバーレイと ARIA 属性を制御する。
- `ModalOverlay`: `fixed inset-0 bg-black/65 backdrop-blur-sm transition-opacity` でフェードイン/アウト。クリックで `onDismiss` を呼ぶ。
- `ModalPanel`: サイズバリアントごとの `max-w` と `p-6` を適用し、`rounded-2xl border border-border bg-surface shadow-elevated` で統一する。【F:index.css†L31-L45】【F:index.css†L124-L130】
- `ModalHeader`, `ModalBody`, `ModalFooter`: タイトル・説明文・ボタンエリアの配置ユーティリティ。`space-y-4` や `flex justify-end gap-3` を提供。

### 5.2 機能別モーダル
1. **StartWizardDialog** (`features/onboarding/dialogs/StartWizardDialog.tsx`)
   - Props: `onPickTxt`, `onPickJson`, `onCreateNew`, `onDismiss`。
   - `StartTile` サブコンポーネントでカード UI を再現し、`grid grid-cols-1 sm:grid-cols-3 gap-4` を採用。【F:index.html†L297-L315】
   - ファイル入力は `HiddenFileField` コンポーネントへ抽象化する。
2. **CatalogImportDialog**（削除対象）
   - 旧カタログ貼り付けモーダルの React 実装は作成せず、ガチャ一括登録は別のインポート UI（`features/importers/pages/CatalogUploadPage` など）へ統合する。
   - 既存の `parseCatalogModal` 関連ハンドラは廃止し、React 移行時に `CatalogImportDialog` へのルーティングを削除する。【F:index.html†L328-L344】【F:index.html†L842-L854】
3. **GuideInfoDialog** (`features/onboarding/dialogs/GuideInfoDialog.tsx`)
   - シンプルな情報 + プライマリボタン。`text-muted` 表現。【F:index.html†L346-L356】
4. **LivePasteDialog** (`features/realtime/dialogs/LivePasteDialog.tsx`)
   - `liveText`, `onApply`。`textarea` とアクションボタンを `flex justify-end gap-3` に配置。【F:index.html†L360-L369】
5. **PrizeSettingsDialog** (`features/items/dialogs/PrizeSettingsDialog.tsx`)
   - Context: `usePrizeSettings(itemId)` で景品名、レアリティ、プレビュー情報、トグル状態を取得する。
   - レイアウト: `grid gap-6 lg:grid-cols-[minmax(0,1fr),minmax(0,1fr)]` でプレビュー（左）とファイル選択（右）を分割し、フォームヘッダーに景品名・レアリティ入力を配置。プレビュー枠は `bg-surface-muted border border-border rounded-2xl p-4` で画像とメタ情報を表示し、右列に `FileDropZone`、`PickFromLibraryButton` を配置する。【F:index.html†L392-L411】
   - 「ピックアップ対象」「コンプリートガチャ対象」のトグルスイッチは `Switch` コンポーネントで実装し、状態を `usePrizeSettings` へバインドする。画像 URL フォームは廃止する。
   - フッターには `SaveButton`, `OpenRiaguDialogButton`, `CloseButton` を並べ、閉じるボタン押下時は確認アラート（「景品設定に戻る」「閉じる」）を表示する。確認アラートは `ModalProvider` の `push` を使い、変更が破棄される旨を明示する。
6. **RiaguConfigDialog** (`features/riagu/dialogs/RiaguConfigDialog.tsx`)
   - 入力検証: 数値/文字列。保存・解除・閉じるボタンの配置は `flex justify-end gap-3`。【F:index.html†L424-L435】
7. **GachaDeleteConfirmDialog** (`features/gacha/dialogs/GachaDeleteConfirmDialog.tsx`)
   - Props: `gachaId`, `gachaName`, `onConfirm`。
   - Danger ボタンを `variant="destructive"` で赤系に。【F:index.html†L439-L448】
8. **ItemDeleteConfirmDialog** (`features/items/dialogs/ItemDeleteConfirmDialog.tsx`)
   - 警告表示を `text-error` と `bg-error/10 border-error/30` のアラートボックスに変換。【F:index.html†L452-L466】
9. **SaveOptionsDialog** (`features/users/dialogs/SaveOptionsDialog.tsx`)
   - 3 カードを `grid sm:grid-cols-3 gap-4` で表示（デバイス保存、shimmy3.com アップロード、Discord 直接送信）。Discord カードは shimmy3.com へ ZIP をアップロードし、そのリンクを Discord リスナーへ転送するフローを説明する。
   - アップロード結果セクションは `grid grid-cols-[minmax(0,1fr),auto]` でリンクとコピーを整列し、各カードに `CTAButton` を配置する。【F:index.html†L479-L515】

## 6. Tailwind デザイン指針
- カラートークンは `tailwind.config.ts` の `extend.colors` に `surface`, `surface-muted`, `border`, `accent`, `accent-dark`, `muted` を登録し、既存 CSS 変数と一致させる。【F:index.css†L2-L45】
- ボタンは `btn` コンポーネント（`inline-flex items-center justify-center font-bold rounded-xl`）で `variant="primary|subtle|ghost|danger|small"` を用意し、既存クラスのスタイルを Tailwind ユーティリティで置換する。【F:index.css†L31-L45】
- モーダルパネルは `max-w-lg`, `max-w-2xl`, `max-w-4xl`, `max-w-5xl` などのユーティリティを `ModalSize` に対応させる。
- テキストフィールド/テキストエリアは `rounded-xl border border-border bg-surface-muted px-3 py-2 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40` を標準化する。【F:index.css†L136-L138】

## 7. アクセシビリティ & インタラクション
- `Dialog` は `role="dialog" aria-modal="true"` を自動付与し、`aria-labelledby` / `aria-describedby` を `ModalHeader` で生成する。【F:index.html†L293-L377】
- フォーカストラップは Headless UI の `Dialog` もしくは自前の `FocusTrap` Hook を利用し、開閉時に最初のフォーカス可能要素へ移動する。
- `Esc` キー・オーバーレイクリックでの閉鎖、タブインデックス制御、スクロールロック（`overflow-hidden`）を `ModalProvider` が統合的に管理する。
- 複数モーダル同時表示時でも最前面だけがフォーカスされるよう z-index を `modal-base (z-50)`、FAB は `z-70` に設定し `body[data-modal-open="1"]` で表示抑止を再現する。【F:index.css†L424-L437】

## 8. 状態とサービス連携
- Onboarding/Import/Realtime は `useOnboardingFlow`, `useImportJobs`, `useRealtimePaste` などの Hook からモーダルを起動し、完了時に `AppStateStore` を更新する。
- アイテム画像・リアグ設定・削除系は `ImageAssetStore`, `RiaguStore`, `AppStateStore` の reducer アクションへ接続し、現在の同期ロジックを React 版へ移植する。【F:index.html†L1207-L1334】【F:index.html†L1341-L1679】
- 保存オプションは `useSaveJob` Hook で ZIP 保存・Blob アップロードを扱い、アップロード結果を Context 経由で共有する。

## 9. 移行ステップ
1. `ModalProvider` / ベース UI を作成し、Storybook にプレビューを追加。
2. Onboarding モーダル（Start, Guide）を React へ移植し、既存 DOM から該当セクションを削除。
3. リアルタイム貼り付けモーダルを React 化し、`parseLiveInput` など既存ユーティリティを Hook へ再配置する。【F:index.html†L360-L371】【F:index.html†L1812-L1820】
4. カタログ貼り付けモーダルの DOM・イベントバインディングを撤去し、必要なロジックは別ページ用サービスへ移す。【F:index.html†L328-L344】【F:index.html†L842-L854】
5. 景品設定・リアグ・削除確認モーダルを順次置換し、旧 `openXxxModal` 関数を `ModalProvider` 経由の呼び出しに書き換える。【F:index.html†L374-L1343】
6. 保存オプションモーダルと FAB 連携を React へ移行し、`body.modal-open` 依存を排除。【F:index.css†L424-L437】
7. 最後に `index.html` の静的モーダル DOM と関連スクリプトを削除し、Tailwind クラスへの完全移行を確認する。

## 10. テスト計画
- **ユニットテスト**: `ModalProvider` reducer の push/pop、スクロールロック、副作用を Vitest で検証。
- **コンポーネントテスト**: React Testing Library で各モーダルのレンダリング、フォーカス移動、ボタン操作、エラーメッセージ表示を確認する。
- **統合テスト**: Storybook/Chromatic で視覚回帰、Playwright で「アイテムカード → 画像設定モーダル → 保存」「ユーザー保存 → 保存オプション」など主要フローを自動化。【F:index.html†L908-L1018】【F:index.html†L974-L1017】
- **アクセシビリティ**: axe-core で `role`, `aria-*`, ランドマーク、コントラストを検証。スクリーンリーダーでの読み上げ順を確認。

## 11. リスクと対策
- **複数モーダルの競合**: Stack 制御の不整合でスクロールロックが解除されない可能性。→ reducer と副作用をテストでカバーし、`finally` 的 cleanup を徹底。
- **サービス呼び出しの同期漏れ**: React ストア移行時に旧グローバル関数と二重更新が起こる可能性。→ 各機能移行フェーズで旧関数を段階的に削除し、`ModalProvider` からのみ開閉できるようにする。
- **Tailwind クラス肥大化**: モーダル固有のクラスが散在するとビルドが膨らむ。→ `clsx` + variant パターンを導入し、共通スタイルを `ModalPanel` に集約。
- **フォーカス制御の欠落**: 自前実装でフォーカストラップが崩れる恐れ。→ Headless UI の `Dialog` をベースとし、最低限 `focus-trap` を導入する。
