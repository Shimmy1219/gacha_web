import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';

interface MobileMenuButtonProps {
  open: boolean;
  onToggle(): void;
  controlsId: string;
}

export function MobileMenuButton({ open, onToggle, controlsId }: MobileMenuButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mobile-menu-button inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/50 bg-surface/40 text-surface-foreground transition hover:border-accent/60 hover:text-accent lg:hidden"
      aria-label="ツールバーを開閉"
      aria-expanded={open}
      aria-controls={controlsId}
    >
      {open ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
    </button>
  );
}
