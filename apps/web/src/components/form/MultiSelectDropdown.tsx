import { CheckIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

export interface MultiSelectDropdownOption<TValue extends string = string> {
  value: TValue;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export interface MultiSelectDropdownClassNames {
  root: string;
  button: string;
  buttonOpen: string;
  buttonClosed: string;
  icon: string;
  iconOpen: string;
  menu: string;
  menuContent: string;
  selectAllButton: string;
  selectAllLabel: string;
  divider: string;
  option: string;
  optionActive: string;
  optionInactive: string;
  optionContent: string;
  optionLabel: string;
  optionDescription: string;
  checkIcon: string;
}

export interface MultiSelectDropdownProps<TValue extends string = string> {
  values: TValue[];
  options: Array<MultiSelectDropdownOption<TValue>>;
  onChange: (values: TValue[]) => void;
  onSelectAll?: () => void;
  onClear?: () => void;
  placeholder?: string;
  selectAllLabel?: string;
  disabled?: boolean;
  classNames?: Partial<MultiSelectDropdownClassNames>;
  renderButtonLabel?: (context: {
    selectedValues: Set<TValue>;
    options: Array<MultiSelectDropdownOption<TValue>>;
    placeholder?: string;
  }) => ReactNode;
  renderOptionLabel?: (context: {
    option: MultiSelectDropdownOption<TValue>;
    isActive: boolean;
  }) => ReactNode;
  renderOptionDescription?: (context: {
    option: MultiSelectDropdownOption<TValue>;
    isActive: boolean;
  }) => ReactNode;
  isAllSelected?: boolean;
}

const DEFAULT_CLASSNAMES: MultiSelectDropdownClassNames = {
  root: '',
  button: '',
  buttonOpen: '',
  buttonClosed: '',
  icon: '',
  iconOpen: '',
  menu: '',
  menuContent: '',
  selectAllButton: '',
  selectAllLabel: '',
  divider: '',
  option: '',
  optionActive: '',
  optionInactive: '',
  optionContent: '',
  optionLabel: '',
  optionDescription: '',
  checkIcon: ''
};

export function MultiSelectDropdown<TValue extends string = string>(
  props: MultiSelectDropdownProps<TValue>
): JSX.Element {
  const {
    values,
    options,
    onChange,
    onSelectAll,
    onClear,
    placeholder = '未選択',
    selectAllLabel = 'すべて',
    disabled = false,
    classNames: classNamesProp,
    renderButtonLabel,
    renderOptionLabel,
    renderOptionDescription,
    isAllSelected = false
  } = props;

  const classNames = useMemo(
    () => ({ ...DEFAULT_CLASSNAMES, ...classNamesProp }),
    [classNamesProp]
  );

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedValues = useMemo(() => new Set(values), [values]);

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

  const handleToggleValue = useCallback(
    (nextValue: TValue) => {
      const base = new Set(selectedValues);
      if (base.has(nextValue)) {
        base.delete(nextValue);
      } else {
        base.add(nextValue);
      }
      onChange(Array.from(base));
    },
    [onChange, selectedValues]
  );

  const handleToggleAll = useCallback(() => {
    if (isAllSelected) {
      if (onClear) {
        onClear();
      } else {
        onChange([]);
      }
    } else if (onSelectAll) {
      onSelectAll();
    } else {
      onChange(options.map((option) => option.value));
    }
  }, [isAllSelected, onChange, onClear, onSelectAll, options]);

  const buttonLabel = useMemo(() => {
    if (renderButtonLabel) {
      return renderButtonLabel({ selectedValues, options, placeholder });
    }
    if (selectedValues.size === 0) {
      return placeholder;
    }
    if (selectedValues.size === options.length) {
      return 'すべて';
    }
    if (selectedValues.size === 1) {
      const [single] = Array.from(selectedValues);
      const matched = options.find((option) => option.value === single);
      return matched?.label ?? placeholder;
    }
    return `${selectedValues.size}項目`;
  }, [options, placeholder, renderButtonLabel, selectedValues]);

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
        <span className="flex-1 text-left">{buttonLabel}</span>
        <ChevronDownIcon
          className={clsx(classNames.icon, open && classNames.iconOpen)}
          aria-hidden
        />
      </button>
      {open ? (
        <div role="listbox" aria-multiselectable className={classNames.menu} tabIndex={-1}>
          <div className={classNames.menuContent}>
            <button
              type="button"
              className={clsx(classNames.selectAllButton)}
              onClick={handleToggleAll}
            >
              <span className={clsx('flex-1 text-left uppercase tracking-[0.2em]', classNames.selectAllLabel)}>
                {selectAllLabel}
              </span>
              <CheckIcon
                className={clsx(
                  classNames.checkIcon,
                  isAllSelected ? 'opacity-100' : 'opacity-0'
                )}
                aria-hidden
              />
            </button>
            <div className={classNames.divider} />
            {options.map((option) => {
              const isActive = selectedValues.has(option.value);
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
                  onClick={() => handleToggleValue(option.value)}
                >
                  <span className={clsx('flex-1 text-left', classNames.optionContent)}>
                    {renderOptionLabel ? (
                      renderOptionLabel({ option, isActive })
                    ) : (
                      <span className={classNames.optionLabel}>{option.label}</span>
                    )}
                    {option.description || renderOptionDescription ? (
                      <span className={clsx('block text-[10px]', classNames.optionDescription)}>
                        {renderOptionDescription
                          ? renderOptionDescription({ option, isActive })
                          : option.description}
                      </span>
                    ) : null}
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
        </div>
      ) : null}
    </div>
  );
}
