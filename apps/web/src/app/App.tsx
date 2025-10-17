import { useEffect, useRef } from 'react';

import { AppHeaderShell } from '../components/app-shell/AppHeaderShell';
import { AppRoutes } from './routes/AppRoutes';

export function App(): JSX.Element {
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const mainEl = mainRef.current;
    if (!mainEl) {
      return;
    }

    const root = document.documentElement;

    const updatePadding = () => {
      const styles = window.getComputedStyle(mainEl);
      const paddingTop = parseFloat(styles.paddingTop) || 0;
      const paddingBottom = parseFloat(styles.paddingBottom) || 0;
      root.style.setProperty('--app-main-vertical-padding', `${paddingTop + paddingBottom}px`);
    };

    updatePadding();

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updatePadding);
      resizeObserver.observe(mainEl);
    }

    window.addEventListener('resize', updatePadding);

    return () => {
      window.removeEventListener('resize', updatePadding);
      resizeObserver?.disconnect();
      root.style.removeProperty('--app-main-vertical-padding');
    };
  }, []);

  const handleOpenRealtime = () => {
    console.info('リアルタイム入力パネルを開く処理は未実装です');
  };

  const handleOpenTxtJsonImport = () => {
    console.info('TXT/JSONインポートの起動は未実装です');
  };

  const handleExportAll = () => {
    console.info('全体エクスポート処理は未実装です');
  };

  const handleImportAll = (files: FileList) => {
    console.info('全体インポート処理は未実装です', files);
  };

  return (
    <div className="app min-h-screen bg-transparent text-surface-foreground">
      <AppHeaderShell
        title="四遊楽ガチャツール"
        tagline="SETTING · GACHA · UPLOAD · SHARE"
        summaryLabel="TXT/JSON未読込"
        summaryVariant="warning"
        summaryDescription="TXT/JSONを読み込んでガチャデータを同期"
        onOpenTxtJsonImport={handleOpenTxtJsonImport}
        onOpenRealtime={handleOpenRealtime}
        onExportAll={handleExportAll}
        onImportAll={handleImportAll}
      />
      <main ref={mainRef} className="app__main px-4 pb-24 pt-8 sm:px-6">
        <AppRoutes />
      </main>
    </div>
  );
}
