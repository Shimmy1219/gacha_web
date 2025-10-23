import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { DiscordLoginButton } from '../auth/DiscordLoginButton';
import { HeaderBrand } from './HeaderBrand';
import { MobileMenuButton } from './MobileMenuButton';
import { ResponsiveToolbarRail } from './ResponsiveToolbarRail';
import { ToolbarActions } from './ToolbarActions';
import { ToolbarSummary } from './ToolbarSummary';

export interface AppHeaderShellProps {
  title: string;
  tagline?: string;
  summaryLabel: string;
  summaryVariant?: 'default' | 'warning' | 'success';
  summaryDescription?: string;
  onDrawGacha?: () => void;
  onRegisterGacha?: () => void;
  onOpenRealtime?: () => void;
  onExportAll?: () => void;
  onOpenPageSettings?: () => void;
}

export function AppHeaderShell({
  title,
  tagline,
  summaryLabel,
  summaryVariant = 'default',
  summaryDescription,
  onDrawGacha,
  onRegisterGacha,
  onOpenRealtime,
  onExportAll,
  onOpenPageSettings
}: AppHeaderShellProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const drawerTitleId = useId();
  const headerRef = useRef<HTMLElement>(null);

  const handleClose = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const headerEl = headerRef.current;
    if (!headerEl) {
      return;
    }

    const root = document.documentElement;

    const updateHeaderHeight = () => {
      const { height } = headerEl.getBoundingClientRect();
      root.style.setProperty('--app-header-height', `${height}px`);
    };

    updateHeaderHeight();

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateHeaderHeight);
      resizeObserver.observe(headerEl);
    }

    window.addEventListener('resize', updateHeaderHeight);

    return () => {
      window.removeEventListener('resize', updateHeaderHeight);
      resizeObserver?.disconnect();
      root.style.removeProperty('--app-header-height');
    };
  }, []);

  return (
    <header
      ref={headerRef}
      className="app-header-shell sticky top-0 z-40 border-b border-border/60 bg-[#0b0b0f]/90"
    >
      <div className="app-header-shell__inner flex w-full flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
        <div className="app-header-shell__brand flex flex-1 flex-wrap items-center gap-4">
          <HeaderBrand title={title} tagline={tagline} />
          <ToolbarSummary
            mode="desktop"
            label={summaryLabel}
            variant={summaryVariant}
            description={summaryDescription}
          />
        </div>
        <div className="app-header-shell__actions flex flex-shrink-0 items-center gap-3">
          <ToolbarActions
            mode="desktop"
            onDrawGacha={onDrawGacha}
            onRegisterGacha={onRegisterGacha}
            onOpenRealtime={onOpenRealtime}
            onExportAll={onExportAll}
          />
          <div className="hidden lg:block">
            <DiscordLoginButton onOpenPageSettings={onOpenPageSettings} />
          </div>
          <MobileMenuButton
            open={open}
            onToggle={() => setOpen((prev) => !prev)}
            controlsId={drawerId}
          />
        </div>
      </div>
      <ResponsiveToolbarRail
        open={open}
        onClose={handleClose}
        id={drawerId}
        labelledBy={drawerTitleId}
      >
        <div className="app-header-shell__mobile-header flex items-center justify-between">
          <h2 id={drawerTitleId} className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            ツールバー
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-sm text-muted-foreground transition hover:text-surface-foreground"
          >
            閉じる
          </button>
        </div>
        <ToolbarSummary
          mode="mobile"
          label={summaryLabel}
          variant={summaryVariant}
          description={summaryDescription}
        />
        <ToolbarActions
          mode="mobile"
          onDrawGacha={onDrawGacha}
          onRegisterGacha={onRegisterGacha}
          onOpenRealtime={onOpenRealtime}
          onExportAll={onExportAll}
        />
        <div className="app-header-shell__mobile-login lg:hidden">
          <DiscordLoginButton onOpenPageSettings={onOpenPageSettings} />
        </div>
      </ResponsiveToolbarRail>
    </header>
  );
}
