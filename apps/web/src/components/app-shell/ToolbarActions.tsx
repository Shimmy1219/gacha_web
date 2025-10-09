import { clsx } from 'clsx';
import { ArrowDownTrayIcon, ArrowUpTrayIcon, PlayIcon } from '@heroicons/react/24/outline';
import { useId, useRef } from 'react';

interface ToolbarActionsProps {
  mode?: 'desktop' | 'mobile';
  onOpenRealtime?: () => void;
  onExportAll?: () => void;
  onImportAll?: (files: FileList) => void;
  importBusy?: boolean;
}

export function ToolbarActions({
  mode = 'desktop',
  onOpenRealtime,
  onExportAll,
  onImportAll,
  importBusy
}: ToolbarActionsProps): JSX.Element {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const containerClass =
    mode === 'desktop'
      ? 'hidden items-center gap-3 lg:flex'
      : 'flex w-full flex-col gap-3 lg:hidden';

  const handleImportClick = () => {
    if (importBusy) {
      return;
    }
    fileInputRef.current?.click();
  };

  return (
    <div className={clsx(containerClass)}>
      <button
        type="button"
        onClick={() => onOpenRealtime?.()}
        className="btn-primary inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2 lg:w-auto"
      >
        <PlayIcon className="h-4 w-4" />
        リアルタイム入力
      </button>
      <button
        type="button"
        onClick={() => onExportAll?.()}
        className="btn-muted inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-surface-foreground lg:w-auto"
      >
        <ArrowUpTrayIcon className="h-4 w-4" />
        全体エクスポート
      </button>
      <div className={clsx('relative flex w-full lg:w-auto')}>
        <input
          id={inputId}
          ref={fileInputRef}
          type="file"
          accept=".shimmy,application/x-shimmy"
          className="sr-only"
          onChange={(event) => {
            const files = event.currentTarget.files;
            if (files && files.length > 0) {
              onImportAll?.(files);
              event.currentTarget.value = '';
            }
          }}
        />
        <button
          type="button"
          onClick={handleImportClick}
          disabled={importBusy}
          aria-busy={importBusy}
          className={clsx(
            'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-transparent px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:border-accent/60 hover:text-surface-foreground lg:w-auto',
            importBusy && 'cursor-not-allowed opacity-60'
          )}
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          全体インポート
        </button>
      </div>
    </div>
  );
}
