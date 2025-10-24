import { clsx } from 'clsx';

import type { DashboardSectionConfig } from './DashboardShell';
import { useDashboardShell } from './DashboardShell';

interface DashboardMobileTabsProps {
  sections: DashboardSectionConfig[];
  onDrawGacha?: () => void;
}

export function DashboardMobileTabs({ sections, onDrawGacha }: DashboardMobileTabsProps): JSX.Element | null {
  const { isMobile, activeView, setActiveView } = useDashboardShell();

  if (!isMobile || sections.length === 0) {
    return null;
  }

  const shouldRenderGachaTab = Boolean(onDrawGacha) && sections.some((section) => section.id === 'items');
  const totalColumns = sections.length + (shouldRenderGachaTab ? 1 : 0);
  const listColumnClass =
    totalColumns <= 1
      ? 'grid-cols-1'
      : totalColumns === 2
        ? 'grid-cols-2'
        : totalColumns === 3
          ? 'grid-cols-3'
          : totalColumns === 4
            ? 'grid-cols-4'
            : totalColumns === 5
              ? 'grid-cols-5'
              : 'grid-cols-6';

  const baseTabClass =
    'dashboard-mobile-tabs__tab flex flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.28em] transition';
  const handleDrawGacha = () => {
    if (onDrawGacha) {
      onDrawGacha();
    }
  };

  return (
    <nav className="dashboard-mobile-tabs fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-surface/95 px-1 pb-[calc(0.85rem+env(safe-area-inset-bottom))] pt-3">
      <div className={clsx('dashboard-mobile-tabs__list grid gap-2', listColumnClass)}>
        {sections.flatMap((section) => {
          const active = activeView === section.id;
          const buttons = [
            (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveView(section.id)}
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
            )
          ];

          if (section.id === 'items' && shouldRenderGachaTab) {
            buttons.push(
              <button
                key="gacha-action"
                type="button"
                onClick={handleDrawGacha}
                data-view="gacha"
                className={clsx(
                  baseTabClass,
                  'border-accent/70 bg-surface/40 text-accent hover:bg-accent hover:text-accent-foreground hover:border-transparent'
                )}
              >
                <span>ガチャ</span>
              </button>
            );
          }

          return buttons;
        })}
      </div>
    </nav>
  );
}
