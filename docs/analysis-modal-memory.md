# Modal メモリ使用量の確認メモ

- `ModalProvider` は `stack` の状態に応じて `document.body` の `overflow` をトグルするが、外部リスナーは追加しておらずクリーンアップが不要な仕組みになっている。`useEffect` がアンマウント時に `overflow` を元に戻すため、モーダル数の増加でリスナーやタイマーが蓄積することはない。
- `ModalRoot` は初回レンダー時に `#modal-root` ノードを作成するが、再利用されるため、Provider の再マウントで DOM ノードが増殖することはない。
- イベントリスナーを追加するダイアログ (`ItemAssetPreviewDialog`, `PageSettingsDialog`) は `useEffect`/`useLayoutEffect` のクリーンアップで確実に `removeEventListener`/`disconnect` を呼び出す。
- `URL.createObjectURL` を利用するダイアログ (`CreateGachaWizardDialog`, `PrizeSettingsDialog`, `SaveOptionsDialog`) はモーダル終了時に `URL.revokeObjectURL` を呼び出し、不要な `Blob` 参照が残らないようにしている。
- 一部ダイアログ（例: `SaveOptionsDialog`）は ZIP 生成のために一時的に大きな `Blob` を保持するためピークメモリ使用量は増えるが、処理完了後に `revokeObjectURL` とローカル状態のリセットが行われる。

現状の実装ではモーダル由来の明確なメモリリークは確認できず、メモリ増加は主に一時的な処理負荷によるものと判断できる。
