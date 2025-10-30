import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { clsx } from 'clsx';

import { DiscordLoginButton } from '../auth/DiscordLoginButton';
import { HeaderBrand } from './HeaderBrand';
import { MobileMenuButton } from './MobileMenuButton';
import { ResponsiveToolbarRail } from './ResponsiveToolbarRail';
import { ToolbarActions } from './ToolbarActions';

export interface AppHeaderShellProps {
  title: string;
  tagline?: string;
  onDrawGacha?: () => void;
  onRegisterGacha?: () => void;
  onOpenRealtime?: () => void;
  onExportAll?: () => void;
  onOpenPageSettings?: () => void;
  showDrawGachaButton?: boolean;
  showRegisterGachaButton?: boolean;
  showRealtimeButton?: boolean;
  showExportButton?: boolean;
}

export function AppHeaderShell({
  title,
  tagline,
  onDrawGacha,
  onRegisterGacha,
  onOpenRealtime,
  onExportAll,
  onOpenPageSettings,
  showDrawGachaButton = true,
  showRegisterGachaButton = true,
  showRealtimeButton = true,
  showExportButton = true
}: AppHeaderShellProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const drawerId = useId();
  const drawerTitleId = useId();
  const headerRef = useRef<HTMLElement>(null);
  const headerHeightRef = useRef(0);
  const hiddenStateRef = useRef(isHidden);
  const lastScrollYRef = useRef(0);

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
      headerHeightRef.current = height;
      root.style.setProperty('--app-header-height', `${height}px`);
      const stickyOffset = hiddenStateRef.current ? 0 : height;
      root.style.setProperty('--app-sticky-top', `${stickyOffset}px`);
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
      root.style.removeProperty('--app-sticky-top');
    };
  }, []);

  useEffect(() => {
    hiddenStateRef.current = isHidden;

    if (typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    const stickyOffset = isHidden ? 0 : headerHeightRef.current;
    root.style.setProperty('--app-sticky-top', `${stickyOffset}px`);
  }, [isHidden]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    lastScrollYRef.current = window.scrollY;

    const SCROLL_THRESHOLD = 6;
    let rafId = 0;

    const handleScroll = () => {
      if (rafId !== 0) {
        return;
      }

      rafId = window.requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const delta = currentY - lastScrollYRef.current;
        const absDelta = Math.abs(delta);
        const headerHeight = headerHeightRef.current;
        const nearTop = currentY <= headerHeight;

        if (nearTop) {
          setIsHidden(false);
        } else if (absDelta > SCROLL_THRESHOLD) {
          if (delta > 0 && currentY > headerHeight) {
            setIsHidden(true);
          } else if (delta < 0) {
            setIsHidden(false);
          }
        }

        lastScrollYRef.current = currentY;
        rafId = 0;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  useEffect(() => {
    if (open) {
      setIsHidden(false);
    }
  }, [open]);

  return (
    <header
      ref={headerRef}
      className={clsx(
        'app-header-shell sticky top-0 z-40 border-b border-border/60 bg-surface/90 backdrop-blur-md transition-transform duration-300 ease-out will-change-transform',
        isHidden && '-translate-y-full'
      )}
    >
      <div className="app-header-shell__inner flex w-full flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
        <div className="app-header-shell__brand flex flex-1 flex-wrap items-center gap-4">
          <HeaderBrand title={title} tagline={tagline} />
        </div>
        <div className="app-header-shell__actions flex flex-shrink-0 items-center gap-3">
          <ToolbarActions
            mode="desktop"
            onDrawGacha={onDrawGacha}
            onRegisterGacha={onRegisterGacha}
            onOpenRealtime={onOpenRealtime}
            onExportAll={onExportAll}
            showDrawGachaButton={showDrawGachaButton}
            showRegisterGachaButton={showRegisterGachaButton}
            showRealtimeButton={showRealtimeButton}
            showExportButton={showExportButton}
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
        <ToolbarActions
          mode="mobile"
          onDrawGacha={onDrawGacha}
          onRegisterGacha={onRegisterGacha}
          onOpenRealtime={onOpenRealtime}
          onExportAll={onExportAll}
          showDrawGachaButton={showDrawGachaButton}
          showRegisterGachaButton={showRegisterGachaButton}
          showRealtimeButton={showRealtimeButton}
          showExportButton={showExportButton}
        />
        <div className="app-header-shell__mobile-login lg:hidden">
          <DiscordLoginButton onOpenPageSettings={onOpenPageSettings} />
        </div>
      </ResponsiveToolbarRail>
    </header>
  );
}
