import { clsx } from 'clsx';
import { ChevronDownIcon } from '@heroicons/react/20/solid';

import { useToolbarState } from '../../features/toolbar/ToolbarStateProvider';

export function ToolbarFilters(): JSX.Element {
  const {
    state: { subcontrolsCollapsed, hideMiss, showCounts, showSkipOnly, keyword },
    actions
  } = useToolbarState();

  return (
    <section className="rounded-2xl border border-border/60 bg-panel/80 p-4 shadow-lg shadow-black/20">
      <button
        type="button"
        className="flex w-full items-center justify-between text-sm font-semibold text-surface-foreground"
        onClick={actions.toggleSubcontrols}
        aria-expanded={!subcontrolsCollapsed}
      >
        <span>ユーザーフィルタ</span>
        <ChevronDownIcon
          className={clsx('h-4 w-4 transition-transform', !subcontrolsCollapsed && 'rotate-180')}
        />
      </button>
      <div
        className={clsx(
          'grid grid-cols-1 gap-4 pt-4 transition-all duration-200 ease-out sm:grid-cols-2',
          subcontrolsCollapsed
            ? 'pointer-events-none max-h-0 overflow-hidden opacity-0'
            : 'max-h-[640px] opacity-100'
        )}
      >
        <label className="flex items-center justify-between gap-4 rounded-xl border border-border/40 bg-surface/40 px-4 py-3">
          <span className="text-sm">はずれを隠す</span>
          <input
            type="checkbox"
            checked={hideMiss}
            onChange={() => actions.toggleHideMiss()}
            className="h-5 w-5 cursor-pointer rounded border-border/60 bg-panel accent-accent"
          />
        </label>
        <label className="flex items-center justify-between gap-4 rounded-xl border border-border/40 bg-surface/40 px-4 py-3">
          <span className="text-sm">獲得数を表示</span>
          <input
            type="checkbox"
            checked={showCounts}
            onChange={() => actions.toggleShowCounts()}
            className="h-5 w-5 cursor-pointer rounded border-border/60 bg-panel accent-accent"
          />
        </label>
        <label className="flex items-center justify-between gap-4 rounded-xl border border-border/40 bg-surface/40 px-4 py-3">
          <span className="text-sm">リアグのみを表示</span>
          <input
            type="checkbox"
            checked={showSkipOnly}
            onChange={() => actions.toggleShowSkipOnly()}
            className="h-5 w-5 cursor-pointer rounded border-border/60 bg-panel accent-accent"
          />
        </label>
        <label className="flex flex-col gap-2 rounded-xl border border-border/40 bg-surface/40 px-4 py-3">
          <span className="text-sm">ユーザー検索</span>
          <input
            type="search"
            value={keyword}
            onChange={(event) => actions.setKeyword(event.currentTarget.value)}
            placeholder="ユーザー名やメモで検索"
            className="w-full rounded-lg border border-border/60 bg-panel px-3 py-2 text-sm text-surface-foreground placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => actions.resetFilters()}
          className="btn-muted self-start"
        >
          フィルタをリセット
        </button>
      </div>
    </section>
  );
}
