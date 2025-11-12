import {
  DialogBackdrop,
  DialogDescription,
  DialogPanel,
  DialogTitle
} from '@headlessui/react';
import { clsx } from 'clsx';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState
} from 'react';

import { type ModalSize } from './ModalTypes';

const SIZE_CLASS_MAP: Record<ModalSize, string> = {
  sm: 'max-w-lg',
  md: 'max-w-xl',
  lg: 'max-w-[55rem]',
  xl: 'max-w-[64rem]',
  full: 'max-w-[min(96vw,110rem)] w-[min(96vw,110rem)] md:max-h-[96vh]'
};

const DESKTOP_INLINE_MAX_HEIGHT_THRESHOLD = 900;

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function useMediaQuery(query: string): boolean | undefined {
  const [matches, setMatches] = useState<boolean | undefined>(undefined);

  useIsomorphicLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia(query);
    const updateMatchState = (event?: MediaQueryListEvent) => {
      setMatches(event?.matches ?? mediaQuery.matches);
    };

    updateMatchState();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateMatchState);
      return () => mediaQuery.removeEventListener('change', updateMatchState);
    }

    mediaQuery.addListener(updateMatchState);
    return () => mediaQuery.removeListener(updateMatchState);
  }, [query]);

  return matches;
}

interface ModalViewportMetrics {
  maxHeight?: number;
  viewportHeight?: number;
}

function useModalViewportMetrics(offsetRem = 4): ModalViewportMetrics {
  const [metrics, setMetrics] = useState<ModalViewportMetrics>({});

  useIsomorphicLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const computeViewportMetrics = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const rootFontSize = Number.parseFloat(
        window.getComputedStyle(window.document.documentElement).fontSize
      );
      const remInPx = Number.isFinite(rootFontSize) ? rootFontSize : 16;
      const offsetPx = offsetRem * remInPx;
      const nextHeight = Math.max(viewportHeight - offsetPx, 0);

      setMetrics((previous) => {
        const hasViewportHeightChanged = previous.viewportHeight !== viewportHeight;
        const hasMaxHeightChanged =
          previous.maxHeight === undefined || Math.abs(previous.maxHeight - nextHeight) > 0.5;

        if (!hasViewportHeightChanged && !hasMaxHeightChanged) {
          return previous;
        }

        return {
          maxHeight: nextHeight,
          viewportHeight
        };
      });
    };

    computeViewportMetrics();

    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', computeViewportMetrics, { passive: true });
    viewport?.addEventListener('scroll', computeViewportMetrics, { passive: true });
    window.addEventListener('resize', computeViewportMetrics, { passive: true });
    window.addEventListener('orientationchange', computeViewportMetrics);

    return () => {
      viewport?.removeEventListener('resize', computeViewportMetrics);
      viewport?.removeEventListener('scroll', computeViewportMetrics);
      window.removeEventListener('resize', computeViewportMetrics);
      window.removeEventListener('orientationchange', computeViewportMetrics);
    };
  }, [offsetRem]);

  return metrics;
}

interface ModalOverlayProps extends ComponentPropsWithoutRef<typeof DialogBackdrop> {}

export const ModalOverlay = forwardRef<
  ElementRef<typeof DialogBackdrop>,
  ModalOverlayProps
>(function ModalOverlay({ className, ...props }, ref) {
  return (
    <DialogBackdrop
      {...props}
      ref={ref}
      className={clsx(
        'modal-overlay fixed inset-0 bg-black/65 backdrop-blur-sm transition-opacity duration-200',
        className
      )}
    />
  );
});

interface ModalPanelProps extends ComponentPropsWithoutRef<typeof DialogPanel> {
  size?: ModalSize;
  paddingClassName?: string;
}

export const ModalPanel = forwardRef<
  ElementRef<typeof DialogPanel>,
  ModalPanelProps
>(function ModalPanel({ size = 'md', className, paddingClassName = 'p-6', ...props }, ref) {
  const { style, ...restProps } = props;
  const { maxHeight: viewportMaxHeight, viewportHeight } = useModalViewportMetrics();
  const isBelowMdViewport = useMediaQuery('(max-width: 767px)');

  const shouldApplyInlineMaxHeight = useMemo(() => {
    if (viewportMaxHeight === undefined) {
      return false;
    }

    if (isBelowMdViewport !== false) {
      return true;
    }

    return (
      viewportHeight !== undefined && viewportHeight < DESKTOP_INLINE_MAX_HEIGHT_THRESHOLD
    );
  }, [viewportMaxHeight, isBelowMdViewport, viewportHeight]);

  const mergedStyle = useMemo(() => {
    if (
      style?.maxHeight != null ||
      viewportMaxHeight === undefined ||
      !shouldApplyInlineMaxHeight
    ) {
      return style;
    }

    return { ...style, maxHeight: viewportMaxHeight };
  }, [style, viewportMaxHeight, shouldApplyInlineMaxHeight]);

  return (
    <DialogPanel
      {...restProps}
      ref={ref}
      className={clsx(
        'modal-panel relative z-10 flex w-full transform flex-col overflow-x-hidden overflow-y-auto rounded-2xl border border-border/70 bg-panel/95 text-surface-foreground backdrop-blur md:max-h-none',
        !shouldApplyInlineMaxHeight && 'md:overflow-hidden',
        'max-h-[calc(100vh-4rem)]',
        SIZE_CLASS_MAP[size],
        paddingClassName,
        className
      )}
      style={mergedStyle}
    />
  );
});

interface ModalHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function ModalHeader({ title, description, actions, className }: ModalHeaderProps): JSX.Element {
  return (
    <div
      className={clsx(
        'modal-header flex flex-wrap items-start justify-between gap-4 border-b border-white/5 pb-4 pr-12 md:pr-0',
        className
      )}
    >
      <div className="space-y-2">
        <DialogTitle className="text-lg font-semibold text-surface-foreground">{title}</DialogTitle>
        {description ? (
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </DialogDescription>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

interface ModalBodyProps extends ComponentPropsWithoutRef<'div'> {}

export const ModalBody = forwardRef<ElementRef<'div'>, ModalBodyProps>(function ModalBody(
  { className, ...props },
  ref
) {
  return <div {...props} ref={ref} className={clsx('modal-body mt-2 space-y-2 text-sm', className)} />;
});

interface ModalFooterProps extends ComponentPropsWithoutRef<'div'> {}

export function ModalFooter({ className, ...props }: ModalFooterProps): JSX.Element {
  return (
    <div
      {...props}
      className={clsx(
        'modal-footer mt-8 flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-white/5 pt-4',
        className
      )}
    />
  );
}
