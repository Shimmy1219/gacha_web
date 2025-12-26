interface ProgressBarProps {
  value?: number;
  label?: string;
}

export function ProgressBar({ value, label }: ProgressBarProps): JSX.Element {
  const clamped = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : undefined;
  return (
    <div className="receive-progress-bar-root flex items-center gap-3 text-sm text-muted-foreground">
      {label ? (
        <span className="receive-progress-bar-label w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      ) : null}
      <div className="receive-progress-bar-track relative h-2 flex-1 overflow-hidden rounded-full bg-border/60">
        <div
          className="receive-progress-bar-indicator absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent to-accent-bright transition-[width] duration-300"
          style={{ width: clamped !== undefined ? `${clamped}%` : '100%' }}
        />
      </div>
      <span className="receive-progress-bar-value w-16 text-right tabular-nums text-muted-foreground">
        {clamped !== undefined ? `${clamped.toFixed(0)}%` : '---'}
      </span>
    </div>
  );
}
