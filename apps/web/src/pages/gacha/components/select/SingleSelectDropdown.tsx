import { CheckIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';

export interface SingleSelectOption<Value extends string = string> {
  value: Value;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface SingleSelectDropdownClassNames {
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
  optionLabel?: string;
  optionDescription?: string;
  checkIcon?: string;
}

export interface SingleSelectDropdownProps<Value extends string = string> {
  id?: string;
  value?: Value;
  options: SingleSelectOption<Value>[];
  onChange: (value: Value) => void;
  placeholder?: ReactNode;
  classNames?: SingleSelectDropdownClassNames;
  disabled?: boolean;
  showCheckIndicator?: boolean;
  fallbackToFirstOption?: boolean;
  renderButtonLabel?: (context: {
    selectedOption: SingleSelectOption<Value> | undefined;
    options: SingleSelectOption<Value>[];
    value: Value | undefined;
  }) => ReactNode;
  renderOptionContent?: (option: SingleSelectOption<Value>, active: boolean) => ReactNode;
  onOpenChange?: (open: boolean) => void;
}

const DEFAULT_MENU_HEIGHT_GUESS = 260;

const DEFAULT_CLASS_NAMES: SingleSelectDropdownClassNames = {
  root: 'relative',
  button:
    'inline-flex min-w-[8rem] items-center justify-between gap-2 rounded-xl border border-border/60 bg-panel px-3 py-2 text-sm font-semibold text-surface-foreground transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-deep',
  buttonOpen: 'border-accent text-accent',
  buttonClosed: 'hover:border-accent/70',
  icon: 'h-4 w-4 text-muted-foreground transition-transform',
  iconOpen: 'rotate-180 text-accent',
  menu:
    'absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 max-h-72 space-y-1 overflow-y-auto rounded-xl border border-border/60 bg-panel/95 p-2 text-sm backdrop-blur-sm',
  option: 'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition',
  optionActive: 'bg-accent/10 text-surface-foreground',
  optionInactive: 'text-muted-foreground hover:bg-surface/40',
  optionLabel: 'flex-1 text-left',
  optionDescription: 'text-[10px] text-muted-foreground/80',
  checkIcon: 'h-4 w-4 text-accent transition'
};

export function SingleSelectDropdown<Value extends string = string>({
  id,
  value,
  options,
  onChange,
  placeholder = 'Select',
  classNames,
  disabled = false,
  showCheckIndicator = true,
  fallbackToFirstOption = true,
  renderButtonLabel,
  renderOptionContent,
  onOpenChange
}: SingleSelectDropdownProps<Value>): JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

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
      optionLabel: clsx(DEFAULT_CLASS_NAMES.optionLabel, classNames?.optionLabel),
      optionDescription: clsx(DEFAULT_CLASS_NAMES.optionDescription, classNames?.optionDescription),
      checkIcon: clsx(DEFAULT_CLASS_NAMES.checkIcon, classNames?.checkIcon)
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

  const resolvedValue = useMemo(() => {
    if (value !== undefined) {
      return value;
    }
    if (!fallbackToFirstOption) {
      return undefined;
    }
    return options[0]?.value;
  }, [fallbackToFirstOption, options, value]);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === resolvedValue),
    [options, resolvedValue]
  );

  const buttonLabel = useMemo(() => {
    if (renderButtonLabel) {
      return renderButtonLabel({ selectedOption, options, value: resolvedValue });
    }
    return selectedOption?.label ?? placeholder;
  }, [placeholder, renderButtonLabel, resolvedValue, selectedOption, options]);

  const toggleOpen = (): void => {
    if (disabled) {
      return;
    }
    setOpen((previous) => !previous);
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
        <span className={classes.optionLabel}>{buttonLabel}</span>
        <ChevronDownIcon className={clsx(classes.icon, open && classes.iconOpen)} aria-hidden />
      </button>
      {open ? (
        <div role="listbox" className={clsx(classes.menu)} style={{ maxHeight: DEFAULT_MENU_HEIGHT_GUESS }}>
          {options.map((option) => {
            const active = option.value === resolvedValue;
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
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className={classes.optionLabel}>
                  {renderOptionContent ? renderOptionContent(option, active) : option.label}
                  {option.description ? (
                    <span className={clsx(classes.optionDescription)}>{option.description}</span>
                  ) : null}
                </span>
                {showCheckIndicator ? (
                  <CheckIcon
                    className={clsx(classes.checkIcon, active ? 'opacity-100' : 'opacity-0')}
                    aria-hidden
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
