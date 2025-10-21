import { useEffect, useRef } from 'react';

import { AppHeaderShell } from '../components/app-shell/AppHeaderShell';
import { useModal } from '../components/modal';
import { StartWizardDialog } from '../features/onboarding/dialogs/StartWizardDialog';
import { GuideInfoDialog } from '../features/onboarding/dialogs/GuideInfoDialog';
import { LivePasteDialog } from '../features/realtime/dialogs/LivePasteDialog';
import { useAppPersistence, useDomainStores } from '../features/storage/AppPersistenceProvider';
import { importTxtFile } from '../logic/importTxt';
import { AppRoutes } from './routes/AppRoutes';

export function App(): JSX.Element {
  const mainRef = useRef<HTMLElement>(null);
  const { push } = useModal();
  const persistence = useAppPersistence();
  const stores = useDomainStores();

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

  const handleOpenGuide = () => {
    push(GuideInfoDialog, {
      id: 'guide-info',
      title: '次のステップ',
      size: 'sm',
      payload: {
        message: 'ガチャ結果は画面上部の「リアルタイム入力」ボタンを押してペーストしてください。',
        confirmLabel: '分かった'
      }
    });
  };

  const handleOpenStartWizard = () => {
    push(StartWizardDialog, {
      id: 'start-wizard',
      title: 'はじめかたを選択してください',
      description: '利用状況に合わせて、バックアップ復元やインポート、新規作成など必要な導入方法を選べます。',
      size: 'lg',
      payload: {
        onPickTxt: async (file) => {
          try {
            const result = await importTxtFile(file, { persistence, stores });
            console.info(`TXTインポートが完了しました: ${result.displayName}`, result);
          } catch (error) {
            console.error('TXTインポートに失敗しました', error);
            if (typeof window !== 'undefined' && typeof window.alert === 'function') {
              const message =
                error instanceof Error ? error.message : 'TXTの取り込みで不明なエラーが発生しました';
              window.alert(message);
            }
          }
        },
        onPickJson: (file) => {
          console.info('JSONインポート処理は未接続です', file);
        },
        onImportBackup: (file) => {
          console.info('バックアップ読み込み処理は未接続です', file);
        },
        onEnterTransferCode: () => {
          console.info('引継ぎコード入力処理は未接続です');
        },
        onCreateNew: () => {
          console.info('新規ガチャ作成フローは未接続です');
        },
        onOpenGuide: handleOpenGuide
      }
    });
  };

  const handleOpenRealtime = () => {
    push(LivePasteDialog, {
      id: 'live-paste',
      title: 'リアルタイム結果を貼り付け',
      description: 'リアルタイムの結果テキストを貼り付けて解析・同期します。',
      size: 'lg',
      payload: {
        onApply: (value) => {
          console.info('リアルタイム結果の反映処理は未接続です', value);
        }
      }
    });
  };

  const handleRegisterGacha = () => {
    handleOpenStartWizard();
  };

  const handleExportAll = () => {
    console.info('全体エクスポート処理は未実装です');
  };

  return (
    <div className="app min-h-screen bg-transparent text-surface-foreground">
      <AppHeaderShell
        title="四遊楽ガチャツール"
        tagline="SETTING · GACHA · UPLOAD · SHARE"
        summaryLabel="TXT/JSON未読込"
        summaryVariant="warning"
        summaryDescription="TXT/JSONを読み込んでガチャデータを同期"
        onRegisterGacha={handleRegisterGacha}
        onOpenRealtime={handleOpenRealtime}
        onExportAll={handleExportAll}
      />
      <main ref={mainRef} className="app__main px-4 pb-[5px] pt-8">
        <AppRoutes />
      </main>
    </div>
  );
}
