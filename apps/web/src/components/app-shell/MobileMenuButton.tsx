import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';

interface MobileMenuButtonProps {
  open: boolean;
  onToggle(): void;
}

export function MobileMenuButton({ open, onToggle }: MobileMenuButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border/50 bg-panel text-surface-foreground shadow-sm transition hover:border-border hover:bg-panel/80 lg:hidden"
      aria-label="ツールバーを開閉"
      aria-expanded={open}
    >
      {open ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
    </button>
  );
}
