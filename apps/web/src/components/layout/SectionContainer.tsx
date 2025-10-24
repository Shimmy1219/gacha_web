import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';

import { useResponsiveDashboard } from '../dashboard/useResponsiveDashboard';

interface SectionContainerProps {
  id?: string;
  title: string;
  description?: string;
  accentLabel?: string;
  actions?: ReactNode;
  filterButton?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function SectionContainer({
  id,
  title,
  description,
  accentLabel,
  actions,
  filterButton,
  footer,
  children,
  className,
  contentClassName
}: SectionContainerProps): JSX.Element {
  const sectionRef = useRef<HTMLElement>(null);
  const headerWrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [hasScrollbar, setHasScrollbar] = useState(false);
  const { isMobile } = useResponsiveDashboard();

  const updateScrollbarState = useCallback(() => {
    const element = contentRef.current;
    if (!element) {
      return;
    }

    const scrollableHeight = element.scrollHeight - element.clientHeight;
    setHasScrollbar(scrollableHeight > 1);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    updateScrollbarState();
    window.addEventListener('resize', updateScrollbarState);

    let resizeObserver: ResizeObserver | undefined;
    const element = contentRef.current;

    if (element && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateScrollbarState();
      });
      resizeObserver.observe(element);
    }

    return () => {
      window.removeEventListener('resize', updateScrollbarState);
      resizeObserver?.disconnect();
    };
  }, [updateScrollbarState]);

  useEffect(() => {
    updateScrollbarState();
  }, [children, updateScrollbarState]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const sectionEl = sectionRef.current;
    const headerEl = headerWrapperRef.current;

    if (!sectionEl || !headerEl) {
      return;
    }

    const updateHeaderHeight = () => {
      const { height } = headerEl.getBoundingClientRect();
      sectionEl.style.setProperty('--section-header-height', `${height}px`);
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
      sectionEl.style.removeProperty('--section-header-height');
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id={id}
      className={clsx(
        'section-container group relative flex min-h-0 flex-col overflow-hidden bg-panel/95 p-4 text-sm ring-1 ring-inset ring-white/5',
        !isMobile && 'h-full rounded-[1.5rem] border border-border/70',
        isMobile && 'section-container--mobile',
        'before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-accent/40 before:to-transparent before:opacity-0 before:transition-opacity before:duration-300 group-hover:before:opacity-100',
        'after:pointer-events-none after:absolute after:-inset-x-px after:-inset-y-px after:bg-panel-overlay after:opacity-0 after:transition-opacity after:duration-300 group-hover:after:opacity-100',
        className
      )}
    >
      <div className="section-container__body relative z-[1] flex h-full min-h-0 flex-col gap-6">
        <div
          ref={headerWrapperRef}
          className="section-container__header-wrapper"
        >
          <header className="section-container__header flex shrink-0 flex-wrap items-start justify-between gap-4">
            <div className="section-container__header-primary flex flex-1 flex-col gap-2 sm:w-full">
              {accentLabel ? (
                <span className="section-container__accent badge">{accentLabel}</span>
              ) : null}
              <div className="section-container__title-block space-y-1 sm:max-w-none">
                <div className="section-container__title-row flex items-center gap-3">
                  <h2 className="section-container__title flex-1 text-lg font-semibold text-surface-foreground sm:text-xl">{title}</h2>
                  {filterButton ? (
                    <div className="section-container__filter-button-wrapper flex shrink-0 items-center">
                      {filterButton}
                    </div>
                  ) : null}
                </div>
                {description ? (
                  <p className="section-container__description text-xs text-muted-foreground sm:w-full">{description}</p>
                ) : null}
              </div>
            </div>
            {actions ? <div className="section-container__actions flex shrink-0 items-center gap-2">{actions}</div> : null}
          </header>
        </div>
        <div
          className={clsx(
            'section-container__content-wrapper min-h-0',
            isMobile ? 'flex-none overflow-visible' : 'flex-1 overflow-hidden'
          )}
        >
          <div
            ref={contentRef}
            className={clsx(
              'section-container__content min-h-0 space-y-4',
              isMobile ? 'h-auto overflow-visible' : 'section-scroll h-full',
              !isMobile && !hasScrollbar && 'section-scroll--no-scrollbar',
              contentClassName
            )}
          >
            {children}
          </div>
        </div>
        {footer ? (
          <footer className="section-container__footer border-t border-white/5 pt-4 text-xs text-muted-foreground">{footer}</footer>
        ) : null}
      </div>
    </section>
  );
}
