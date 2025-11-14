import { Switch } from '@headlessui/react';
import { clsx } from 'clsx';
import { type ComponentPropsWithoutRef, useCallback } from 'react';

interface SwitchFieldProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  name?: string;
  switchProps?: ComponentPropsWithoutRef<typeof Switch>;
}

export function SwitchField({
  label,
  description,
  checked,
  onChange,
  name,
  switchProps
}: SwitchFieldProps): JSX.Element {
  const { onChange: switchOnChange, className: switchClassName, ...restSwitchProps } = switchProps ?? {};

  const handleSwitchChange = useCallback(
    (value: boolean) => {
      switchOnChange?.(value);
      onChange(value);
    },
    [onChange, switchOnChange]
  );

  return (
    <Switch.Group
      as="div"
      className="switch-field flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-surface/30 px-4 py-3"
    >
      <div className="flex min-w-0 flex-col">
        <Switch.Label className="text-sm font-medium text-surface-foreground">{label}</Switch.Label>
        {description ? (
          <Switch.Description className="text-xs text-muted-foreground">{description}</Switch.Description>
        ) : null}
      </div>
      <Switch
        {...restSwitchProps}
        name={name}
        checked={checked}
        onChange={handleSwitchChange}
        className={clsx(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors duration-150',
          checked ? 'bg-accent' : 'bg-muted/40',
          switchClassName
        )}
      >
        <span
          className={clsx(
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white transition duration-150',
            checked ? 'translate-x-5' : 'translate-x-1'
          )}
        />
      </Switch>
    </Switch.Group>
  );
}
