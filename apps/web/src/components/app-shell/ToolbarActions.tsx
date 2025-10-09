import { clsx } from 'clsx';
import { ArrowDownTrayIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';

const buttonBase =
  'inline-flex items-center gap-2 rounded-lg border border-border/40 bg-panel px-4 py-2 text-sm font-medium text-surface-foreground shadow-sm transition hover:border-border hover:bg-panel/80';

interface ToolbarActionsProps {
  variant?: 'desktop' | 'mobile';
}

export function ToolbarActions({ variant = 'desktop' }: ToolbarActionsProps): JSX.Element {
  return (
    <div
      className={clsx(
        'flex items-center gap-3',
        variant === 'desktop' ? 'hidden lg:flex' : 'lg:hidden flex-col'
      )}
    >
      <a className={buttonBase} href="#import" role="button">
        <ArrowDownTrayIcon className="h-4 w-4" />
        インポート
      </a>
      <a className={buttonBase} href="#export" role="button">
        <ArrowUpTrayIcon className="h-4 w-4" />
        エクスポート
      </a>
    </div>
  );
}
