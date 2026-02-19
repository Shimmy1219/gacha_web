import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import { clsx } from 'clsx';

import type { DashboardSectionConfig } from './DashboardShell';

const SIDEBAR_MAIN_HEIGHT_CSS = [
  'max(0px, calc(',
  '(100vh * var(--site-zoom-inverse-scale, 1))',
  ' - var(--app-header-height, 0px)',
  ' - var(--app-main-vertical-padding, 0px)',
  '))'
].join('');

interface DashboardSidebarLayoutProps {
  sections: DashboardSectionConfig[];
  selectedViewIds: readonly string[];
  maxSelections: number;
  onToggleView: (view: string) => void;
}

export function DashboardSidebarLayout({
  sections,
  selectedViewIds,
  maxSelections,
  onToggleView
}: DashboardSidebarLayoutProps): JSX.Element {
  const [isSidebarNavCollapsed, setIsSidebarNavCollapsed] = useState(false);

  if (sections.length === 0) {
    return <div className="dashboard-sidebar-layout__empty rounded-2xl border border-border/60 bg-panel p-6" />;
  }

  const selectedSections = selectedViewIds
    .map((viewId) => sections.find((section) => section.id === viewId))
    .filter((section): section is DashboardSectionConfig => Boolean(section));

  return (
    <div className="dashboard-sidebar-layout__root relative">
      {isSidebarNavCollapsed ? (
        <button
          type="button"
          className="dashboard-sidebar-layout__edge-toggle fixed left-0 top-1/2 z-40 flex -translate-y-1/2 items-center gap-1 rounded-r-xl border border-l-0 border-border/70 bg-panel/95 px-3 py-2 text-xs font-semibold text-surface-foreground shadow-lg transition hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          onClick={() => setIsSidebarNavCollapsed(false)}
          aria-label="サイドバーを展開"
          aria-expanded="false"
        >
          <ChevronDoubleRightIcon aria-hidden className="h-4 w-4" />
          <span className="dashboard-sidebar-layout__edge-toggle-label">展開</span>
        </button>
      ) : null}

      <div
        className={clsx(
          'dashboard-sidebar-layout grid gap-4 transition-[grid-template-columns] duration-200 min-[901px]:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]',
          isSidebarNavCollapsed &&
            'min-[901px]:grid-cols-[0_minmax(0,1fr)] lg:grid-cols-[0_minmax(0,1fr)] xl:grid-cols-[0_minmax(0,1fr)]'
        )}
      >
        <div
          className={clsx(
            'dashboard-sidebar-layout__nav-shell min-w-0 overflow-hidden transition-opacity duration-200',
            isSidebarNavCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
          )}
        >
          <div className="dashboard-sidebar-layout__nav-frame flex h-full flex-col rounded-2xl border border-border/60 bg-panel/95 p-3">
            <div className="dashboard-sidebar-layout__nav-header mb-2 flex justify-end">
              <button
                type="button"
                className="dashboard-sidebar-layout__collapse-toggle inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-panel-contrast/60 text-muted-foreground transition hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                onClick={() => setIsSidebarNavCollapsed(true)}
                aria-label="サイドバーを折りたたむ"
                aria-expanded="true"
              >
                <ChevronDoubleLeftIcon aria-hidden className="h-4 w-4" />
              </button>
            </div>
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
                      'dashboard-sidebar-layout__view-toggle flex w-full flex-col items-start gap-1 rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                      isSelected
                        ? 'border-accent bg-accent/10 text-surface-foreground'
                        : 'border-transparent bg-panel-contrast/60 text-muted-foreground hover:border-accent/40 hover:bg-panel-contrast/90'
                    )}
                    aria-pressed={isSelected}
                  >
                    <span className="dashboard-sidebar-layout__view-toggle-label flex items-center gap-2 text-sm font-semibold leading-tight">
                      {section.label}
                      {isSelected ? (
                        <span className="dashboard-sidebar-layout__view-toggle-order inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-2 text-[11px] font-bold leading-none text-accent-foreground">
                          {selectionIndex + 1}
                        </span>
                      ) : null}
                    </span>
                    {section.description ? (
                      <span className="dashboard-sidebar-layout__view-toggle-description text-[11px] leading-relaxed text-muted-foreground">
                        {section.description}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
        <div
          className="dashboard-sidebar-layout__content rounded-2xl border border-border/60 bg-panel p-4"
          style={{ height: SIDEBAR_MAIN_HEIGHT_CSS }}
        >
          {selectedSections.length === 0 ? (
            <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-panel-contrast/40 text-sm text-muted-foreground">
              表示するセクションを{maxSelections}つまで選択してください。
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
    </div>
  );
}
