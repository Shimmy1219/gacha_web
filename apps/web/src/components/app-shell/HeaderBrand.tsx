interface HeaderBrandProps {
  title: string;
  tagline?: string;
}

export function HeaderBrand({ title, tagline }: HeaderBrandProps): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-base font-bold text-accent-foreground shadow-lg shadow-accent/40">
        G
      </span>
      <div>
        <p className="text-lg font-semibold leading-tight text-surface-foreground">{title}</p>
        {tagline ? (
          <p className="text-xs text-muted-foreground">{tagline}</p>
        ) : null}
      </div>
    </div>
  );
}
