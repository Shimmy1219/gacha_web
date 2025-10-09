import { AppHeaderShell } from '../components/app-shell/AppHeaderShell';
import { AppRoutes } from './routes/AppRoutes';

export function App(): JSX.Element {
  const handleOpenRealtime = () => {
    console.info('リアルタイム入力パネルを開く処理は未実装です');
  };

  const handleExportAll = () => {
    console.info('全体エクスポート処理は未実装です');
  };

  const handleImportAll = (files: FileList) => {
    console.info('全体インポート処理は未実装です', files);
  };

  return (
    <div className="min-h-screen bg-surface text-surface-foreground">
      <AppHeaderShell
        title="四遊楽ガチャツール"
        tagline="設定・ガチャ・アップロード・配布まで全て完結"
        summaryLabel="未読込"
        summaryVariant="warning"
        summaryDescription="TXT/JSONを読み込んで集計を開始"
        onOpenRealtime={handleOpenRealtime}
        onExportAll={handleExportAll}
        onImportAll={handleImportAll}
      />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6">
        <AppRoutes />
      </main>
    </div>
  );
}
