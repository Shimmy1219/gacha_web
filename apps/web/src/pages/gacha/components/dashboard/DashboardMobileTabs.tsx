import type { DashboardSectionConfig } from './DashboardShell';
import { useDashboardShell } from './DashboardShell';
import { DashboardMobileTabBar } from './DashboardMobileTabBar';

interface DashboardMobileTabsProps {
  sections: DashboardSectionConfig[];
  onDrawGacha?: () => void;
  onOpenHistory?: () => void;
}

/**
 * DashboardShell の状態に連動したモバイルタブを描画する。
 *
 * @param sections タブ表示するセクション一覧
 * @param onDrawGacha 「ガチャ」タブ押下時の処理
 * @param onOpenHistory 「履歴」タブ押下時の処理
 * @returns モバイル用タブ群
 */
export function DashboardMobileTabs({
  sections,
  onDrawGacha,
  onOpenHistory
}: DashboardMobileTabsProps): JSX.Element | null {
  const { isMobile, activeView, setActiveView } = useDashboardShell();

  if (!isMobile || sections.length === 0) {
    return null;
  }

  return (
    <DashboardMobileTabBar
      sections={sections}
      activeSectionId={activeView}
      onSelectSection={setActiveView}
      onDrawGacha={onDrawGacha}
      onOpenHistory={onOpenHistory}
    />
  );
}
