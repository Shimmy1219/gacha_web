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
    <div ref={containerRef} className={clsx(classNames?.root)}>
      <button
        id={id}
        type="button"
        className={clsx(
          classNames?.button,
          open ? classNames?.buttonOpen : classNames?.buttonClosed,
          disabled && 'pointer-events-none opacity-60'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggleOpen}
        disabled={disabled}
      >
        <span className={classNames?.optionLabel}>{buttonLabel}</span>
        <ChevronDownIcon className={clsx(classNames?.icon, open && classNames?.iconOpen)} aria-hidden />
      </button>
      {open ? (
        <div role="listbox" className={clsx(classNames?.menu)} style={{ maxHeight: DEFAULT_MENU_HEIGHT_GUESS }}>
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
                  classNames?.option,
                  active ? classNames?.optionActive : classNames?.optionInactive,
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
                <span className={classNames?.optionLabel}>
                  {renderOptionContent ? renderOptionContent(option, active) : option.label}
                  {option.description ? (
                    <span className={clsx(classNames?.optionDescription)}>{option.description}</span>
                  ) : null}
                </span>
                {showCheckIndicator ? (
                  <CheckIcon
                    className={clsx(classNames?.checkIcon, active ? 'opacity-100' : 'opacity-0')}
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
