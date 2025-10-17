import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';

import { DashboardDesktopGrid } from './DashboardDesktopGrid';
import { DashboardMobileTabs } from './DashboardMobileTabs';
import { useResponsiveDashboard } from './useResponsiveDashboard';

export interface DashboardSectionConfig {
  id: string;
  label: string;
  description?: string;
  node: ReactNode;
}

interface DashboardShellProps {
  sections: DashboardSectionConfig[];
  controlsSlot?: ReactNode;
}

interface DashboardContextValue {
  isMobile: boolean;
  activeView: string;
  setActiveView: Dispatch<SetStateAction<string>>;
}

const DashboardContext = createContext<DashboardContextValue | undefined>(undefined);

export function useDashboardShell(): DashboardContextValue {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboardShell must be used within DashboardShell');
  }
  return context;
}

export function DashboardShell({ sections, controlsSlot }: DashboardShellProps): JSX.Element {
  const { isMobile } = useResponsiveDashboard();
  const [activeView, setActiveView] = useState(() => sections[0]?.id ?? 'rarity');

  useEffect(() => {
    if (sections.length === 0) {
      return;
    }
    if (!sections.some((section) => section.id === activeView)) {
      setActiveView(sections[0].id);
    }
  }, [sections, activeView]);

  const value = useMemo(
    () => ({ isMobile, activeView, setActiveView }),
    [isMobile, activeView]
  );

  return (
    <DashboardContext.Provider value={value}>
      <div className="dashboard-shell relative flex w-full max-w-6xl flex-col gap-4 pb-0 lg:pb-0">
        {controlsSlot ? (
          <aside className="dashboard-shell__controls rounded-[1.5rem] border border-border/70 bg-[#15151b]/95 p-6 shadow-panel ring-1 ring-inset ring-white/5">
            {controlsSlot}
          </aside>
        ) : null}

        <div className="dashboard-shell__desktop hidden lg:block">
          <DashboardDesktopGrid sections={sections} />
        </div>

        <div className="dashboard-shell__mobile space-y-4 lg:hidden">
          {sections.map((section) => (
            <div
              key={section.id}
              data-view={section.id}
              className={clsx('dashboard-shell__mobile-section', activeView !== section.id && 'hidden')}
            >
              {section.node}
            </div>
          ))}
        </div>

        <DashboardMobileTabs sections={sections} />
      </div>
    </DashboardContext.Provider>
  );
}
