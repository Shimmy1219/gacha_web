import { clsx } from 'clsx';
import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';

import { RarityColorChip } from '../RarityColorChip';
import {
  type ColorOption,
  DEFAULT_PALETTE,
  GOLD_HEX,
  RAINBOW_VALUE,
  SILVER_HEX,
  isGold,
  isMetal,
  isRainbow,
  isSilver
} from './palette';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

let closeActivePicker: (() => void) | null = null;

function normalizeColorValue(value?: string | null): string {
  return (value ?? '').toLowerCase();
}

function clampRectWithinViewport(anchor: DOMRect, size: { width: number; height: number }, margin = 8) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const desiredLeft = anchor.left;
  const desiredTop = anchor.bottom + 6;

  const maxLeft = Math.max(margin, viewportWidth - size.width - margin);
  const maxTop = Math.max(margin, viewportHeight - size.height - margin);

  const left = Math.min(Math.max(margin, desiredLeft), maxLeft);
  const top = Math.min(Math.max(margin, desiredTop), maxTop);

  return { left, top };
}

function getDisplayLabel(value: string, palette: ColorOption[]): string {
  if (!value) {
    return '';
  }

  const option = palette.find((entry) => normalizeColorValue(entry.value) === normalizeColorValue(value));
  if (option) {
    return option.name;
  }

  if (normalizeColorValue(value) === normalizeColorValue(RAINBOW_VALUE)) {
    return '虹';
  }

  if (normalizeColorValue(value) === normalizeColorValue(GOLD_HEX)) {
    return '金';
  }

  if (normalizeColorValue(value) === normalizeColorValue(SILVER_HEX)) {
    return '銀';
  }

  return value;
}

type RarityColorPickerProps = {
  value?: string | null;
  defaultValue?: string;
  onChange?: (next: string) => void;
  ariaLabel?: string;
  palette?: ColorOption[];
  disabled?: boolean;
  portalContainer?: HTMLElement | null;
};

export function RarityColorPicker({
  value,
  defaultValue,
  onChange,
  ariaLabel,
  palette: paletteProp,
  disabled,
  portalContainer: portalContainerProp
}: RarityColorPickerProps): JSX.Element {
  const palette = paletteProp ?? DEFAULT_PALETTE;
  const fallbackValue = useMemo(() => palette[0]?.value ?? '#3f3f46', [palette]);

  const [internalValue, setInternalValue] = useState<string>(defaultValue ?? fallbackValue);
  const isControlled = value != null;
  const currentValue = isControlled ? value ?? fallbackValue : internalValue;

  useEffect(() => {
    if (isControlled) {
      return;
    }
    if (defaultValue != null) {
      setInternalValue(defaultValue);
      return;
    }
    setInternalValue(fallbackValue);
  }, [defaultValue, fallbackValue, isControlled]);

  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const popoverId = useId();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    setPortalContainer(portalContainerProp ?? document.body ?? null);
  }, [portalContainerProp]);

  const handleRequestClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      if (closeActivePicker === handleRequestClose) {
        closeActivePicker = null;
      }
      return;
    }

    if (closeActivePicker && closeActivePicker !== handleRequestClose) {
      closeActivePicker();
    }
    closeActivePicker = handleRequestClose;

    return () => {
      if (closeActivePicker === handleRequestClose) {
        closeActivePicker = null;
      }
    };
  }, [handleRequestClose, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => {
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      handleRequestClose();
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleRequestClose();
      }
    };

    const handleScroll = () => handleRequestClose();

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleRequestClose);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleRequestClose);
    };
  }, [handleRequestClose, isOpen]);

  useIsomorphicLayoutEffect(() => {
    if (!isOpen) {
      return;
    }
    const triggerEl = triggerRef.current;
    const popoverEl = popoverRef.current;
    if (!triggerEl || !popoverEl) {
      return;
    }

    popoverEl.style.visibility = 'hidden';
    popoverEl.style.display = 'block';

    const triggerRect = triggerEl.getBoundingClientRect();
    const { width, height } = popoverEl.getBoundingClientRect();
    const nextPosition = clampRectWithinViewport(triggerRect, { width, height });
    setPosition(nextPosition);

    popoverEl.style.visibility = '';
    popoverEl.style.display = '';
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const popoverEl = popoverRef.current;
    if (!popoverEl) {
      return;
    }

    const selectedButton = popoverEl.querySelector<HTMLButtonElement>(
      '[data-color-option][data-selected="true"]'
    );
    const firstButton = popoverEl.querySelector<HTMLButtonElement>('[data-color-option]');
    (selectedButton ?? firstButton)?.focus({ preventScroll: true });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const input = customInputRef.current;
    if (!input) {
      return;
    }
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(currentValue ?? '')) {
      input.value = currentValue!;
    }
  }, [currentValue, isOpen]);

  const handleToggle = useCallback(() => {
    if (disabled) {
      return;
    }
    setIsOpen((prev) => !prev);
  }, [disabled]);

  const handleTriggerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleToggle();
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        handleRequestClose();
      }
    },
    [handleRequestClose, handleToggle, isOpen]
  );

  const handleSelect = useCallback(
    (next: string) => {
      if (!isControlled) {
        setInternalValue(next);
      }
      onChange?.(next);
      handleRequestClose();
    },
    [handleRequestClose, isControlled, onChange]
  );

  const handleChipClick = useCallback(() => {
    if (isOpen) {
      handleRequestClose();
    } else {
      handleToggle();
    }
  }, [handleRequestClose, handleToggle, isOpen]);

  const handleCustomClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const input = customInputRef.current;
      if (!input) {
        return;
      }
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(currentValue ?? '')) {
        input.value = currentValue!;
      }
      input.click();
    },
    [currentValue]
  );

  const handleCustomInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value || '#ffffff';
      handleSelect(nextValue);
    },
    [handleSelect]
  );

  const normalizedCurrentValue = normalizeColorValue(currentValue);
  const displayLabel = getDisplayLabel(currentValue, palette);
  const displayValue = currentValue.startsWith('#') ? currentValue.toUpperCase() : currentValue;

  const popover =
    isOpen && portalContainer
      ? createPortal(
          <div
            ref={popoverRef}
            id={popoverId}
            role="dialog"
            aria-modal="false"
            className="rarity-color-picker__popover fixed z-[4000] max-w-[240px] rounded-xl border border-border/70 bg-[#11111a] p-3 text-sm text-surface-foreground shadow-[0_12px_40px_rgba(10,10,16,0.65)]"
            style={{ left: `${position.left}px`, top: `${position.top}px` }}
          >
            <div className="grid grid-cols-6 gap-2">
              {palette.map((option) => {
                const normalizedValue = normalizeColorValue(option.value);
                const isSelected = normalizedValue === normalizedCurrentValue;

                const isSpecial = isRainbow(option.value) || isMetal(option.value);

                return (
                  <button
                    key={option.id}
                    type="button"
                    data-color-option
                    data-selected={isSelected ? 'true' : undefined}
                    className={clsx(
                      'h-9 w-9 rounded-lg border border-border/60 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                      isRainbow(option.value) && 'bg-gradient-rainbow border-transparent',
                      isGold(option.value) && 'bg-gradient-gold border-[#b08d1a]',
                      isSilver(option.value) && 'bg-gradient-silver border-[#9ca3af]',
                      isSelected && 'border-accent/70 ring-2 ring-accent/60'
                    )}
                    style={isSpecial ? undefined : { backgroundColor: option.value }}
                    aria-label={`${option.name} (${option.value})`}
                    onClick={() => handleSelect(option.value)}
                  />
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center rounded-lg border border-dashed border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-accent/60 hover:text-surface-foreground"
                onClick={handleCustomClick}
              >
                カスタム…
              </button>
              <input
                ref={customInputRef}
                type="color"
                className="sr-only"
                onChange={handleCustomInput}
              />
              <span className="text-xs text-muted-foreground">{displayLabel || displayValue}</span>
            </div>
          </div>,
          portalContainer
        )
      : null;

  return (
    <div className="rarity-color-picker inline-flex items-center gap-3">
      <RarityColorChip
        ref={triggerRef}
        value={currentValue ?? fallbackValue}
        ariaLabel={ariaLabel ?? 'レアリティカラーを選択'}
        ariaControls={popoverId}
        ariaExpanded={isOpen}
        disabled={disabled}
        onClick={handleChipClick}
        onKeyDown={handleTriggerKeyDown}
        colorInfo={displayLabel || displayValue}
      />
      {popover}
    </div>
  );
}
