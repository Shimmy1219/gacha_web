import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { type GachaLayoutProps } from '../layouts/GachaLayout';
import { useResponsiveDashboard } from '../pages/gacha/components/dashboard/useResponsiveDashboard';
import { useModal } from '../modals';
import { StartWizardDialog } from '../modals/dialogs/StartWizardDialog';
import { CreateGachaWizardDialog } from '../modals/dialogs/CreateGachaWizardDialog';
import { PageSettingsDialog } from '../modals/dialogs/PageSettingsDialog';
import { DrawGachaDialog } from '../modals/dialogs/DrawGachaDialog';
import { BackupTransferDialog } from '../modals/dialogs/BackupTransferDialog';
import { BackupImportConflictDialog } from '../modals/dialogs/BackupImportConflictDialog';
import { TransferCreateDialog } from '../modals/dialogs/TransferCreateDialog';
import { TransferImportDialog } from '../modals/dialogs/TransferImportDialog';
import { DiscordOauthErrorDialog } from '../modals/dialogs/DiscordOauthErrorDialog';
import { ReleaseNotesDialog } from '../modals/dialogs/ReleaseNotesDialog';
import { buildPageSettingsDialogProps } from '../modals/dialogs/pageSettingsDialogConfig';
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
import { useNotification } from '../features/notification';
import { syncOwnerNameActorCookie } from '../features/receive/ownerActorCookie';
import { getUnreadReleaseNotes, RELEASE_NOTES } from '../content/releaseNotes';

export function App(): JSX.Element {
  const mainRef = useRef<HTMLElement>(null);
  const releaseModalOpenedForRef = useRef<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { isMobile } = useResponsiveDashboard();
  const { push } = useModal();
  const persistence = useAppPersistence();
  const stores = useDomainStores();
  const uiPreferencesStore = stores.uiPreferences;
  const uiPreferencesState = useStoreValue(uiPreferencesStore);
  const { triggerConfirmation, triggerError } = useHaptics();
  const { notify } = useNotification();
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

    const params = new URLSearchParams(location.search);
    const oauthError = params.get('discord_oauth_error');

    if (!oauthError) {
      return;
    }

    push(DiscordOauthErrorDialog, {
      id: 'discord-oauth-error',
      title: 'Discordとの連携に失敗しました',
      size: 'sm',
      intent: 'warning',
      payload: {
        oauthError
      }
    });

    params.delete('discord_oauth_error');
    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch.length > 0 ? `?${nextSearch}` : '',
        hash: location.hash
      },
      { replace: true }
    );
  }, [location.hash, location.pathname, location.search, navigate, push]);

  useEffect(() => {
    const isGachaRootPath = location.pathname === '/gacha' || location.pathname === '/gacha/';
    if (!isGachaRootPath) {
      releaseModalOpenedForRef.current = null;
      return;
    }

    const latestRelease = RELEASE_NOTES[0];
    if (!latestRelease) {
      return;
    }

    const lastSeenRelease = uiPreferencesStore.getLastSeenRelease();
    const unreadReleaseNotes = getUnreadReleaseNotes(RELEASE_NOTES, lastSeenRelease);
    if (unreadReleaseNotes.length === 0) {
      releaseModalOpenedForRef.current = null;
      return;
    }

    if (releaseModalOpenedForRef.current === latestRelease.id) {
      return;
    }

    releaseModalOpenedForRef.current = latestRelease.id;
    push(ReleaseNotesDialog, {
      id: 'release-notes-dialog',
      title: 'アップデート情報',
      size: 'md',
      payload: {
        entries: unreadReleaseNotes
      },
      onClose: () => {
        uiPreferencesStore.setLastSeenRelease(latestRelease.id, { persist: 'immediate' });
      }
    });
  }, [location.pathname, push, uiPreferencesState, uiPreferencesStore]);

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
    // 起動時に永続設定のownerNameをactor cookieへ同期し、ログ相関を復元する。
    const prefs = persistence.loadSnapshot().receivePrefs;
    syncOwnerNameActorCookie(prefs?.ownerName ?? null);
  }, [persistence]);

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
            notify({
              variant: 'error',
              title: 'TXTの取り込みに失敗しました',
              message: error instanceof Error ? error.message : 'TXTの取り込みで不明なエラーが発生しました'
            });
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
            if (result.importedGachaIds.length === 0) {
              notify({
                variant: 'warning',
                title: '復元対象がありません',
                message: '追加可能なガチャが見つかりませんでした。'
              });
            } else {
              notify({
                variant: 'success',
                title: 'バックアップを復元しました',
                message: `追加: ${result.importedGachaIds.length}件 / スキップ: ${result.skippedGacha.length}件 / アセット: ${result.importedAssetCount}件`
              });
            }
          } catch (error) {
            console.error('バックアップの復元に失敗しました', error);
            triggerError();
            notify({
              variant: 'error',
              title: 'バックアップの復元に失敗しました',
              message:
                error instanceof Error
                  ? error.message
                  : 'バックアップの復元に失敗しました。ファイル形式や内容をご確認ください。'
            });
          }
        },
        onEnterTransferCode: () => {
          push(TransferImportDialog, {
            id: 'transfer-import-dialog',
            title: '引継ぎコードで復元',
            description: '発行された5桁の引継ぎコードと暗証番号（4桁）でデータを復元します。',
            size: 'md'
          });
        },
        onCreateNew: () => {
          if (isMobile) {
            navigate('/gacha/create');
            return;
          }

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

  const handleOpenHistory = () => {
    navigate('/gacha/history');
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
            notify({
              variant: 'error',
              title: 'バックアップの保存に失敗しました',
              message:
                error instanceof Error
                  ? error.message
                  : 'バックアップの保存に失敗しました。ブラウザの権限や空き容量をご確認ください。'
            });
            throw (error instanceof Error
              ? error
              : new Error('バックアップの保存に失敗しました。ブラウザの権限や空き容量をご確認ください。'));
          }
        },
        onSelectTransfer: () => {
          push(TransferCreateDialog, {
            id: 'transfer-create-dialog',
            title: '引継ぎコードを発行',
            description:
              'バックアップ(.shimmy)を生成して暗号化し、クラウドに保存します。引継ぐ際に4桁の暗証番号の設定が必要です。引継ぎコードと、暗証番号は引き継ぎ先で必要になります。',
            size: 'md'
          });
        }
      }
    });
  };

  const handleOpenPageSettings = () => {
    push(PageSettingsDialog, buildPageSettingsDialogProps());
  };

  const gachaLayoutProps: Omit<GachaLayoutProps, 'children'> = {
    title: '四遊楽ガチャツール(β)',
    tagline: 'SHIYURA Integrated Gacha Management Tool',
    mainRef,
    isMobile,
    onDrawGacha: handleDrawGacha,
    onRegisterGacha: handleRegisterGacha,
    onOpenHistory: handleOpenHistory,
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
