import type { CSSProperties } from 'react';

import type { DashboardSectionConfig } from './DashboardShell';

export const DESKTOP_GRID_MAIN_HEIGHT_CSS = [
  'max(0px, calc(',
  '(100vh * var(--site-zoom-inverse-scale, 1))',
  ' - var(--app-header-height, 0px)',
  ' - var(--app-main-vertical-padding, 0px)',
  '))'
].join('');

const DESKTOP_GRID_STYLE: CSSProperties = {
  height: DESKTOP_GRID_MAIN_HEIGHT_CSS
};

export function DashboardDesktopGrid({ sections }: { sections: DashboardSectionConfig[] }): JSX.Element {
  return (
    <div className="dashboard-desktop-grid relative grid auto-rows-fr items-stretch gap-4" style={DESKTOP_GRID_STYLE}>
      {sections.map((section) => (
        <div key={section.id} data-view={section.id} className="dashboard-desktop-grid__item h-full min-h-0">
          {section.node}
        </div>
      ))}
    </div>
  );
}
