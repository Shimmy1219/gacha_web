import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { HomeIcon } from '@heroicons/react/24/outline';
import { useResponsiveDashboard } from '../dashboard/useResponsiveDashboard';

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
  onExportAll?: () => void;
  onOpenPageSettings?: () => void;
  showDrawGachaButton?: boolean;
  showRegisterGachaButton?: boolean;
  showExportButton?: boolean;
  showDiscordLoginButton?: boolean;
  appearance?: 'default' | 'dark';
}

export function AppHeaderShell({
  title,
  tagline,
  onDrawGacha,
  onRegisterGacha,
  onExportAll,
  onOpenPageSettings,
  showDrawGachaButton = true,
  showRegisterGachaButton = true,
  showExportButton = true,
  showDiscordLoginButton = true,
  appearance = 'default'
}: AppHeaderShellProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const { isMobile } = useResponsiveDashboard();
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

  useEffect(() => {
    if (!isMobile && open) {
      setOpen(false);
    }
  }, [isMobile, open]);

  const isDarkAppearance = appearance === 'dark';

  return (
    <header
      ref={headerRef}
      className={clsx(
        'app-header-shell sticky top-0 z-40 border-b backdrop-blur-md transition-transform duration-300 ease-out will-change-transform',
        isHidden && '-translate-y-full',
        isDarkAppearance
          ? 'border-white/10 bg-slate-950/85 text-white shadow-[0_8px_32px_rgba(15,23,42,0.35)]'
          : 'border-border/60 bg-surface/90 text-surface-foreground shadow-sm'
      )}
    >
      <div className="app-header-shell__inner flex w-full flex-wrap items-center gap-4 px-2 py-2 sm:px-6">
        <div className="app-header-shell__brand flex flex-1 flex-wrap items-center gap-4">
          <HeaderBrand title={title} tagline={tagline} appearance={appearance} />
        </div>
        <div className="app-header-shell__actions flex flex-shrink-0 items-center gap-3">
          {!isMobile ? (
            <ToolbarActions
              mode="desktop"
              onDrawGacha={onDrawGacha}
              onRegisterGacha={onRegisterGacha}
              onExportAll={onExportAll}
              showDrawGachaButton={showDrawGachaButton}
              showRegisterGachaButton={showRegisterGachaButton}
              showExportButton={showExportButton}
            />
          ) : null}
          {showDiscordLoginButton && !isMobile ? (
            <DiscordLoginButton onOpenPageSettings={onOpenPageSettings} />
          ) : null}
          {isMobile ? (
            <MobileMenuButton
              open={open}
              onToggle={() => setOpen((prev) => !prev)}
              controlsId={drawerId}
            />
          ) : null}
        </div>
      </div>
      {isMobile ? (
        <ResponsiveToolbarRail
          open={open}
          onClose={handleClose}
          id={drawerId}
          labelledBy={drawerTitleId}
          appearance={appearance}
        >
          <div className="app-header-shell__mobile-layout flex h-full flex-col">
            <div className="app-header-shell__mobile-main flex flex-col gap-6 pb-6">
              <div className="app-header-shell__mobile-header flex items-center justify-between">
                <h2
                  id={drawerTitleId}
                className={clsx(
                  'text-xs font-semibold uppercase tracking-[0.3em]',
                  isDarkAppearance ? 'text-white/60' : 'text-muted-foreground'
                )}
              >
                ツールバー
              </h2>
              <button
                type="button"
                onClick={handleClose}
                className={clsx(
                  'text-sm transition',
                  isDarkAppearance ? 'text-white/60 hover:text-white' : 'text-muted-foreground hover:text-surface-foreground'
                )}
              >
                閉じる
              </button>
            </div>
            <ToolbarActions
              mode="mobile"
              onDrawGacha={onDrawGacha}
              onRegisterGacha={onRegisterGacha}
              onExportAll={onExportAll}
              showDrawGachaButton={showDrawGachaButton}
              showRegisterGachaButton={showRegisterGachaButton}
              showExportButton={showExportButton}
            />
              {showDiscordLoginButton ? (
                <div className="app-header-shell__mobile-login lg:hidden">
                  <DiscordLoginButton onOpenPageSettings={onOpenPageSettings} />
                </div>
              ) : null}
            </div>
            <div
              className={clsx(
                'app-header-shell__mobile-home sticky bottom-0 -mx-6 mt-auto border-t px-6 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 backdrop-blur',
                isDarkAppearance
                  ? 'border-white/10 bg-slate-950/90'
                  : 'border-border/60 bg-panel bg-opacity-95'
              )}
            >
              <Link
                to="/home"
                className={clsx(
                  'app-header-shell__mobile-home-button inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                  isDarkAppearance
                    ? 'border border-white/20 bg-white/10 text-white hover:border-white/40 hover:bg-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950'
                    : 'border border-border bg-panel text-surface-foreground hover:border-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white'
                )}
              >
                <HomeIcon className="h-5 w-5" />
                ホームに戻る
              </Link>
            </div>
          </div>
        </ResponsiveToolbarRail>
      ) : null}
    </header>
  );
}
