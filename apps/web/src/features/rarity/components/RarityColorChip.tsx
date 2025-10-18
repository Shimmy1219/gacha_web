import { clsx } from 'clsx';
import { forwardRef, type KeyboardEventHandler } from 'react';

const GOLD_HEX = '#d4af37';
const SILVER_HEX = '#c0c0c0';
const RAINBOW_VALUE = 'rainbow';

type RarityColorChipProps = {
  value: string;
  ariaLabel?: string;
  ariaControls?: string;
  ariaExpanded?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
};

function normalize(value: string): string {
  return value.toLowerCase();
}

function getChipClassName(rawValue: string): string {
  const value = normalize(rawValue);

  if (value === RAINBOW_VALUE) {
    return 'bg-gradient-rainbow border-transparent';
  }

  if (value === GOLD_HEX) {
    return 'bg-gradient-gold border-[#b08d1a]';
  }

  if (value === SILVER_HEX) {
    return 'bg-gradient-silver border-[#9ca3af]';
  }

  return '';
}

export const RarityColorChip = forwardRef<HTMLButtonElement, RarityColorChipProps>(
  ({ value, ariaLabel, ariaControls, ariaExpanded, disabled, onClick, onKeyDown }, ref) => {
    const chipClass = getChipClassName(value);
    const displayValue = value.startsWith('#') ? value.toUpperCase() : value;

    return (
      <button
        ref={ref}
        type="button"
        className={clsx(
          'rarity-color-chip group inline-grid h-9 w-16 place-items-center rounded-lg border border-border/70 bg-transparent text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground transition hover:border-accent/60 hover:text-surface-foreground',
          disabled && 'cursor-not-allowed opacity-50 hover:border-border/70 hover:text-muted-foreground'
        )}
        aria-label={ariaLabel ?? `${displayValue} を選択`}
        aria-controls={ariaControls}
        aria-haspopup="dialog"
        aria-expanded={ariaExpanded}
        disabled={disabled}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        <span
          className={`rarity-color-chip__swatch h-5 w-10 rounded-md border border-border/60 transition group-hover:border-accent/60 ${chipClass}`.trim()}
          style={chipClass ? undefined : { backgroundColor: value }}
        />
      </button>
    );
  }
);

RarityColorChip.displayName = 'RarityColorChip';
