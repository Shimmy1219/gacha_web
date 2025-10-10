import type { DashboardSectionConfig } from './DashboardShell';

interface DashboardDesktopGridProps {
  sections: DashboardSectionConfig[];
}

export function DashboardDesktopGrid({ sections }: DashboardDesktopGridProps): JSX.Element {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(24rem,1fr)_minmax(32rem,1.25fr)_minmax(30rem,1fr)_minmax(24rem,0.9fr)] 2xl:grid-cols-[minmax(26rem,1fr)_minmax(38rem,1.4fr)_minmax(32rem,1.05fr)_minmax(24rem,0.95fr)]">
      {sections.map((section) => (
        <div key={section.id} data-view={section.id} className="h-full">
          {section.node}
        </div>
      ))}
    </div>
  );
}
