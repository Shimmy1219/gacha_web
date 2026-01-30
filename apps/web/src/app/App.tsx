import { useCallback, useEffect, useMemo, useRef } from 'react';

import { type GachaLayoutProps } from '../layouts/GachaLayout';
import { useResponsiveDashboard } from '../pages/gacha/components/dashboard/useResponsiveDashboard';
import { useModal } from '../modals';
import { StartWizardDialog } from '../modals/dialogs/StartWizardDialog';
import { CreateGachaWizardDialog } from '../modals/dialogs/CreateGachaWizardDialog';
import { PageSettingsDialog } from '../modals/dialogs/PageSettingsDialog';
import { DrawGachaDialog } from '../modals/dialogs/DrawGachaDialog';
import { BackupTransferDialog } from '../modals/dialogs/BackupTransferDialog';
import { BackupImportConflictDialog } from '../modals/dialogs/BackupImportConflictDialog';
import { useAppPersistence, useDomainStores } from '../features/storage/AppPersistenceProvider';
import { useStoreValue } from '@domain/stores';
import {
  exportBackupToDevice,
  importBackupFromFile,
  type BackupDuplicateEntry,
  type BackupDuplicateResolution
} from '../features/storage/backupService';
import { importTxtFile } from '../logic/importTxt';
import { AppRoutes } from './routes/AppRoutes';
import { DiscordAuthDebugOverlay } from '../features/discord/DiscordAuthDebugOverlay';
import { useHaptics } from '../features/haptics/HapticsProvider';

export function App(): JSX.Element {
  const mainRef = useRef<HTMLElement>(null);
  const { isMobile } = useResponsiveDashboard();
  const { push } = useModal();
  const persistence = useAppPersistence();
  const stores = useDomainStores();
  const uiPreferencesStore = stores.uiPreferences;
  const uiPreferencesState = useStoreValue(uiPreferencesStore);
  const { triggerConfirmation, triggerError } = useHaptics();
  const showDiscordAuthLogs = useMemo(
    () => uiPreferencesStore.getDiscordAuthLogsEnabled(),
    [uiPreferencesState, uiPreferencesStore]
  );

  const resolveBackupDuplicate = useCallback(
    (entry: BackupDuplicateEntry) =>
      new Promise<BackupDuplicateResolution>((resolve) => {
        let settled = false;
        const finalize = (decision: BackupDuplicateResolution) => {
          if (!settled) {
            settled = true;
            resolve(decision);
          }
        };

        push(BackupImportConflictDialog, {
          id: 'backup-import-conflict',
          title: 'バックアップの復元',
          size: 'sm',
          payload: {
            entry,
            onResolve: (decision) => {
              finalize(decision);
            }
          },
          onClose: () => {
            finalize('skip');
          }
        });
      }),
    [push]
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const preventGestureZoom = (event: Event) => {
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
    };

    const gestureEvents = ['gesturestart', 'gesturechange', 'gestureend'] as const;

    gestureEvents.forEach((eventName) => {
      document.addEventListener(eventName as unknown as string, preventGestureZoom, {
        passive: false
      });
    });

    return () => {
      gestureEvents.forEach((eventName) => {
        document.removeEventListener(eventName as unknown as string, preventGestureZoom);
      });
    };
  }, []);

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
            triggerConfirmation();
          } catch (error) {
            console.error('TXTインポートに失敗しました', error);
            triggerError();
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
        onImportBackup: async (file) => {
          try {
            const result = await importBackupFromFile(file, {
              persistence,
              stores,
              resolveDuplicate: resolveBackupDuplicate
            });
            console.info('バックアップの読み込みが完了しました', result);
            triggerConfirmation();

            if (typeof window !== 'undefined' && typeof window.alert === 'function') {
              if (result.importedGachaIds.length === 0) {
                const skippedNames = result.skippedGacha
                  .map((entry) => entry.name ?? entry.id)
                  .filter(Boolean)
                  .join(', ');
                const summary = skippedNames
                  ? `バックアップに含まれるガチャは既に登録済みのため、追加されませんでした。\nスキップされたガチャ: ${skippedNames}`
                  : 'バックアップに追加可能なガチャが見つかりませんでした。';
                window.alert(summary);
              } else {
                const importedList = result.importedGachaNames.length > 0
                  ? `追加したガチャ: ${result.importedGachaNames.join(', ')}`
                  : `追加したガチャID: ${result.importedGachaIds.join(', ')}`;
                const skippedList = result.skippedGacha.length > 0
                  ? `\nスキップされたガチャ: ${result.skippedGacha
                      .map((entry) => entry.name ?? entry.id)
                      .filter(Boolean)
                      .join(', ')}`
                  : '';
                const assetsLine = result.importedAssetCount > 0
                  ? `\n復元したアセット数: ${result.importedAssetCount}`
                  : '';
                window.alert(`バックアップの復元が完了しました。\n${importedList}${assetsLine}${skippedList}`);
              }
            }
          } catch (error) {
            console.error('バックアップの復元に失敗しました', error);
            triggerError();
            if (typeof window !== 'undefined' && typeof window.alert === 'function') {
              const message =
                error instanceof Error
                  ? error.message
                  : 'バックアップの復元に失敗しました。ファイル形式や内容をご確認ください。';
              window.alert(message);
            }
          }
        },
        onEnterTransferCode: () => {
          console.info('引継ぎコード入力処理は未接続です');
        },
        onCreateNew: () => {
          push(CreateGachaWizardDialog, {
            id: 'create-gacha-wizard',
            title: '新規ガチャを作成',
            size: 'xl'
          });
        }
      }
    });
  };

  const handleDrawGacha = () => {
    push(DrawGachaDialog, {
      id: 'draw-gacha-dialog',
      title: 'ガチャを引く',
      size: 'lg'
    });
  };

  const handleRegisterGacha = () => {
    handleOpenStartWizard();
  };

  const handleExportAll = () => {
    push(BackupTransferDialog, {
      id: 'backup-transfer-dialog',
      title: 'バックアップ/引継ぎ',
      size: 'md',
      payload: {
        onSelectBackup: async () => {
          try {
            await exportBackupToDevice(persistence);
            console.info('バックアップファイルを保存しました');
            triggerConfirmation();
          } catch (error) {
            console.error('バックアップのエクスポートに失敗しました', error);
            triggerError();
            if (typeof window !== 'undefined' && typeof window.alert === 'function') {
              const message =
                error instanceof Error
                  ? error.message
                  : 'バックアップの保存に失敗しました。ブラウザの権限や空き容量をご確認ください。';
              window.alert(message);
            }
            throw (error instanceof Error
              ? error
              : new Error('バックアップの保存に失敗しました。ブラウザの権限や空き容量をご確認ください。'));
          }
        },
        onSelectTransfer: () => {
          console.info('引継ぎ処理は未接続です');
          if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert('引継ぎコードによる復元は準備中です。');
          }
        }
      }
    });
  };

  const handleOpenPageSettings = () => {
    push(PageSettingsDialog, {
      id: 'page-settings',
      title: 'サイト設定',
      description: 'ガチャ一覧の表示方法やサイトカラーをカスタマイズできます。',
      size: 'xl',
      panelClassName: 'page-settings-modal overflow-hidden',
      panelPaddingClassName: 'p-2 lg:p-6',
      showHeaderCloseButton: true
    });
  };

  const gachaLayoutProps: Omit<GachaLayoutProps, 'children'> = {
    title: '四遊楽ガチャツール',
    tagline: 'Integrated Gacha Management Tool emergency',
    mainRef,
    isMobile,
    onDrawGacha: handleDrawGacha,
    onRegisterGacha: handleRegisterGacha,
    onExportAll: handleExportAll,
    onOpenPageSettings: handleOpenPageSettings
  };

  return (
    <>
      <AppRoutes gachaLayoutProps={gachaLayoutProps} />
      {showDiscordAuthLogs ? <DiscordAuthDebugOverlay /> : null}
    </>
  );
}
