import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';

import { CreateGachaWizardStandalone } from '../../../modals/dialogs/CreateGachaWizardDialog';
import { DESKTOP_GRID_MAIN_HEIGHT_CSS } from '../components/dashboard/DashboardDesktopGrid';
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
 * /gacha/history と同じ dashboard-shell 構造を使い、UI構図を揃える。
 *
 * @param onDrawGacha モバイル下部タブの「ガチャ」ボタン押下時処理
 * @returns 新規ガチャ作成ページ
 */
export function GachaCreatePage({ onDrawGacha }: GachaCreatePageProps): JSX.Element {
  const { isMobile } = useResponsiveDashboard();
  const navigate = useNavigate();

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

  const createSection = (mobileLayout: boolean): JSX.Element => (
    <SectionContainer
      id={CREATE_SECTION_ID}
      title="新規ガチャを作成"
      description="ガチャ名・配信サムネイル・レアリティ・景品・PT設定をこの画面でまとめて登録できます。"
      actions={
        mobileLayout ? undefined : (
          <Link
            to="/gacha"
            className="gacha-create-section__back-button btn btn-muted rounded-full"
          >
            ガチャ画面に戻る
          </Link>
        )
      }
      className={clsx('gacha-create-section min-h-0', !mobileLayout && 'h-full')}
      contentClassName="gacha-create-section__content flex min-h-0 flex-col !pr-0 !space-y-0"
    >
      <div
        className={clsx(
          'gacha-create-section__scroll',
          mobileLayout
            ? 'gacha-create-section__scroll--mobile px-4 py-3 pb-24'
            : 'section-scroll flex-1 px-4 py-3'
        )}
      >
        <div className="gacha-create-section__wizard-panel flex min-h-0 flex-col rounded-2xl border border-border/40 bg-panel/35 p-4 sm:p-5">
          <CreateGachaWizardStandalone onClose={handleBackToGacha} />
        </div>
      </div>
    </SectionContainer>
  );

  return (
    <div id="gacha-create-page" className="gacha-create-page min-h-0 text-surface-foreground">
      <div className="gacha-create-page__dashboard-shell dashboard-shell relative flex w-full flex-col gap-4 pb-[5.5rem] lg:pb-0">
        {!isMobile ? (
          <div className="gacha-create-page__desktop dashboard-shell__desktop">
            <div className="gacha-create-page__desktop-inner mx-auto w-full max-w-[1280px]">
              <div
                data-view={CREATE_SECTION_ID}
                className="gacha-create-page__desktop-item h-full min-h-0"
                style={{ height: DESKTOP_GRID_MAIN_HEIGHT_CSS }}
              >
                <div className="gacha-create-section__desktop-item-root h-full min-h-0">
                  {createSection(false)}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="gacha-create-page__mobile dashboard-shell__mobile">
            <div data-view={CREATE_SECTION_ID} className="gacha-create-page__mobile-section dashboard-shell__mobile-section">
              {createSection(true)}
            </div>
          </div>
        )}

        {isMobile ? (
          <DashboardMobileTabBar
            sections={GACHA_CREATE_MOBILE_SECTIONS}
            onSelectSection={handleSelectMobileSection}
            onDrawGacha={onDrawGacha}
            onOpenHistory={handleOpenHistory}
            className="gacha-create-mobile-tabs"
          />
        ) : null}
      </div>
    </div>
  );
}
