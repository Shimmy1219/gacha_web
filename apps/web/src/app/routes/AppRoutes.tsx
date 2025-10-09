import { Navigate, useRoutes } from 'react-router-dom';

function DashboardPlaceholder(): JSX.Element {
  return (
    <section className="rounded-2xl border border-border bg-panel/80 p-6 shadow-lg shadow-black/20">
      <h1 className="text-2xl font-semibold">React マイグレーション進行中</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        ドキュメント /doc/react_migration_plan.md のディレクトリ構成に従い、各セクションの React 実装を段階的に追加予定です。
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        現在はヘッダーシェルと Discord ログインボタン、ツールバー状態管理の土台を構築しています。
      </p>
    </section>
  );
}

export function AppRoutes(): JSX.Element | null {
  return useRoutes([
    { path: '/', element: <DashboardPlaceholder /> },
    { path: '*', element: <Navigate to="/" replace /> }
  ]);
}
