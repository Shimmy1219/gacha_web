import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';

const RECEIVE_MOBILE_TAB_ITEMS = [
  { to: '/receive', label: '受け取り', end: true },
  { to: '/receive/list', label: '所持一覧' },
  { to: '/receive/history', label: '履歴' }
];

export function ReceiveMobileTabs(): JSX.Element {
  return (
    <nav
      className="receive-mobile-tabs fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-surface/95 px-2 pb-[calc(0.85rem+env(safe-area-inset-bottom))] pt-3"
      aria-label="受け取りページタブナビゲーション"
    >
      <div className="receive-mobile-tabs__list grid grid-cols-3 gap-2">
        {RECEIVE_MOBILE_TAB_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              clsx(
                'receive-mobile-tabs__tab inline-flex min-h-[44px] items-center justify-center rounded-2xl border px-2 py-2 text-xs font-semibold tracking-wide transition',
                isActive
                  ? 'receive-mobile-tabs__tab--active border-accent/80 bg-accent text-accent-foreground'
                  : 'receive-mobile-tabs__tab--inactive border-transparent bg-surface/40 text-muted-foreground hover:text-surface-foreground'
              )
            }
          >
            <span className="receive-mobile-tabs__label">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
