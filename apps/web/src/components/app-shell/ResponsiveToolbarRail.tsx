import type { ReactNode } from 'react';
import { useEffect } from 'react';

interface ResponsiveToolbarRailProps {
  open: boolean;
  onClose(): void;
  children: ReactNode;
}

export function ResponsiveToolbarRail({ open, onClose, children }: ResponsiveToolbarRailProps): JSX.Element {
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

  return (
    <div className="lg:hidden">
      {open ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
          <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-sm overflow-y-auto border-l border-border/60 bg-surface px-6 pb-10 pt-16 shadow-2xl shadow-black/40">
            <div className="space-y-6">
              {children}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
