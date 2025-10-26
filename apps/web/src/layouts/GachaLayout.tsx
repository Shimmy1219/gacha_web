import { type ReactNode, type RefObject } from 'react';
import { clsx } from 'clsx';

import { AppHeaderShell } from '../pages/gacha/components/app-shell/AppHeaderShell';

export interface GachaLayoutProps {
  title: string;
  tagline?: string;
  mainRef: RefObject<HTMLElement>;
  isMobile: boolean;
  onDrawGacha?: () => void;
  onRegisterGacha?: () => void;
  onOpenRealtime?: () => void;
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
  onOpenRealtime,
  onExportAll,
  onOpenPageSettings,
  children
}: GachaLayoutProps): JSX.Element {
  return (
    <div className="app min-h-screen bg-transparent text-surface-foreground">
      <AppHeaderShell
        title={title}
        tagline={tagline}
        onDrawGacha={onDrawGacha}
        onRegisterGacha={onRegisterGacha}
        onOpenRealtime={onOpenRealtime}
        onExportAll={onExportAll}
        onOpenPageSettings={onOpenPageSettings}
      />
      <main ref={mainRef} className={clsx('app__main', !isMobile && 'px-4 pb-[5px] pt-4')}>
        {children}
      </main>
    </div>
  );
}
