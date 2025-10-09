import { clsx } from 'clsx';

import type { DashboardSectionConfig } from './DashboardShell';
import { useDashboardShell } from './DashboardShell';

interface DashboardMobileTabsProps {
  sections: DashboardSectionConfig[];
}

export function DashboardMobileTabs({ sections }: DashboardMobileTabsProps): JSX.Element | null {
  const { isMobile, activeView, setActiveView } = useDashboardShell();

  if (!isMobile || sections.length === 0) {
    return null;
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-[#05040a]/95 px-4 pb-[calc(0.85rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-24px_64px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      <div className="grid grid-cols-4 gap-2">
        {sections.map((section) => {
          const active = activeView === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveView(section.id)}
              data-active={active}
              data-view={section.id}
              className={clsx(
                'flex flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] transition',
                active
                  ? 'border-accent/80 bg-accent text-accent-foreground shadow-[0_12px_32px_rgba(255,47,93,0.45)]'
                  : 'border-transparent bg-surface/40 text-muted-foreground hover:text-surface-foreground'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <span>{section.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
