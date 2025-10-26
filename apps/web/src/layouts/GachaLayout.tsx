import type { ReactNode } from 'react';

import {
  DashboardShell,
  type DashboardSectionConfig
} from '../components/dashboard/DashboardShell';

interface GachaLayoutProps {
  sections: DashboardSectionConfig[];
  controlsSlot?: ReactNode;
  onDrawGacha?: () => void;
}

export function GachaLayout({
  sections,
  controlsSlot,
  onDrawGacha
}: GachaLayoutProps): JSX.Element {
  return (
    <DashboardShell
      sections={sections}
      controlsSlot={controlsSlot}
      onDrawGacha={onDrawGacha}
    />
  );
}
