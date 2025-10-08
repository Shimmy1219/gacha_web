# React 開発環境用ワークスペース

`react_dev` ブランチでは、新しい React + Tailwind 実装のためにプロジェクト直下を空の状態に保ちます。
既存の静的アセットやドキュメント類はすべて `OLD/` 以下に移設済みです。

## 旧実装資産について

- 旧来の HTML / CSS / JS、API ルート、ドキュメントは `OLD/` に配置されています。
- `codex/old` ブランチからの変更を取り込む場合も、`OLD/` 内の対応するファイルに反映されます。
- 旧実装に対する修正は `OLD/` 配下で行い、必要に応じて `codex/old` ブランチへバックポートしてください。
- `OLD/` ディレクトリは Git Subtree で `codex/old` を取り込んでいるため、`git subtree pull --prefix=OLD origin codex/old` で最新化できます。

## 新実装のガイドライン

1. React / Tailwind プロジェクトはルートディレクトリ直下にセットアップしてください。
2. `OLD/` ディレクトリはそのまま残して構いません。ビルドツールの設定から除外しておくと安全です。
3. 旧実装の静的ファイルを参照する必要がある場合は、`OLD/` から参照してください。

## Git 運用

- `.gitignore` をルートに再配置しているため、`node_modules/` やビルド成果物は引き続きコミット対象外です。
- `codex/old` ブランチから `react_dev` への PR でコンフリクトが発生しないよう、`git subtree pull --prefix=OLD origin codex/old` で適宜同期してください。
- 旧実装の更新内容を `react_dev` に取り込む際には、`OLD/` ディレクトリ側で差分を確認してください。
