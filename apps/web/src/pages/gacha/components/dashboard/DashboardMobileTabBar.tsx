import { SparklesIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

export interface DashboardMobileTabSection {
  id: string;
  label: string;
}

interface DashboardMobileTabBarProps {
  sections: readonly DashboardMobileTabSection[];
  activeSectionId?: string;
  onSelectSection: (sectionId: string) => void;
  onDrawGacha?: () => void;
  onOpenHistory?: () => void;
  historyTabActive?: boolean;
  className?: string;
}

function resolveListColumnClass(totalColumns: number): string {
  if (totalColumns <= 1) {
    return 'grid-cols-1';
  }
  if (totalColumns === 2) {
    return 'grid-cols-2';
  }
  if (totalColumns === 3) {
    return 'grid-cols-3';
  }
  if (totalColumns === 4) {
    return 'grid-cols-4';
  }
  if (totalColumns === 5) {
    return 'grid-cols-5';
  }
  return 'grid-cols-6';
}

/**
 * モバイル表示の下部に表示する dashboard タブ群を共通描画する。
 *
 * @param sections セクションタブとして表示する一覧
 * @param activeSectionId 現在アクティブなセクションID
 * @param onSelectSection セクションタブ押下時の処理
 * @param onDrawGacha 「ガチャ」FAB押下時の処理
 * @param onOpenHistory 「履歴」タブ押下時の処理
 * @param historyTabActive 履歴タブのアクティブ表示フラグ
 * @param className ルート要素へ追加するクラス
 * @returns モバイルタブナビゲーション
 */
export function DashboardMobileTabBar({
  sections,
  activeSectionId,
  onSelectSection,
  onDrawGacha,
  onOpenHistory,
  historyTabActive = false,
  className
}: DashboardMobileTabBarProps): JSX.Element | null {
  if (sections.length === 0) {
    return null;
  }

  const shouldRenderGachaFab = Boolean(onDrawGacha) && sections.some((section) => section.id === 'items');
  const shouldRenderHistoryTab = Boolean(onOpenHistory);
  const totalColumns = sections.length + (shouldRenderHistoryTab ? 1 : 0);
  const listColumnClass = resolveListColumnClass(totalColumns);
  const baseTabClass =
    'dashboard-mobile-tabs__tab flex flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.28em] transition';

  return (
    <>
      <nav
        className={clsx(
          'dashboard-mobile-tabs fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-surface/95 px-1 pb-[calc(0.85rem+env(safe-area-inset-bottom))] pt-3',
          className
        )}
      >
        <div className={clsx('dashboard-mobile-tabs__list grid gap-2', listColumnClass)}>
          {sections.map((section) => {
            const active = activeSectionId === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onSelectSection(section.id)}
                data-active={active}
                data-view={section.id}
                className={clsx(
                  baseTabClass,
                  active
                    ? 'border-accent/80 bg-accent text-accent-foreground'
                    : 'border-transparent bg-surface/40 text-muted-foreground hover:text-surface-foreground'
                )}
                aria-current={active ? 'page' : undefined}
              >
                <span>{section.label}</span>
              </button>
            );
          })}

          {shouldRenderHistoryTab ? (
            <button
              key="history-action"
              type="button"
              onClick={() => onOpenHistory?.()}
              data-view="history"
              data-active={historyTabActive}
              className={clsx(
                baseTabClass,
                historyTabActive
                  ? 'border-accent/80 bg-accent text-accent-foreground'
                  : 'border-transparent bg-surface/40 text-muted-foreground hover:text-surface-foreground'
              )}
              aria-current={historyTabActive ? 'page' : undefined}
            >
              <span>履歴</span>
            </button>
          ) : null}
        </div>
      </nav>

      {shouldRenderGachaFab ? (
        <button
          id="dashboard-mobile-gacha-fab"
          type="button"
          className="dashboard-mobile-tabs__gacha-fab fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full border border-accent/20 bg-accent text-accent-foreground shadow-lg shadow-accent/30 transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          onClick={() => onDrawGacha?.()}
          aria-label="ガチャを引く"
          title="ガチャを引く"
        >
          <SparklesIcon className="dashboard-mobile-tabs__gacha-fab-icon h-6 w-6" aria-hidden="true" />
        </button>
      ) : null}
    </>
  );
}
