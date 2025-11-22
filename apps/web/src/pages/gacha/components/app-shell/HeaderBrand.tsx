import { clsx } from 'clsx';
import { Link } from 'react-router-dom';

interface HeaderBrandProps {
  title: string;
  tagline?: string;
  appearance?: 'default' | 'dark';
}

export function HeaderBrand({ title, tagline, appearance = 'default' }: HeaderBrandProps): JSX.Element {
  const isDarkAppearance = appearance === 'dark';

  return (
    <div className="header-brand flex items-center">
      <Link
        to="/home"
        className={clsx(
          'header-brand__text block space-y-1 rounded-md px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 transition',
          isDarkAppearance
            ? 'focus-visible:ring-white/60 focus-visible:ring-offset-slate-950'
            : 'focus-visible:ring-accent/60 focus-visible:ring-offset-white'
        )}
      >
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
      </Link>
    </div>
  );
}
