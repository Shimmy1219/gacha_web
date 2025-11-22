import { clsx } from 'clsx';
import type { ComponentPropsWithoutRef } from 'react';

export type XLogoIconProps = ComponentPropsWithoutRef<'span'>;

const LOGO_SRC = '/images/x/logo-white.png';

export function XLogoIcon({ className, ...props }: XLogoIconProps): JSX.Element {
  return (
    <span
      {...props}
      className={clsx(
        'inline-flex items-center justify-center overflow-hidden rounded-sm bg-[#000000]',
        className
      )}
    >
      <img
        src={LOGO_SRC}
        alt=""
        className="h-full w-full object-contain"
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}
