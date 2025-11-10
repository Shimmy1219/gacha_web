import { clsx } from 'clsx';

import type { DashboardSectionConfig } from './DashboardShell';

interface DashboardSidebarLayoutProps {
  sections: DashboardSectionConfig[];
  selectedViewIds: readonly string[];
  onToggleView: (view: string) => void;
}

export function DashboardSidebarLayout({
  sections,
  selectedViewIds,
  onToggleView
}: DashboardSidebarLayoutProps): JSX.Element {
  if (sections.length === 0) {
    return <div className="dashboard-sidebar-layout__empty rounded-2xl border border-border/60 bg-panel p-6" />;
  }

  const selectedSections = selectedViewIds
    .map((viewId) => sections.find((section) => section.id === viewId))
    .filter((section): section is DashboardSectionConfig => Boolean(section));

  return (
    <div className="dashboard-sidebar-layout grid gap-4 lg:grid-cols-[240px_1fr] xl:grid-cols-[260px_1fr]">
      <nav className="dashboard-sidebar-layout__nav flex flex-col gap-2">
        {sections.map((section) => {
          const selectionIndex = selectedViewIds.indexOf(section.id);
          const isSelected = selectionIndex !== -1;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onToggleView(section.id)}
              data-view={section.id}
              className={clsx(
                'flex w-full flex-col items-start gap-1 rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                isSelected
                  ? 'border-accent bg-accent/10 text-surface-foreground'
                  : 'border-transparent bg-panel-contrast/60 text-muted-foreground hover:border-accent/40 hover:bg-panel-contrast/90'
              )}
              aria-pressed={isSelected}
            >
              <span className="flex items-center gap-2 text-sm font-semibold leading-tight">
                {section.label}
                {isSelected ? (
                  <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-2 text-[11px] font-bold leading-none text-accent-foreground">
                    {selectionIndex + 1}
                  </span>
                ) : null}
              </span>
              {section.description ? (
                <span className="text-[11px] leading-relaxed text-muted-foreground">{section.description}</span>
              ) : null}
            </button>
          );
        })}
      </nav>
      <div className="dashboard-sidebar-layout__content rounded-2xl border border-border/60 bg-panel p-4">
        {selectedSections.length === 0 ? (
          <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-panel-contrast/40 text-sm text-muted-foreground">
            表示するセクションを2つまで選択してください。
          </div>
        ) : (
          <div
            className={clsx(
              'dashboard-sidebar-layout__section-grid grid h-full w-full gap-4 [&_.section-container]:border-none [&_.section-container]:p-0',
              selectedSections.length > 1 ? 'lg:grid-cols-2' : 'grid-cols-1'
            )}
          >
            {selectedSections.map((section) => (
              <div key={section.id} data-view={section.id} className="dashboard-sidebar-layout__section h-full w-full">
                {section.node}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
