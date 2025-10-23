import { CheckIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

export interface SingleSelectDropdownOption<TValue extends string = string> {
  value: TValue;
  label: string;
  disabled?: boolean;
  style?: CSSProperties;
  className?: string;
  [key: string]: unknown;
}

export interface SingleSelectDropdownClassNames {
  root: string;
  button: string;
  buttonOpen: string;
  buttonClosed: string;
  label: string;
  icon: string;
  iconOpen: string;
  menu: string;
  option: string;
  optionActive: string;
  optionInactive: string;
  optionLabel: string;
  checkIcon: string;
}

export interface SingleSelectDropdownProps<TValue extends string = string> {
  value?: TValue | '';
  onChange?: (value: TValue) => void;
  options: Array<SingleSelectDropdownOption<TValue>>;
  placeholder?: string;
  disabled?: boolean;
  classNames?: Partial<SingleSelectDropdownClassNames>;
  renderButtonLabel?: (context: {
    selectedOption?: SingleSelectDropdownOption<TValue>;
    placeholder?: string;
  }) => ReactNode;
  renderOptionLabel?: (context: {
    option: SingleSelectDropdownOption<TValue>;
    isActive: boolean;
  }) => ReactNode;
}

const DEFAULT_CLASSNAMES: SingleSelectDropdownClassNames = {
  root: '',
  button: '',
  buttonOpen: '',
  buttonClosed: '',
  label: '',
  icon: '',
  iconOpen: '',
  menu: '',
  option: '',
  optionActive: '',
  optionInactive: '',
  optionLabel: '',
  checkIcon: ''
};

export function SingleSelectDropdown<TValue extends string = string>(
  props: SingleSelectDropdownProps<TValue>
): JSX.Element {
  const {
    value,
    onChange,
    options,
    placeholder = '未選択',
    disabled = false,
    classNames: classNamesProp,
    renderButtonLabel,
    renderOptionLabel
  } = props;

  const classNames = useMemo(
    () => ({ ...DEFAULT_CLASSNAMES, ...classNamesProp }),
    [classNamesProp]
  );

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const resolvedValue = useMemo(() => {
    if (!value) {
      return undefined;
    }
    const matched = options.find((option) => option.value === value);
    return matched ? matched.value : undefined;
  }, [options, value]);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === resolvedValue),
    [options, resolvedValue]
  );

  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const toggleOpen = useCallback(() => {
    if (disabled) {
      return;
    }
    setOpen((prev) => !prev);
  }, [disabled]);

  const handleOptionSelect = useCallback(
    (nextValue: TValue) => {
      if (disabled) {
        return;
      }
      if (onChange) {
        onChange(nextValue);
      }
      setOpen(false);
    },
    [disabled, onChange]
  );

  const buttonLabel = useMemo(() => {
    if (renderButtonLabel) {
      return renderButtonLabel({ selectedOption, placeholder });
    }
    if (selectedOption) {
      return selectedOption.label;
    }
    return placeholder;
  }, [placeholder, renderButtonLabel, selectedOption]);

  const handleButtonKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!open) {
          setOpen(true);
        }
      }
      if (event.key === 'Escape') {
        setOpen(false);
      }
    },
    [open]
  );

  return (
    <div className={clsx('relative', classNames.root)} ref={containerRef}>
      <button
        type="button"
        className={clsx(
          classNames.button,
          open ? classNames.buttonOpen : classNames.buttonClosed
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggleOpen}
        onKeyDown={handleButtonKeyDown}
        disabled={disabled}
      >
        <span className={clsx('flex-1 text-left', classNames.label)}>{buttonLabel}</span>
        <ChevronDownIcon
          className={clsx(classNames.icon, open && classNames.iconOpen)}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          role="listbox"
          className={classNames.menu}
          tabIndex={-1}
        >
          {options.map((option) => {
            const isActive = option.value === selectedOption?.value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isActive}
                disabled={option.disabled}
                className={clsx(
                  classNames.option,
                  isActive ? classNames.optionActive : classNames.optionInactive,
                  option.className
                )}
                style={option.style}
                onClick={() => handleOptionSelect(option.value)}
              >
                <span className={clsx('flex-1 text-left', classNames.optionLabel)}>
                  {renderOptionLabel ? renderOptionLabel({ option, isActive }) : option.label}
                </span>
                <CheckIcon
                  className={clsx(
                    classNames.checkIcon,
                    isActive ? 'opacity-100' : 'opacity-0'
                  )}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
