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
    <div className="min-h-screen bg-transparent text-surface-foreground">
      <AppHeaderShell
        title="四遊楽ガチャツール"
        tagline="SETTING · GACHA · UPLOAD · SHARE"
        summaryLabel="TXT/JSON未読込"
        summaryVariant="warning"
        summaryDescription="TXT/JSONを読み込んでガチャデータを同期"
        onOpenRealtime={handleOpenRealtime}
        onExportAll={handleExportAll}
        onImportAll={handleImportAll}
      />
      <main className="px-4 pb-24 pt-8 sm:px-6">
        <AppRoutes />
      </main>
    </div>
  );
}
