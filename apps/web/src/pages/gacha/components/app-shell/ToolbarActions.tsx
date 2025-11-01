import { clsx } from 'clsx';
import { ArrowUpTrayIcon, PlayIcon, PlusCircleIcon, SparklesIcon } from '@heroicons/react/24/outline';

interface ToolbarActionsProps {
  mode?: 'desktop' | 'mobile';
  onDrawGacha?: () => void;
  onRegisterGacha?: () => void;
  onOpenRealtime?: () => void;
  onExportAll?: () => void;
  showDrawGachaButton?: boolean;
  showRegisterGachaButton?: boolean;
  showRealtimeButton?: boolean;
  showExportButton?: boolean;
}

export function ToolbarActions({
  mode = 'desktop',
  onDrawGacha,
  onRegisterGacha,
  onOpenRealtime,
  onExportAll,
  showDrawGachaButton = true,
  showRegisterGachaButton = true,
  showRealtimeButton = true,
  showExportButton = true
}: ToolbarActionsProps): JSX.Element {
  const containerClass =
    mode === 'desktop'
      ? 'hidden items-center gap-3 lg:flex'
      : 'flex w-full flex-col gap-3 lg:hidden';

  const canShowDrawButton = showDrawGachaButton && mode !== 'mobile';

  return (
    <div className={clsx('toolbar-actions', containerClass)}>
      {canShowDrawButton ? (
        <button
          type="button"
          onClick={() => onDrawGacha?.()}
          className="toolbar-actions__draw-button btn-primary inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2 lg:w-auto"
        >
          <SparklesIcon className="h-4 w-4" />
          ガチャを引く
        </button>
      ) : null}
      {showRegisterGachaButton ? (
        <button
          type="button"
          onClick={() => onRegisterGacha?.()}
          className="toolbar-actions__register-button btn-primary inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2 lg:w-auto"
        >
          <PlusCircleIcon className="h-4 w-4" />
          ガチャを登録
        </button>
      ) : null}
      {showRealtimeButton ? (
        <button
          type="button"
          onClick={() => onOpenRealtime?.()}
          className="toolbar-actions__realtime-button btn-primary inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2 lg:w-auto"
        >
          <PlayIcon className="h-4 w-4" />
          リアルタイム入力
        </button>
      ) : null}
      {showExportButton ? (
        <button
          type="button"
          onClick={() => onExportAll?.()}
          className="toolbar-actions__export-button btn-muted inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-surface-foreground lg:w-auto"
        >
          <ArrowUpTrayIcon className="h-4 w-4" />
          バックアップ/引継ぎ
        </button>
      ) : null}
    </div>
  );
}
