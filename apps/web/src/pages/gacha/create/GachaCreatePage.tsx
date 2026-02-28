import { useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { CreateGachaWizardStandalone } from '../../../modals/dialogs/CreateGachaWizardDialog';
import {
  DashboardMobileTabBar,
  type DashboardMobileTabSection
} from '../components/dashboard/DashboardMobileTabBar';
import { useResponsiveDashboard } from '../components/dashboard/useResponsiveDashboard';
import { SectionContainer } from '../components/layout/SectionContainer';

const CREATE_SECTION_ID = 'create';
const GACHA_CREATE_MOBILE_SECTIONS: readonly DashboardMobileTabSection[] = [
  { id: 'rarity', label: 'レアリティ' },
  { id: 'items', label: 'アイテム' },
  { id: 'users', label: 'ユーザー' },
  { id: 'riagu', label: 'リアグ' }
];

interface GachaCreatePageProps {
  onDrawGacha?: () => void;
}

/**
 * /gacha から独立した新規ガチャ作成画面を表示する。
 * モバイル時のみページとして表示し、PC時は /gacha へ戻す。
 *
 * @param onDrawGacha モバイル下部タブの「ガチャ」ボタン押下時処理
 * @returns 新規ガチャ作成ページ
 */
export function GachaCreatePage({ onDrawGacha }: GachaCreatePageProps): JSX.Element {
  const { isMobile } = useResponsiveDashboard();
  const navigate = useNavigate();

  if (!isMobile) {
    return <Navigate to="/gacha" replace />;
  }

  const handleBackToGacha = useCallback(() => {
    navigate('/gacha');
  }, [navigate]);

  const handleSelectMobileSection = useCallback(
    (sectionId: string) => {
      const searchParams = new URLSearchParams({ view: sectionId });
      navigate(`/gacha?${searchParams.toString()}`);
    },
    [navigate]
  );

  const handleOpenHistory = useCallback(() => {
    navigate('/gacha/history');
  }, [navigate]);

  const createSection = (): JSX.Element => (
    <SectionContainer
      id={CREATE_SECTION_ID}
      title="新規ガチャを作成"
      description="ガチャ名・配信サムネイル・レアリティ・景品・PT設定をこの画面でまとめて登録できます。"
      className="gacha-create-section min-h-0"
      contentClassName="gacha-create-section__content flex min-h-0 flex-col !pr-0 !space-y-0"
    >
      <div className="gacha-create-section__scroll gacha-create-section__scroll--mobile px-4 py-3 pb-24">
        <div className="gacha-create-section__wizard-panel flex min-h-0 flex-col rounded-2xl border border-border/40 bg-panel/35 p-4 sm:p-5">
          <CreateGachaWizardStandalone onClose={handleBackToGacha} />
        </div>
      </div>
    </SectionContainer>
  );

  return (
    <div id="gacha-create-page" className="gacha-create-page min-h-0 text-surface-foreground">
      <div className="gacha-create-page__dashboard-shell dashboard-shell relative flex w-full flex-col gap-4 pb-[5.5rem] lg:pb-0">
        <div className="gacha-create-page__mobile dashboard-shell__mobile">
          <div data-view={CREATE_SECTION_ID} className="gacha-create-page__mobile-section dashboard-shell__mobile-section">
            {createSection()}
          </div>
        </div>

        <DashboardMobileTabBar
          sections={GACHA_CREATE_MOBILE_SECTIONS}
          onSelectSection={handleSelectMobileSection}
          onDrawGacha={onDrawGacha}
          onOpenHistory={handleOpenHistory}
          className="gacha-create-mobile-tabs"
        />
      </div>
    </div>
  );
}
