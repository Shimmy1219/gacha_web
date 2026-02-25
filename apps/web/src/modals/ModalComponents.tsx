import {
  DialogBackdrop,
  DialogDescription,
  DialogPanel,
  DialogTitle
} from '@headlessui/react';
import { clsx } from 'clsx';
import {
  createContext,
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { type ModalSize } from './ModalTypes';

const SIZE_CLASS_MAP: Record<ModalSize, string> = {
  sm: 'max-w-lg',
  md: 'max-w-xl',
  lg: 'max-w-[55rem]',
  xl: 'max-w-[64rem]',
  full: 'max-w-[min(96vw,110rem)] w-[min(96vw,110rem)]'
};

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface ModalViewportMetrics {
  maxHeight?: number;
  viewportHeight?: number;
  keyboardInset?: number;
}

const ModalKeyboardInsetContext = createContext<number>(0);

const KEYBOARD_VISIBILITY_HEIGHT_DELTA_THRESHOLD = 160;

function isKeyboardVisible(viewport: VisualViewport | null, layoutViewportHeight: number): boolean {
  if (!viewport) {
    return false;
  }

  const heightDelta = layoutViewportHeight - viewport.height;

  return heightDelta > KEYBOARD_VISIBILITY_HEIGHT_DELTA_THRESHOLD && viewport.height < layoutViewportHeight;
}

function useModalViewportMetrics(offsetRem = 4): ModalViewportMetrics {
  const [metrics, setMetrics] = useState<ModalViewportMetrics>({});
  const stableViewportHeightRef = useRef<number>();

  useIsomorphicLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const computeViewportMetrics = () => {
      const layoutViewportHeight = window.innerHeight;
      const viewport = window.visualViewport;
      const keyboardVisible = isKeyboardVisible(viewport, layoutViewportHeight);
      const keyboardInset = keyboardVisible
        ? Math.max(layoutViewportHeight - (viewport?.height ?? layoutViewportHeight), 0)
        : 0;
      const stableViewportHeight = stableViewportHeightRef.current ?? layoutViewportHeight;

      if (!keyboardVisible) {
        stableViewportHeightRef.current = layoutViewportHeight;
      }

      const rootFontSize = Number.parseFloat(
        window.getComputedStyle(window.document.documentElement).fontSize
      );
      const remInPx = Number.isFinite(rootFontSize) ? rootFontSize : 16;
      const offsetPx = offsetRem * remInPx;
      const heightForMax = keyboardVisible
        ? stableViewportHeight
        : layoutViewportHeight;
      const nextHeight = Math.max(heightForMax - offsetPx, 0);

      setMetrics((previous) => {
        const hasViewportHeightChanged = previous.viewportHeight !== layoutViewportHeight;
        const hasMaxHeightChanged =
          previous.maxHeight === undefined || Math.abs(previous.maxHeight - nextHeight) > 0.5;
        const hasKeyboardInsetChanged = previous.keyboardInset !== keyboardInset;

        if (!hasViewportHeightChanged && !hasMaxHeightChanged && !hasKeyboardInsetChanged) {
          return previous;
        }

        return {
          maxHeight: nextHeight,
          viewportHeight: layoutViewportHeight,
          keyboardInset
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
  disableKeyboardViewportAdjustment?: boolean;
}

export const ModalPanel = forwardRef<
  ElementRef<typeof DialogPanel>,
  ModalPanelProps
>(function ModalPanel(
  {
    size = 'md',
    className,
    paddingClassName = 'p-6',
    disableKeyboardViewportAdjustment = false,
    ...props
  },
  ref
) {
  const { style, ...restProps } = props;
  const { maxHeight: viewportMaxHeight, keyboardInset } = useModalViewportMetrics();
  const resolvedKeyboardInset = disableKeyboardViewportAdjustment ? 0 : keyboardInset ?? 0;

  const shouldApplyInlineMaxHeight = useMemo(() => {
    return !disableKeyboardViewportAdjustment && viewportMaxHeight !== undefined;
  }, [disableKeyboardViewportAdjustment, viewportMaxHeight]);

  const mergedStyle = useMemo(() => {
    const nextStyle = { ...style };

    if (
      style?.maxHeight == null &&
      viewportMaxHeight !== undefined &&
      shouldApplyInlineMaxHeight
    ) {
      nextStyle.maxHeight = viewportMaxHeight;
    }

    if (resolvedKeyboardInset > 0) {
      const existingScrollPaddingBottom =
        typeof nextStyle.scrollPaddingBottom === 'number' ? nextStyle.scrollPaddingBottom : 0;

      nextStyle.scrollPaddingBottom = existingScrollPaddingBottom + resolvedKeyboardInset;
    }

    return nextStyle;
  }, [resolvedKeyboardInset, shouldApplyInlineMaxHeight, style, viewportMaxHeight]);

  return (
    <ModalKeyboardInsetContext.Provider value={resolvedKeyboardInset}>
      <DialogPanel
        {...restProps}
        ref={ref}
        className={clsx(
          'modal-panel relative z-10 flex w-full transform flex-col overflow-hidden rounded-2xl border border-border/70 bg-panel/95 text-surface-foreground backdrop-blur',
          SIZE_CLASS_MAP[size],
          paddingClassName,
          className
        )}
        style={{ ...mergedStyle, ['--modal-keyboard-inset' as const]: `${resolvedKeyboardInset}px` }}
      />
    </ModalKeyboardInsetContext.Provider>
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
  const keyboardInset = useContext(ModalKeyboardInsetContext);

  const mergedStyle = useMemo(() => {
    const nextStyle = { ...props.style };

    if (keyboardInset > 0) {
      const existingPaddingBottom =
        typeof nextStyle?.paddingBottom === 'number' ? nextStyle.paddingBottom : 0;
      const existingScrollPaddingBottom =
        typeof nextStyle?.scrollPaddingBottom === 'number'
          ? nextStyle.scrollPaddingBottom
          : 0;

      nextStyle.paddingBottom = existingPaddingBottom + keyboardInset;
      nextStyle.scrollPaddingBottom = existingScrollPaddingBottom + keyboardInset;
    }

    return nextStyle;
  }, [keyboardInset, props.style]);

  return (
    <div
      {...props}
      ref={ref}
      className={clsx(
        'modal-body mt-2 space-y-2 text-sm flex-1 overflow-y-auto overscroll-contain md:pr-1',
        className
      )}
      style={mergedStyle}
    />
  );
});

interface ModalFooterProps extends ComponentPropsWithoutRef<'div'> {}

export function ModalFooter({ className, ...props }: ModalFooterProps): JSX.Element {
  return (
    <div
      {...props}
      className={clsx(
        'modal-footer flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-white/5 pt-4',
        className
      )}
    />
  );
}
