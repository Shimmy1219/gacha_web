import { useCallback, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';

import {
  CreateGachaWizardStandalone,
  type CreateGachaWizardStepState
} from '../../../modals/dialogs/CreateGachaWizardDialog';
import { useGachaRegistrationState } from '../hooks/useGachaRegistrationState';
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

/**
 * /gacha から独立した新規ガチャ作成画面を表示する。
 * モバイル時のみページとして表示し、PC時は /gacha へ戻す。
 *
 * @returns 新規ガチャ作成ページ
 */
export function GachaCreatePage(): JSX.Element {
  const { isMobile } = useResponsiveDashboard();
  const { shouldShowSplash } = useGachaRegistrationState();
  const navigate = useNavigate();
  const [stepState, setStepState] = useState<CreateGachaWizardStepState>({
    currentStep: 1,
    totalSteps: 3
  });

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
      filterButton={
        <span
          id="gacha-create-step-indicator"
          className="gacha-create-section__step-indicator text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground"
        >
          ステップ{stepState.currentStep} / {stepState.totalSteps}
        </span>
      }
      className="gacha-create-section min-h-0"
      contentClassName="gacha-create-section__content flex min-h-0 flex-col !pr-0 !space-y-0"
    >
      <div
        className={clsx(
          'gacha-create-section__scroll gacha-create-section__scroll--mobile px-4 py-3',
          shouldShowSplash ? 'pb-4' : 'pb-[calc(5.5rem+env(safe-area-inset-bottom))]'
        )}
      >
        <div className="gacha-create-section__wizard-panel flex min-h-0 flex-col">
          <CreateGachaWizardStandalone
            onClose={handleBackToGacha}
            onStepChange={setStepState}
            showStepSummary={false}
          />
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

        {!shouldShowSplash ? (
          <DashboardMobileTabBar
            sections={GACHA_CREATE_MOBILE_SECTIONS}
            onSelectSection={handleSelectMobileSection}
            onOpenHistory={handleOpenHistory}
            className="gacha-create-mobile-tabs"
          />
        ) : null}
      </div>
    </div>
  );
}
