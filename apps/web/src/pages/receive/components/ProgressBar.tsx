interface ProgressBarProps {
  value?: number;
  label?: string;
}

export function ProgressBar({ value, label }: ProgressBarProps): JSX.Element {
  const clamped = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : undefined;
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      {label ? <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span> : null}
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-pink-400 via-rose-500 to-red-500 transition-[width] duration-300"
          style={{ width: clamped !== undefined ? `${clamped}%` : '100%' }}
        />
      </div>
      <span className="w-16 text-right tabular-nums text-muted-foreground">
        {clamped !== undefined ? `${clamped.toFixed(0)}%` : '---'}
      </span>
    </div>
  );
}
