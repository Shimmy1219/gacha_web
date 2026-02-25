import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useModal } from './ModalProvider';
import { ModalHeader, ModalOverlay, ModalPanel } from './ModalComponents';
import { type ModalComponentProps, type ModalStackEntry } from './ModalTypes';
import { useHaptics } from '../features/haptics/HapticsProvider';

function ensureModalRoot(): HTMLElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const existing = document.getElementById('modal-root');
  if (existing) {
    return existing;
  }

  const element = document.createElement('div');
  element.setAttribute('id', 'modal-root');
  document.body.appendChild(element);
  return element;
}

interface ModalRendererProps {
  entry: ModalStackEntry;
  isTop: boolean;
  zIndex: number;
  viewportTop: number;
  viewportHeight: number;
}

interface ModalViewportBounds {
  top: number;
  height: number;
}

const VIEWPORT_BOUNDS_UPDATE_EPSILON = 0.5;
const KEYBOARD_SAFE_AREA_TOP_PX = 12;
const KEYBOARD_SAFE_AREA_BOTTOM_PX = 20;
const KEYBOARD_VISIBILITY_RATIO_THRESHOLD = 0.95;
const MOBILE_KEYBOARD_MEDIA_QUERY = '(max-width: 1024px), (pointer: coarse)';

function readModalViewportBounds(): ModalViewportBounds {
  if (typeof window === 'undefined') {
    return { top: 0, height: 0 };
  }

  const layoutViewportHeight = window.innerHeight;
  const visualViewport = window.visualViewport;
  if (!visualViewport) {
    return { top: 0, height: layoutViewportHeight };
  }

  const top = Math.max(visualViewport.offsetTop, 0);
  const maxVisibleHeight = Math.max(layoutViewportHeight - top, 0);
  const rawVisibleHeight = visualViewport.height > 0 ? visualViewport.height : maxVisibleHeight;
  const height = Math.max(Math.min(rawVisibleHeight, maxVisibleHeight), 0);

  return { top, height };
}

function useModalViewportBounds(): ModalViewportBounds {
  const [bounds, setBounds] = useState<ModalViewportBounds>(() => readModalViewportBounds());
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateBounds = () => {
      const nextBounds = readModalViewportBounds();
      setBounds((previousBounds) => {
        const hasTopChanged =
          Math.abs(previousBounds.top - nextBounds.top) > VIEWPORT_BOUNDS_UPDATE_EPSILON;
        const hasHeightChanged =
          Math.abs(previousBounds.height - nextBounds.height) > VIEWPORT_BOUNDS_UPDATE_EPSILON;
        if (!hasTopChanged && !hasHeightChanged) {
          return previousBounds;
        }
        return nextBounds;
      });
    };

    const scheduleBoundsUpdate = () => {
      if (animationFrameRef.current !== null) {
        return;
      }
      animationFrameRef.current = window.requestAnimationFrame(() => {
        animationFrameRef.current = null;
        updateBounds();
      });
    };

    const visualViewport = window.visualViewport;

    updateBounds();
    visualViewport?.addEventListener('resize', scheduleBoundsUpdate, { passive: true });
    visualViewport?.addEventListener('scroll', scheduleBoundsUpdate, { passive: true });
    window.addEventListener('resize', scheduleBoundsUpdate, { passive: true });
    window.addEventListener('orientationchange', scheduleBoundsUpdate);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      visualViewport?.removeEventListener('resize', scheduleBoundsUpdate);
      visualViewport?.removeEventListener('scroll', scheduleBoundsUpdate);
      window.removeEventListener('resize', scheduleBoundsUpdate);
      window.removeEventListener('orientationchange', scheduleBoundsUpdate);
    };
  }, []);

  return bounds;
}

function isKeyboardTargetElement(element: HTMLElement): boolean {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return true;
  }

  if (element instanceof HTMLInputElement) {
    const unsupportedTypes = new Set([
      'button',
      'checkbox',
      'color',
      'file',
      'hidden',
      'image',
      'radio',
      'range',
      'reset',
      'submit'
    ]);
    return !unsupportedTypes.has((element.type || 'text').toLowerCase());
  }

  return element.isContentEditable;
}

function resolveScrollableAncestor(element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element.parentElement;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const canScrollY = style.overflowY === 'auto' || style.overflowY === 'scroll';
    if (canScrollY && current.scrollHeight > current.clientHeight + 1) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

function keepFocusedElementVisible(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement) || !isKeyboardTargetElement(activeElement)) {
    return;
  }

  if (!activeElement.closest('.modal-root')) {
    return;
  }

  const visualViewport = window.visualViewport;
  if (!visualViewport) {
    return;
  }

  if (!window.matchMedia(MOBILE_KEYBOARD_MEDIA_QUERY).matches) {
    return;
  }

  const layoutViewportHeight = window.innerHeight;
  if (layoutViewportHeight <= 0) {
    return;
  }

  const viewportHeightRatio = visualViewport.height / layoutViewportHeight;
  if (viewportHeightRatio > KEYBOARD_VISIBILITY_RATIO_THRESHOLD) {
    return;
  }

  const visibleTop = Math.max(visualViewport.offsetTop, 0) + KEYBOARD_SAFE_AREA_TOP_PX;
  const visibleBottom = Math.max(
    visibleTop,
    visualViewport.offsetTop + visualViewport.height - KEYBOARD_SAFE_AREA_BOTTOM_PX
  );
  const elementRect = activeElement.getBoundingClientRect();
  const isAlreadyVisible = elementRect.top >= visibleTop && elementRect.bottom <= visibleBottom;

  if (isAlreadyVisible) {
    return;
  }

  const scrollContainer = resolveScrollableAncestor(activeElement);
  if (!scrollContainer) {
    activeElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return;
  }

  const overflowBottom = Math.max(elementRect.bottom - visibleBottom, 0);
  const overflowTop = Math.min(elementRect.top - visibleTop, 0);
  const nextScrollTop = scrollContainer.scrollTop + overflowBottom + overflowTop;
  scrollContainer.scrollTop = nextScrollTop;
}

function useKeepFocusedElementVisible(active: boolean): void {
  const animationFrameRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const runAdjustment = () => {
      keepFocusedElementVisible();
    };

    const scheduleAdjustment = () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = window.requestAnimationFrame(() => {
        animationFrameRef.current = null;
        runAdjustment();
      });

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        runAdjustment();
      }, 220);
    };

    const visualViewport = window.visualViewport;

    // キーボード表示直後は viewport 変化が段階的に届くため、focus と viewport 両方を監視する。
    // 依存配列を active のみに絞り、モーダル表示中だけ監視コストを払う。
    document.addEventListener('focusin', scheduleAdjustment);
    visualViewport?.addEventListener('resize', scheduleAdjustment, { passive: true });
    visualViewport?.addEventListener('scroll', scheduleAdjustment, { passive: true });
    window.addEventListener('resize', scheduleAdjustment, { passive: true });
    window.addEventListener('orientationchange', scheduleAdjustment);
    scheduleAdjustment();

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      document.removeEventListener('focusin', scheduleAdjustment);
      visualViewport?.removeEventListener('resize', scheduleAdjustment);
      visualViewport?.removeEventListener('scroll', scheduleAdjustment);
      window.removeEventListener('resize', scheduleAdjustment);
      window.removeEventListener('orientationchange', scheduleAdjustment);
    };
  }, [active]);
}

export function ModalRoot(): JSX.Element | null {
  const { stack } = useModal();
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null);
  const viewportBounds = useModalViewportBounds();
  useKeepFocusedElementVisible(stack.length > 0);

  useEffect(() => {
    setPortalElement(ensureModalRoot());
  }, []);

  const modalNodes = useMemo(() => {
    return stack.map((entry, index) => {
      const isTop = index === stack.length - 1;
      const zIndex = 50 + index * 5;
      return (
        <ModalRenderer
          key={entry.key}
          entry={entry}
          isTop={isTop}
          zIndex={zIndex}
          viewportTop={viewportBounds.top}
          viewportHeight={viewportBounds.height}
        />
      );
    });
  }, [stack, viewportBounds.height, viewportBounds.top]);

  if (!portalElement || modalNodes.length === 0) {
    return null;
  }

  return createPortal(<Fragment>{modalNodes}</Fragment>, portalElement);
}

function ModalRenderer({
  entry,
  isTop,
  zIndex,
  viewportTop,
  viewportHeight
}: ModalRendererProps): JSX.Element {
  const { pop, dismissAll, push, replace } = useModal();
  const { triggerError } = useHaptics();
  const intent = entry.props.intent ?? 'default';

  useEffect(() => {
    if (!isTop) {
      return;
    }

    if (intent === 'warning' || intent === 'error') {
      triggerError();
    }
  }, [intent, isTop, triggerError]);

  const handleClose = () => {
    pop(entry.key);
    entry.props.onClose?.();
  };

  const componentProps: ModalComponentProps<any> = {
    ...entry.props,
    isTop,
    close: handleClose,
    dismiss: dismissAll,
    push,
    replace
  };

  const dismissible = entry.props.dismissible ?? true;
  const showHeaderCloseButton = dismissible && entry.props.showHeaderCloseButton === true;
  const modalRootStyle = useMemo(
    () => ({
      zIndex,
      top: `${viewportTop}px`,
      height: viewportHeight > 0 ? `${viewportHeight}px` : '100%'
    }),
    [viewportHeight, viewportTop, zIndex]
  );

  return (
    <Transition.Root show as={Fragment} appear>
      <Dialog
        static
        open
        onClose={() => {
          if (!dismissible || !isTop) {
            return;
          }
          handleClose();
        }}
        className="modal-root fixed inset-x-0"
        style={modalRootStyle}
      >
        <div className="flex min-h-full items-center justify-center px-4 py-4 md:py-8">
          <Transition.Child
            as={Fragment}
            enter="duration-200 ease-out"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="duration-150 ease-in"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <ModalOverlay aria-hidden="true" />
          </Transition.Child>

          <Transition.Child
            as={Fragment}
            enter="duration-200 ease-out"
            enterFrom="translate-y-8 opacity-0"
            enterTo="translate-y-0 opacity-100"
            leave="duration-150 ease-in"
            leaveFrom="translate-y-0 opacity-100"
            leaveTo="translate-y-4 opacity-0"
          >
            <ModalPanel
              size={entry.props.size ?? 'md'}
              className={entry.props.panelClassName}
              paddingClassName={entry.props.panelPaddingClassName}
            >
              {showHeaderCloseButton ? (
                <button
                  type="button"
                  onClick={handleClose}
                  className="modal-mobile-close-button absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition hover:bg-white/10 hover:text-surface-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
                >
                  <span className="sr-only">モーダルを閉じる</span>
                  <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              ) : null}
              <ModalHeader
                title={entry.props.title}
                description={entry.props.description}
                actions={
                  showHeaderCloseButton ? (
                    <button
                      type="button"
                      onClick={handleClose}
                      className="btn btn-muted hidden items-center gap-2 rounded-full px-4 py-2 text-sm md:inline-flex"
                    >
                      <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                      <span>閉じる</span>
                    </button>
                  ) : undefined
                }
              />
              {entry.component(componentProps)}
            </ModalPanel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
