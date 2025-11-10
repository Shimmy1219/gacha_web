import { clsx } from 'clsx';

import type { DashboardSectionConfig } from './DashboardShell';

interface DashboardSidebarLayoutProps {
  sections: DashboardSectionConfig[];
  activeView: string;
  onSelectView: (view: string) => void;
}

export function DashboardSidebarLayout({
  sections,
  activeView,
  onSelectView
}: DashboardSidebarLayoutProps): JSX.Element {
  if (sections.length === 0) {
    return <div className="dashboard-sidebar-layout__empty rounded-2xl border border-border/60 bg-panel p-6" />;
  }

  return (
    <div className="dashboard-sidebar-layout grid gap-4 lg:grid-cols-[240px_1fr] xl:grid-cols-[260px_1fr]">
      <nav className="dashboard-sidebar-layout__nav flex flex-col gap-2">
        {sections.map((section) => {
          const isActive = activeView === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelectView(section.id)}
              data-view={section.id}
              className={clsx(
                'flex w-full flex-col items-start gap-1 rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                isActive
                  ? 'border-accent bg-accent/10 text-surface-foreground'
                  : 'border-transparent bg-panel-contrast/60 text-muted-foreground hover:border-accent/40 hover:bg-panel-contrast/90'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="text-sm font-semibold leading-tight">{section.label}</span>
              {section.description ? (
                <span className="text-[11px] leading-relaxed text-muted-foreground">{section.description}</span>
              ) : null}
            </button>
          );
        })}
      </nav>
      <div className="dashboard-sidebar-layout__content rounded-2xl border border-border/60 bg-panel p-4">
        {sections.map((section) => (
          <div
            key={section.id}
            data-view={section.id}
            className={clsx('dashboard-sidebar-layout__section h-full w-full', activeView === section.id ? 'block' : 'hidden')}
          >
            {section.node}
          </div>
        ))}
      </div>
    </div>
  );
}
