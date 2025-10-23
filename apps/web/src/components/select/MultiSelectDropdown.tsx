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
        <span>{buttonLabel}</span>
        <ChevronDownIcon
          className={clsx(classNames?.icon, open && classNames?.iconOpen)}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="listbox"
          aria-multiselectable
          className={clsx(classNames?.menu)}
          style={{ maxHeight: DEFAULT_MENU_HEIGHT_GUESS, overflowY: 'auto' }}
        >
          {showSelectAll ? (
            <button
              type="button"
              className={clsx(
                classNames?.allButton,
                allSelected ? classNames?.allButtonActive : classNames?.allButtonInactive
              )}
              onClick={handleToggleAll}
            >
              <span>{resolvedLabels.all}</span>
              <CheckIcon
                className={clsx(
                  classNames?.checkIcon,
                  allSelected ? 'opacity-100' : 'opacity-0'
                )}
              />
            </button>
          ) : null}
          {showSelectAll ? (
            <div className={clsx(classNames?.divider)} aria-hidden />
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
                  classNames?.option,
                  active ? classNames?.optionActive : classNames?.optionInactive,
                  option.disabled && 'cursor-not-allowed opacity-60'
                )}
                onClick={() => {
                  if (option.disabled) {
                    return;
                  }
                  handleToggleValue(option.value);
                }}
              >
                <span className={classNames?.optionLabel}>
                  {renderOptionContent ? renderOptionContent(option, active) : option.label}
                  {option.description ? (
                    <span className={clsx(classNames?.optionDescription)}>{option.description}</span>
                  ) : null}
                </span>
                <CheckIcon
                  className={clsx(
                    classNames?.checkIcon,
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
