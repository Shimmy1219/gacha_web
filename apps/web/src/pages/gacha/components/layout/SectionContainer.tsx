import {
  type ReactNode,
  type Ref,
  type TouchEventHandler,
  type UIEventHandler,
  type WheelEventHandler,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';
import { clsx } from 'clsx';

import { useResponsiveDashboard } from '../dashboard/useResponsiveDashboard';

interface SectionContainerProps {
  id?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  leadingAction?: ReactNode;
  filterButton?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  forceMobile?: boolean;
  contentElementRef?: Ref<HTMLDivElement>;
  onContentScroll?: UIEventHandler<HTMLDivElement>;
  onContentWheel?: WheelEventHandler<HTMLDivElement>;
  onContentTouchStart?: TouchEventHandler<HTMLDivElement>;
  onContentTouchMove?: TouchEventHandler<HTMLDivElement>;
  onContentTouchEnd?: TouchEventHandler<HTMLDivElement>;
  onContentTouchCancel?: TouchEventHandler<HTMLDivElement>;
}

export function SectionContainer({
  id,
  title,
  description,
  actions,
  leadingAction,
  filterButton,
  children,
  className,
  contentClassName,
  forceMobile = false,
  contentElementRef,
  onContentScroll,
  onContentWheel,
  onContentTouchStart,
  onContentTouchMove,
  onContentTouchEnd,
  onContentTouchCancel
}: SectionContainerProps): JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null);
  const [hasScrollbar, setHasScrollbar] = useState(false);
  const { isMobile } = useResponsiveDashboard();
  const isMobileLayout = forceMobile || isMobile;

  const setContentElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node;
      if (!contentElementRef) {
        return;
      }
      if (typeof contentElementRef === 'function') {
        contentElementRef(node);
        return;
      }
      contentElementRef.current = node;
    },
    [contentElementRef]
  );

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

  return (
    <section
      id={id}
      className={clsx(
        'section-container group relative flex min-h-0 flex-col overflow-hidden bg-panel/95 py-4 text-sm ring-1 ring-inset ring-white/5',
        !isMobileLayout && 'h-full rounded-[1.5rem] border border-border/70',
        isMobileLayout && 'section-container--mobile',
        'before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-accent/40 before:to-transparent before:opacity-0 before:transition-opacity before:duration-300 group-hover:before:opacity-100',
        'after:pointer-events-none after:absolute after:-inset-x-px after:-inset-y-px after:bg-panel-overlay after:opacity-0 after:transition-opacity after:duration-300 group-hover:after:opacity-100',
        className
      )}
    >
      <div className="section-container__body relative z-[1] flex h-full min-h-0 flex-col gap-2">
        <header className="section-container__header flex shrink-0 flex-wrap items-start justify-between gap-4 px-4">
          <div className="section-container__header-primary flex flex-1 flex-col gap-2 sm:w-full">
            <div className="section-container__title-block space-y-1 sm:max-w-none">
              <div className="section-container__title-row flex items-center justify-between gap-3">
                <div className="section-container__title-row-left flex min-w-0 flex-1 items-center gap-2">
                  {leadingAction ? (
                    <div className="section-container__leading-action-wrapper flex shrink-0 items-center">
                      {leadingAction}
                    </div>
                  ) : null}
                  <h2 className="section-container__title min-w-0 flex-1 text-lg font-semibold text-surface-foreground sm:text-xl">{title}</h2>
                </div>
                {filterButton ? (
                  <div className="section-container__title-row-right flex shrink-0 items-center">
                    <div className="section-container__filter-button-wrapper flex shrink-0 items-center">
                      {filterButton}
                    </div>
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
        <div
          className={clsx(
            'section-container__content-wrapper min-h-0',
            isMobileLayout ? 'flex-none overflow-visible' : 'flex-1 overflow-hidden'
          )}
        >
          <div
            ref={setContentElementRef}
            className={clsx(
              'section-container__content min-h-0 space-y-4',
              isMobileLayout ? 'h-auto overflow-visible' : 'section-scroll h-full',
              !isMobileLayout && !hasScrollbar && 'section-scroll--no-scrollbar',
              contentClassName
            )}
            onScroll={onContentScroll}
            onWheel={onContentWheel}
            onTouchStart={onContentTouchStart}
            onTouchMove={onContentTouchMove}
            onTouchEnd={onContentTouchEnd}
            onTouchCancel={onContentTouchCancel}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
