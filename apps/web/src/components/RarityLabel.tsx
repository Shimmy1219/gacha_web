import { clsx } from 'clsx';
import { type CSSProperties } from 'react';

import { getRarityTextPresentation } from '../features/rarity/utils/rarityColorPresentation';

export interface RarityLabelProps {
  label: string;
  color?: string | null;
  className?: string;
  style?: CSSProperties;
  truncate?: boolean;
}

export function RarityLabel({
  label,
  color,
  className,
  style,
  truncate = true
}: RarityLabelProps): JSX.Element {
  const { className: rarityClassName, style: rarityStyle } = getRarityTextPresentation(color ?? undefined);
  const mergedStyle: CSSProperties = {
    display: 'inline-block',
    maxWidth: '100%',
    ...(rarityStyle ?? {}),
    ...(style ?? {})
  };

  return (
    <span className={clsx(truncate && 'truncate', rarityClassName, className)} style={mergedStyle}>
      {label}
    </span>
  );
}
