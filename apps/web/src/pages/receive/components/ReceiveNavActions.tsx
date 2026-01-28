import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';

interface ReceiveNavActionsProps {
  mode?: 'desktop' | 'mobile';
}

const NAV_ITEMS = [
  { to: '/receive/history', label: '履歴' },
  { to: '/receive/list', label: '所持一覧' },
  { to: '/receive', label: '受け取り', end: true }
];

export function ReceiveNavActions({ mode = 'desktop' }: ReceiveNavActionsProps): JSX.Element {
  const containerClass =
    mode === 'desktop'
      ? 'flex items-center gap-2'
      : 'flex w-full flex-col gap-2';

  const baseClassName =
    'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition';
  const activeClassName = 'border-border/80 bg-surface/70 text-surface-foreground';
  const inactiveClassName =
    'border-border/60 bg-panel/70 text-muted-foreground hover:border-border/80 hover:text-surface-foreground';

  return (
    <nav className={clsx('receive-nav-actions', containerClass)} aria-label="受け取りナビゲーション">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            clsx(
              baseClassName,
              isActive ? activeClassName : inactiveClassName,
              mode === 'mobile' && 'w-full justify-start'
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
