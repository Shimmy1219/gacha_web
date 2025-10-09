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
    <div className="lg:hidden" aria-hidden={!open}>
      {open ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
          <aside
            id={id}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-sm overflow-y-auto border-l border-border/60 bg-surface px-6 pb-10 pt-16 shadow-2xl shadow-black/40"
            ref={panelRef}
            tabIndex={-1}
          >
            <div className="space-y-6">
              {children}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
