import { clsx } from 'clsx';

import { useToolbarState } from '../../features/toolbar/ToolbarStateProvider';

interface ToolbarSummaryProps {
  variant?: 'desktop' | 'mobile';
}

export function ToolbarSummary({ variant = 'desktop' }: ToolbarSummaryProps): JSX.Element {
  const {
    state: { hideMiss, showCounts, showSkipOnly, keyword }
  } = useToolbarState();

  return (
    <div
      className={clsx(
        'flex flex-col text-xs text-muted-foreground',
        variant === 'desktop' ? 'hidden min-w-[16rem] lg:flex' : 'lg:hidden'
      )}
    >
      <span className="font-medium text-surface-foreground">ユーザーフィルタ状態</span>
      <div className="mt-1 flex flex-wrap gap-1">
        <span className="tag">はずれ{hideMiss ? '非表示' : '表示'}</span>
        <span className="tag">獲得数{showCounts ? '表示' : '非表示'}</span>
        <span className="tag">リアグ{showSkipOnly ? 'のみ' : '含む'}</span>
        {keyword ? <span className="tag">検索: {keyword}</span> : null}
      </div>
    </div>
  );
}
