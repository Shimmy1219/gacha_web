import { clsx } from 'clsx';

interface ToolbarSummaryProps {
  label: string;
  variant?: 'default' | 'warning' | 'success';
  description?: string;
  mode?: 'desktop' | 'mobile';
  className?: string;
}

export function ToolbarSummary({
  label,
  variant = 'default',
  description,
  mode = 'desktop',
  className
}: ToolbarSummaryProps): JSX.Element {
  const layoutClass =
    mode === 'desktop'
      ? 'hidden min-w-[12rem] lg:flex'
      : 'flex lg:hidden';

  return (
    <div className={clsx('flex flex-col gap-1 text-xs', layoutClass, className)}>
      <span
        data-variant={variant}
        className={clsx(
          'inline-flex w-fit items-center rounded-full border px-3 py-1 text-sm font-semibold tracking-wide',
          variant === 'warning'
            ? 'border-amber-400/70 bg-amber-400/10 text-amber-200'
            : variant === 'success'
              ? 'border-emerald-400/70 bg-emerald-400/10 text-emerald-200'
              : 'border-muted/70 bg-muted/40 text-muted-foreground'
        )}
      >
        {label}
      </span>
      {description ? (
        <span className="text-[11px] text-muted-foreground/80">{description}</span>
      ) : null}
    </div>
  );
}
