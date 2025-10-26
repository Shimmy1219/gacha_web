import { useEffect, useRef } from 'react';
import { clsx } from 'clsx';

import { AppHeaderShell } from '../components/app-shell/AppHeaderShell';
import { useResponsiveDashboard } from '../components/dashboard/useResponsiveDashboard';
import { useModal } from '../modals';
import { StartWizardDialog } from '../modals/dialogs/StartWizardDialog';
import { GuideInfoDialog } from '../modals/dialogs/GuideInfoDialog';
import { CreateGachaWizardDialog } from '../modals/dialogs/CreateGachaWizardDialog';
import { LivePasteDialog } from '../modals/dialogs/LivePasteDialog';
import { LivePasteGachaPickerDialog } from '../modals/dialogs/LivePasteGachaPickerDialog';
import { LivePasteCatalogErrorDialog } from '../modals/dialogs/LivePasteCatalogErrorDialog';
import { PageSettingsDialog } from '../modals/dialogs/PageSettingsDialog';
import { DrawGachaDialog } from '../modals/dialogs/DrawGachaDialog';
import { useAppPersistence, useDomainStores } from '../features/storage/AppPersistenceProvider';
import { importTxtFile } from '../logic/importTxt';
import {
  applyLivePasteText,
  LivePasteCatalogMismatchError,
  LivePasteGachaConflictError,
  type LivePasteCatalogIssue
} from '../logic/livePaste';
import { AppRoutes } from './routes/AppRoutes';

function formatCatalogIssueMessage(issue?: LivePasteCatalogIssue): string | undefined {
  if (!issue) {
    return undefined;
  }

  switch (issue.type) {
    case 'missing-gacha':
      return `「${issue.gachaName}」のガチャが登録されていません。`;
    case 'missing-rarity-index':
      return `「${issue.gachaName}」のレアリティ情報が見つかりません。`;
    case 'missing-rarity':
      return `「${issue.gachaName}」にレアリティ「${issue.rarityLabel}」が登録されていません。`;
    case 'missing-item':
      return `「${issue.gachaName}」のレアリティ「${issue.rarityLabel}」にアイテム「${issue.itemName}」が登録されていません。`;
    case 'rarity-mismatch':
      return `「${issue.gachaName}」でアイテム「${issue.itemName}」のレアリティが一致しません（期待：${issue.rarityLabel}）。`;
    case 'malformed-block': {
      const scope = issue.gachaName ? `「${issue.gachaName}」` : '貼り付け内容';
      switch (issue.reason) {
        case 'missing-gacha-name':
          return 'ガチャ名が入力されていません。';
        case 'missing-user-line':
          return `${scope}の2行目にユーザー名と連数を入力してください。`;
        case 'missing-user-name':
          return `${scope}のユーザー名が入力されていません。`;
        case 'missing-user-pulls':
          return `${scope}の連数が入力されていません。`;
        case 'missing-results':
          return `${scope}の獲得結果が確認できません。`;
        case 'missing-rarity-label':
          return `${scope}の行にレアリティが設定されていません${issue.line ? `：${issue.line}` : '。'}`;
        case 'missing-item-name':
          return `${scope}の行にアイテム名が設定されていません${issue.line ? `：${issue.line}` : '。'}`;
        case 'missing-item-count':
          return `${scope}の行に獲得数が設定されていません${issue.line ? `：${issue.line}` : '。'}`;
        default:
          return undefined;
      }
    }
    default:
      return undefined;
  }
}

export function App(): JSX.Element {
  const mainRef = useRef<HTMLElement>(null);
  const { isMobile } = useResponsiveDashboard();
  const { push, dismissAll } = useModal();
  const persistence = useAppPersistence();
  const stores = useDomainStores();

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
      document.addEventListener(eventName as any, preventGestureZoom as EventListener, {
        passive: false
      });
    });

    return () => {
      gestureEvents.forEach((eventName) => {
        document.removeEventListener(eventName as any, preventGestureZoom as EventListener);
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
          push(CreateGachaWizardDialog, {
            id: 'create-gacha-wizard',
            title: '新規ガチャを作成',
            size: 'xl'
          });
        },
        onOpenGuide: handleOpenGuide
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

  const handleOpenRealtime = () => {
    push(LivePasteDialog, {
      id: 'live-paste',
      title: 'リアルタイム結果を貼り付け',
      description: 'リアルタイムの結果テキストを貼り付けて解析・同期します。',
      size: 'lg',
      payload: {
        onApply: async (value) => {
          const trimmed = value.trim();
          if (!trimmed) {
            if (typeof window !== 'undefined' && typeof window.alert === 'function') {
              window.alert('テキストを貼り付けてください。');
            }
            return false;
          }

          try {
            const result = applyLivePasteText(trimmed, { persistence, stores });
            console.info('リアルタイム結果を反映しました', result);
            return true;
          } catch (error) {
            if (error instanceof LivePasteCatalogMismatchError) {
              console.error('リアルタイム結果のカタログ整合性チェックで失敗しました', error);
              const detail = formatCatalogIssueMessage(error.issue);
              push(LivePasteCatalogErrorDialog, {
                id: 'live-paste-catalog-error',
                title: 'ガチャカタログの整合性エラー',
                description: '登録済みのガチャカタログと結果の内容が一致しませんでした。',
                size: 'sm',
                payload: {
                  detail
                }
              });
              return false;
            }
            if (error instanceof LivePasteGachaConflictError) {
              push(LivePasteGachaPickerDialog, {
                id: 'live-paste-gacha-picker',
                title: '対象ガチャを選択',
                description: '同名のガチャが複数見つかりました。反映先を選択してください。',
                size: 'md',
                payload: {
                  conflicts: error.conflicts,
                  onResolve: async (selection) => {
                    try {
                      const resultWithSelection = applyLivePasteText(trimmed, { persistence, stores }, {
                        gachaSelections: selection
                      });
                      console.info('ガチャ選択後にリアルタイム結果を反映しました', resultWithSelection);
                      dismissAll();
                      return false;
                    } catch (innerError) {
                      if (innerError instanceof LivePasteCatalogMismatchError) {
                        console.error('ガチャ選択後のカタログ整合性チェックで失敗しました', innerError);
                        const detail = formatCatalogIssueMessage(innerError.issue);
                        push(LivePasteCatalogErrorDialog, {
                          id: 'live-paste-catalog-error',
                          title: 'ガチャカタログの整合性エラー',
                          description: '登録済みのガチャカタログと結果の内容が一致しませんでした。',
                          size: 'sm',
                          payload: {
                            detail
                          }
                        });
                        return false;
                      }
                      console.error('ガチャ選択後の反映に失敗しました', innerError);
                      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
                        const message =
                          innerError instanceof LivePasteGachaConflictError
                            ? '選択結果に不足があります。再度選択してください。'
                            : innerError instanceof Error
                              ? innerError.message
                              : '選択したガチャへの反映に失敗しました。再度お試しください。';
                        window.alert(message);
                      }
                      return false;
                    }
                  },
                  helperText: '反映先のガチャを選択するとリアルタイム結果を同期します。'
                }
              });
              return false;
            }
            console.error('リアルタイム結果の反映に失敗しました', error);
            if (typeof window !== 'undefined' && typeof window.alert === 'function') {
              const message =
                error instanceof Error
                  ? error.message
                  : 'リアルタイム結果の反映に失敗しました。再度お試しください。';
              window.alert(message);
            }
            return false;
          }
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

  const handleOpenPageSettings = () => {
    push(PageSettingsDialog, {
      id: 'page-settings',
      title: 'サイト設定',
      description: 'ガチャ一覧の表示方法やサイトカラーをカスタマイズできます。',
      size: 'xl'
    });
  };

  return (
    <div className="app min-h-screen bg-transparent text-surface-foreground">
      <AppHeaderShell
        title="四遊楽ガチャツール"
        tagline="Integrated Gacha Management Tool"
        onDrawGacha={handleDrawGacha}
        onRegisterGacha={handleRegisterGacha}
        onOpenRealtime={handleOpenRealtime}
        onExportAll={handleExportAll}
        onOpenPageSettings={handleOpenPageSettings}
      />
      <main
        ref={mainRef}
        className={clsx('app__main', !isMobile && 'px-4 pb-[5px] pt-4')}
      >
        <AppRoutes onDrawGacha={handleDrawGacha} />
      </main>
    </div>
  );
}
