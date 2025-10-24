interface HeaderBrandProps {
  title: string;
  tagline?: string;
}

export function HeaderBrand({ title, tagline }: HeaderBrandProps): JSX.Element {
  return (
    <div className="header-brand flex items-center gap-3">
      <span className="header-brand__logo relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-accent text-base font-bold text-accent-foreground">
        <span className="header-brand__logo-mark relative">G</span>
      </span>
      <div className="header-brand__text space-y-1">
        <p className="header-brand__title text-lg font-semibold leading-tight text-surface-foreground sm:text-xl">{title}</p>
        {tagline ? (
          <p className="header-brand__tagline text-[11px] uppercase tracking-[0.4em] text-muted-foreground">{tagline}</p>
        ) : null}
      </div>
    </div>
  );
}
