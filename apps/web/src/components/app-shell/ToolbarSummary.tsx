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
  const layoutClass = mode === 'desktop' ? 'hidden min-w-[12rem] lg:flex' : 'flex lg:hidden';

  const variantClass =
    variant === 'warning'
      ? 'border-[#f97316]/70 bg-[#f97316]/10 text-[#fda769]'
      : variant === 'success'
        ? 'border-[#22c55e]/70 bg-[#22c55e]/10 text-[#86efac]'
        : 'border-border/70 bg-surface/40 text-muted-foreground';

  return (
    <div className={clsx('toolbar-summary flex flex-col gap-1 text-xs', layoutClass, className)}>
      <span
        data-variant={variant}
        className={clsx(
          'inline-flex w-fit items-center rounded-full px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]',
          variantClass
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
