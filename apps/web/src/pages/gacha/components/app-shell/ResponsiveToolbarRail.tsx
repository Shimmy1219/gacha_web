import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useLockBodyScroll } from '../../../../hooks/dom/useLockBodyScroll';

interface ResponsiveToolbarRailProps {
  open: boolean;
  onClose(): void;
  children: ReactNode;
  id: string;
  labelledBy?: string;
  appearance?: 'default' | 'dark';
}

export function ResponsiveToolbarRail({
  open,
  onClose,
  children,
  id,
  labelledBy,
  appearance = 'default'
}: ResponsiveToolbarRailProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [rendered, setRendered] = useState(open);
  const [isActive, setIsActive] = useState(open);
  const isDarkAppearance = appearance === 'dark';

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    let timeoutId: number | undefined;

    if (open) {
      setRendered(true);
    } else if (rendered) {
      timeoutId = window.setTimeout(() => {
        setRendered(false);
      }, 300);
    }

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [open, rendered]);

  useEffect(() => {
    if (!rendered) {
      setIsActive(false);
      return;
    }

    let frameId = window.requestAnimationFrame(() => {
      setIsActive(open);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [open, rendered]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useLockBodyScroll(rendered);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus({ preventScroll: true });
    return () => {
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open]);

  const content = (
    <div className="responsive-toolbar-rail" aria-hidden={!rendered}>
      {rendered ? (
        <>
          <div
            className={clsx(
              'responsive-toolbar-rail__backdrop fixed inset-0 z-40 transition-opacity duration-300 ease-in-out',
              isActive ? 'opacity-100' : 'opacity-0',
              isDarkAppearance ? 'bg-slate-950/80' : 'bg-overlay/70'
            )}
            onClick={onClose}
          />
          <aside
            id={id}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            className={clsx(
              'responsive-toolbar-rail__panel fixed inset-y-0 right-0 z-50 flex h-full w-2/3 overflow-y-auto border-l px-6 pb-0 pt-16 shadow-2xl transition-transform duration-300 ease-in-out transform-gpu',
              isActive ? 'translate-x-0' : 'translate-x-full',
              !isActive && 'motion-safe:will-change-transform',
              isDarkAppearance ? 'border-white/10 bg-slate-950 text-white' : 'border-border/60 bg-panel text-surface-foreground'
            )}
            ref={panelRef}
            tabIndex={-1}
          >
            <div className="responsive-toolbar-rail__content flex h-full flex-col gap-6">
              {children}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );

  if (mounted && typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }

  return content;
}
