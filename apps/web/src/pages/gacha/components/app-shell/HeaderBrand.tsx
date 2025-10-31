import { clsx } from 'clsx';

interface HeaderBrandProps {
  title: string;
  tagline?: string;
  appearance?: 'default' | 'dark';
}

export function HeaderBrand({ title, tagline, appearance = 'default' }: HeaderBrandProps): JSX.Element {
  const isDarkAppearance = appearance === 'dark';

  return (
    <div className="header-brand flex items-center">
      <div className="header-brand__text space-y-1">
        <p
          className={clsx(
            'header-brand__title text-lg font-semibold leading-tight sm:text-xl',
            isDarkAppearance ? 'text-white' : 'text-surface-foreground'
          )}
        >
          {title}
        </p>
        {tagline ? (
          <p
            className={clsx(
              'header-brand__tagline text-[11px] uppercase tracking-[0.4em]',
              isDarkAppearance ? 'text-white/50' : 'text-muted-foreground'
            )}
          >
            {tagline}
          </p>
        ) : null}
      </div>
    </div>
  );
}
