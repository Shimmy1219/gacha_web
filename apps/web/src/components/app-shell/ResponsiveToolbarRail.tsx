import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import { useLockBodyScroll } from '../../hooks/dom/useLockBodyScroll';

interface ResponsiveToolbarRailProps {
  open: boolean;
  onClose(): void;
  children: ReactNode;
  id: string;
  labelledBy?: string;
}

export function ResponsiveToolbarRail({
  open,
  onClose,
  children,
  id,
  labelledBy
}: ResponsiveToolbarRailProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement | null>(null);
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

  useLockBodyScroll(open);

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

  return (
    <div className="responsive-toolbar-rail lg:hidden" aria-hidden={!open}>
      {open ? (
        <>
          <div
            className="responsive-toolbar-rail__backdrop fixed inset-0 z-40 bg-[rgba(11,11,15,0.78)]"
            onClick={onClose}
          />
          <aside
            id={id}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            className="responsive-toolbar-rail__panel fixed inset-y-0 right-0 z-50 w-full max-w-sm overflow-y-auto border-l border-border/60 bg-[#0b0b0f]/98 px-6 pb-[max(3rem,calc(2rem+env(safe-area-inset-bottom)))] pt-16"
            ref={panelRef}
            tabIndex={-1}
          >
            <div className="responsive-toolbar-rail__content space-y-6">
              {children}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
