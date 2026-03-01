import { type ReactNode, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { clsx } from 'clsx';

import { AppHeaderShell } from '../pages/gacha/components/app-shell/AppHeaderShell';
import { useGachaRegistrationState } from '../pages/gacha/hooks/useGachaRegistrationState';
import { ReceiveNavActions } from '../pages/receive/components/ReceiveNavActions';
import { ReceiveMobileTabs } from '../pages/receive/components/ReceiveMobileTabs';

export interface GachaLayoutProps {
  title: string;
  tagline?: string;
  mainRef: RefObject<HTMLElement>;
  isMobile: boolean;
  onDrawGacha?: () => void;
  onRegisterGacha?: () => void;
  onOpenHistory?: () => void;
  onExportAll?: () => void;
  onOpenPageSettings?: () => void;
  children: ReactNode;
}

export function GachaLayout({
  title,
  tagline,
  mainRef,
  isMobile,
  onDrawGacha,
  onRegisterGacha,
  onOpenHistory,
  onExportAll,
  onOpenPageSettings,
  children
}: GachaLayoutProps): JSX.Element {
  const location = useLocation();
  const isReceiveRoute = location.pathname.startsWith('/receive');
  const isGachaTestRoute = location.pathname.startsWith('/gacha/test');
  const { shouldShowSplash } = useGachaRegistrationState();

  const shouldShowToolbarActions = !isReceiveRoute && !isGachaTestRoute && !shouldShowSplash;
  const shouldShowDiscordLoginButton = !shouldShowSplash;
  const receiveNavActions = isReceiveRoute ? <ReceiveNavActions mode="desktop" /> : null;
  const receiveNavActionsMobile = isReceiveRoute ? <ReceiveNavActions mode="mobile" /> : null;
  const shouldShowReceiveMobileTabs = isReceiveRoute && isMobile;

  return (
    <div className="app min-h-screen bg-transparent text-surface-foreground">
      <AppHeaderShell
        title={title}
        tagline={tagline}
        onDrawGacha={onDrawGacha}
        onRegisterGacha={onRegisterGacha}
        onOpenHistory={onOpenHistory}
        onExportAll={onExportAll}
        onOpenPageSettings={onOpenPageSettings}
        showDrawGachaButton={shouldShowToolbarActions}
        showRegisterGachaButton={shouldShowToolbarActions}
        showHistoryButton={shouldShowToolbarActions}
        showExportButton={shouldShowToolbarActions}
        showDiscordLoginButton={shouldShowDiscordLoginButton}
        navActions={receiveNavActions}
        mobileNavActions={receiveNavActionsMobile}
        appearance="default"
      />
      <main
        ref={mainRef}
        className={clsx('app__main', !isMobile && 'px-4 pb-[5px] pt-4', shouldShowReceiveMobileTabs && 'pb-[6.5rem]')}
      >
        {children}
      </main>
      {shouldShowReceiveMobileTabs ? <ReceiveMobileTabs /> : null}
    </div>
  );
}
