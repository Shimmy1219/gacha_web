import { useCallback, useMemo } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { PageSettingsStandalone } from '../../modals/dialogs/PageSettingsDialog';
import { parseSettingsPayloadFromSearch } from '../../features/settings/openPageSettings';
import { useResponsiveDashboard } from '../gacha/components/dashboard/useResponsiveDashboard';
import { SectionContainer } from '../gacha/components/layout/SectionContainer';

const SETTINGS_SECTION_ID = 'settings';

/**
 * モバイル向けのサイト設定ページ。
 * /settings 直下で表示し、PCでは従来どおりモーダル導線を使うため /gacha へ戻す。
 *
 * @returns サイト設定ページ
 */
export function SettingsPage(): JSX.Element {
  const { isMobile } = useResponsiveDashboard();
  const navigate = useNavigate();
  const location = useLocation();

  const payload = useMemo(() => parseSettingsPayloadFromSearch(location.search), [location.search]);

  if (!isMobile) {
    return <Navigate to="/gacha" replace />;
  }

  const handleBackToGacha = useCallback(() => {
    navigate('/gacha');
  }, [navigate]);

  return (
    <div id="settings-page" className="settings-page min-h-0 text-surface-foreground">
      <div className="settings-page__dashboard-shell dashboard-shell relative flex w-full flex-col gap-4 pb-4">
        <div className="settings-page__mobile dashboard-shell__mobile">
          <div data-view={SETTINGS_SECTION_ID} className="settings-page__mobile-section dashboard-shell__mobile-section">
            <SectionContainer
              id={SETTINGS_SECTION_ID}
              title="サイト設定"
              description="ガチャ設定、サイトカラー、表示レイアウトなどを調整できます。"
              className="settings-section min-h-0"
              contentClassName="settings-section__content flex min-h-0 flex-col !pr-0 !space-y-0"
            >
              <div className="settings-section__scroll settings-section__scroll--mobile px-4 py-3 pb-4">
                <div className="settings-section__panel flex min-h-0 flex-col">
                  <PageSettingsStandalone onClose={handleBackToGacha} payload={payload} />
                </div>
              </div>
            </SectionContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
