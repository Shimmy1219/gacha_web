import type { ReactNode } from 'react';
import { clsx } from 'clsx';

interface SectionContainerProps {
  id?: string;
  title: string;
  description?: string;
  accentLabel?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function SectionContainer({
  id,
  title,
  description,
  accentLabel,
  actions,
  footer,
  children,
  className,
  contentClassName
}: SectionContainerProps): JSX.Element {
  return (
    <section
      id={id}
      className={clsx(
        'group relative flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-border/70 bg-[#0b0b13]/90 p-6 text-sm shadow-panel ring-1 ring-inset ring-white/5',
        'before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-accent/40 before:to-transparent before:opacity-0 before:transition-opacity before:duration-300 group-hover:before:opacity-100',
        'after:pointer-events-none after:absolute after:-inset-x-px after:-inset-y-px after:bg-panel-overlay after:opacity-0 after:transition-opacity after:duration-300 group-hover:after:opacity-100',
        className
      )}
    >
      <div className="relative z-[1] flex flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2 sm:w-full">
            {accentLabel ? (
              <span className="badge">{accentLabel}</span>
            ) : null}
            <div className="space-y-1 sm:max-w-none">
              <h2 className="text-lg font-semibold text-surface-foreground sm:text-xl">{title}</h2>
              {description ? (
                <p className="text-xs text-muted-foreground sm:w-full">{description}</p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
        <div className={clsx('flex-1 space-y-4', contentClassName)}>{children}</div>
        {footer ? (
          <footer className="border-t border-white/5 pt-4 text-xs text-muted-foreground">{footer}</footer>
        ) : null}
      </div>
    </section>
  );
}
