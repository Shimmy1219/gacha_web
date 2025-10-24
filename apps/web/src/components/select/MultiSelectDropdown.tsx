import { CheckIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';

export interface MultiSelectOption<Value extends string = string> {
  value: Value;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface MultiSelectDropdownLabels {
  all?: ReactNode;
  none?: ReactNode;
  multiple?: (count: number) => ReactNode;
}

export interface MultiSelectDropdownClassNames {
  root?: string;
  button?: string;
  buttonOpen?: string;
  buttonClosed?: string;
  icon?: string;
  iconOpen?: string;
  menu?: string;
  option?: string;
  optionActive?: string;
  optionInactive?: string;
  optionDescription?: string;
  optionLabel?: string;
  checkIcon?: string;
  allButton?: string;
  allButtonActive?: string;
  allButtonInactive?: string;
  divider?: string;
}

export interface MultiSelectDropdownProps<
  Value extends string = string,
  AllValue extends string = '*'
> {
  id?: string;
  value: AllValue | Value[];
  options: MultiSelectOption<Value>[];
  onChange: (value: AllValue | Value[]) => void;
  labels?: MultiSelectDropdownLabels;
  classNames?: MultiSelectDropdownClassNames;
  allValue?: AllValue;
  showSelectAll?: boolean;
  disabled?: boolean;
  renderButtonLabel?: (context: {
    allSelected: boolean;
    selectedValues: Set<Value>;
    value: AllValue | Value[];
    options: MultiSelectOption<Value>[];
  }) => ReactNode;
  renderOptionContent?: (option: MultiSelectOption<Value>, selected: boolean) => ReactNode;
  onOpenChange?: (open: boolean) => void;
}

const DEFAULT_MENU_HEIGHT_GUESS = 320;

const DEFAULT_CLASS_NAMES: MultiSelectDropdownClassNames = {
  root: 'relative',
  button:
    'inline-flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-panel px-4 py-2 text-sm text-surface-foreground shadow-[0_10px_32px_rgba(0,0,0,0.45)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-deep',
  buttonOpen: 'border-accent text-accent',
  buttonClosed: 'hover:border-accent/70',
  icon: 'h-4 w-4 text-muted-foreground transition-transform',
  iconOpen: 'rotate-180 text-accent',
  menu:
    'absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 max-h-80 space-y-1 overflow-y-auto rounded-xl border border-border/60 bg-panel/95 p-2 shadow-[0_18px_44px_rgba(0,0,0,0.6)] backdrop-blur-sm',
  option: 'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition',
  optionActive: 'bg-accent/10 text-surface-foreground',
  optionInactive: 'text-muted-foreground hover:bg-surface/40',
  optionDescription: 'text-[10px] text-muted-foreground/80',
  optionLabel: 'flex flex-col gap-1 text-left',
  checkIcon: 'h-4 w-4 text-accent transition',
  allButton:
    'flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground transition hover:bg-surface/40',
  allButtonActive: 'text-accent',
  allButtonInactive: 'text-muted-foreground',
  divider: 'h-px bg-gradient-to-r from-transparent via-border/60 to-transparent'
};

export function MultiSelectDropdown<Value extends string = string, AllValue extends string = '*'>({
  id,
  value,
  options,
  onChange,
  labels,
  classNames,
  allValue,
  showSelectAll = true,
  disabled = false,
  renderButtonLabel,
  renderOptionContent,
  onOpenChange
}: MultiSelectDropdownProps<Value, AllValue>): JSX.Element {
  const sentinel = (allValue ?? ('*' as AllValue));
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const classes = useMemo(
    () => ({
      root: clsx(DEFAULT_CLASS_NAMES.root, classNames?.root),
      button: clsx(DEFAULT_CLASS_NAMES.button, classNames?.button),
      buttonOpen: clsx(DEFAULT_CLASS_NAMES.buttonOpen, classNames?.buttonOpen),
      buttonClosed: clsx(DEFAULT_CLASS_NAMES.buttonClosed, classNames?.buttonClosed),
      icon: clsx(DEFAULT_CLASS_NAMES.icon, classNames?.icon),
      iconOpen: clsx(DEFAULT_CLASS_NAMES.iconOpen, classNames?.iconOpen),
      menu: clsx(DEFAULT_CLASS_NAMES.menu, classNames?.menu),
      option: clsx(DEFAULT_CLASS_NAMES.option, classNames?.option),
      optionActive: clsx(DEFAULT_CLASS_NAMES.optionActive, classNames?.optionActive),
      optionInactive: clsx(DEFAULT_CLASS_NAMES.optionInactive, classNames?.optionInactive),
      optionDescription: clsx(DEFAULT_CLASS_NAMES.optionDescription, classNames?.optionDescription),
      optionLabel: clsx(DEFAULT_CLASS_NAMES.optionLabel, classNames?.optionLabel),
      checkIcon: clsx(DEFAULT_CLASS_NAMES.checkIcon, classNames?.checkIcon),
      allButton: clsx(DEFAULT_CLASS_NAMES.allButton, classNames?.allButton),
      allButtonActive: clsx(DEFAULT_CLASS_NAMES.allButtonActive, classNames?.allButtonActive),
      allButtonInactive: clsx(DEFAULT_CLASS_NAMES.allButtonInactive, classNames?.allButtonInactive),
      divider: clsx(DEFAULT_CLASS_NAMES.divider, classNames?.divider)
    }),
    [classNames]
  );

  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      if (!containerRef.current) {
        return;
      }
      const target = event.target as Node | null;
      if (target && containerRef.current.contains(target)) {
        return;
      }
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const allValues = useMemo(() => options.map((option) => option.value), [options]);

  const selectedSet = useMemo(() => {
    if (typeof value === 'string') {
      if (value === sentinel) {
        return new Set(allValues);
      }
      return new Set<Value>();
    }
    return new Set(value);
  }, [allValues, sentinel, value]);

  const allSelected = selectedSet.size === allValues.length && allValues.length > 0;

  const resolvedLabels = useMemo(() => {
    const multiple = labels?.multiple ?? ((count: number) => `${count} selected`);
    return {
      all: labels?.all ?? 'All',
      none: labels?.none ?? 'None',
      multiple
    };
  }, [labels]);

  const buttonLabel = useMemo(() => {
    if (renderButtonLabel) {
      return renderButtonLabel({
        allSelected,
        selectedValues: selectedSet,
        value,
        options
      });
    }

    if (allSelected) {
      return resolvedLabels.all;
    }

    if (selectedSet.size === 0) {
      return resolvedLabels.none;
    }

    if (selectedSet.size === 1) {
      const [single] = Array.from(selectedSet);
      const option = options.find((candidate) => candidate.value === single);
      return option?.label ?? resolvedLabels.multiple(1);
    }

    return resolvedLabels.multiple(selectedSet.size);
  }, [allSelected, options, renderButtonLabel, resolvedLabels, selectedSet, value]);

  const toggleOpen = (): void => {
    if (disabled) {
      return;
    }
    setOpen((previous) => !previous);
  };

  const handleToggleAll = (): void => {
    if (!showSelectAll) {
      return;
    }
    if (typeof value === 'string' && value === sentinel) {
      onChange([] as Value[]);
      return;
    }
    if (allSelected) {
      onChange([] as Value[]);
      return;
    }
    onChange(sentinel);
  };

  const handleToggleValue = (nextValue: Value): void => {
    if (disabled) {
      return;
    }
    const baseSet =
      typeof value === 'string' && value === sentinel ? new Set(allValues) : new Set(value as Value[]);
    if (baseSet.has(nextValue)) {
      baseSet.delete(nextValue);
    } else {
      baseSet.add(nextValue);
    }

    if (baseSet.size === 0 || baseSet.size === allValues.length) {
      onChange(sentinel);
      return;
    }
    onChange(Array.from(baseSet) as Value[]);
  };

  return (
    <div ref={containerRef} className={clsx(classes.root)}>
      <button
        id={id}
        type="button"
        className={clsx(
          classes.button,
          open ? classes.buttonOpen : classes.buttonClosed,
          disabled && 'pointer-events-none opacity-60'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggleOpen}
        disabled={disabled}
      >
        <span>{buttonLabel}</span>
        <ChevronDownIcon
          className={clsx(classes.icon, open && classes.iconOpen)}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="listbox"
          aria-multiselectable
          className={clsx(classes.menu)}
          style={{ maxHeight: DEFAULT_MENU_HEIGHT_GUESS, overflowY: 'auto' }}
        >
          {showSelectAll ? (
            <button
              type="button"
              className={clsx(
                classes.allButton,
                allSelected ? classes.allButtonActive : classes.allButtonInactive
              )}
              onClick={handleToggleAll}
            >
              <span>{resolvedLabels.all}</span>
              <CheckIcon
                className={clsx(
                  classes.checkIcon,
                  allSelected ? 'opacity-100' : 'opacity-0'
                )}
              />
            </button>
          ) : null}
          {showSelectAll ? (
            <div className={clsx(classes.divider)} aria-hidden />
          ) : null}
          {options.map((option) => {
            const active = selectedSet.has(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                disabled={option.disabled}
                className={clsx(
                  classes.option,
                  active ? classes.optionActive : classes.optionInactive,
                  option.disabled && 'cursor-not-allowed opacity-60'
                )}
                onClick={() => {
                  if (option.disabled) {
                    return;
                  }
                  handleToggleValue(option.value);
                }}
              >
                <span className={classes.optionLabel}>
                  {renderOptionContent ? renderOptionContent(option, active) : option.label}
                  {option.description ? (
                    <span className={clsx(classes.optionDescription)}>{option.description}</span>
                  ) : null}
                </span>
                <CheckIcon
                  className={clsx(
                    classes.checkIcon,
                    active ? 'opacity-100' : 'opacity-0'
                  )}
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
