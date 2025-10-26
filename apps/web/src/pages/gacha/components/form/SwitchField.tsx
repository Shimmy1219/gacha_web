import { Switch } from '@headlessui/react';
import { clsx } from 'clsx';

interface SwitchFieldProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  name?: string;
}

export function SwitchField({ label, description, checked, onChange, name }: SwitchFieldProps): JSX.Element {
  return (
    <Switch.Group
      as="div"
      className="switch-field flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-surface/30 px-4 py-3"
    >
      <div className="flex flex-col">
        <Switch.Label className="text-sm font-medium text-surface-foreground">{label}</Switch.Label>
        {description ? (
          <Switch.Description className="text-xs text-muted-foreground">{description}</Switch.Description>
        ) : null}
      </div>
      <Switch
        name={name}
        checked={checked}
        onChange={onChange}
        className={clsx(
          'relative inline-flex h-6 w-11 items-center rounded-full border border-transparent transition-colors duration-150',
          checked ? 'bg-accent' : 'bg-muted/40'
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
