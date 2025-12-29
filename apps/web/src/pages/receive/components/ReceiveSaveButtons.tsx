import { ArrowDownTrayIcon, ArrowPathIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

interface ReceiveSaveButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
}

export function ReceiveSaveButton({ label = '保存', className, ...rest }: ReceiveSaveButtonProps): JSX.Element {
  return (
    <button
      type="button"
      {...rest}
      className={clsx(
        'btn btn-primary inline-flex items-center gap-2 rounded-xl disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
    >
      <ArrowUpTrayIcon className="h-5 w-5" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

interface ReceiveBulkSaveButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  label?: string;
}

export function ReceiveBulkSaveButton({
  isLoading = false,
  label = 'まとめて保存',
  className,
  disabled,
  ...rest
}: ReceiveBulkSaveButtonProps): JSX.Element {
  const isDisabled = disabled || isLoading;

  return (
    <button
      type="button"
      {...rest}
      disabled={isDisabled}
      className={clsx(
        'btn btn-muted inline-flex items-center gap-2 rounded-full disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
    >
      {isLoading ? (
        <ArrowPathIcon className="h-5 w-5 animate-spin" aria-hidden="true" />
      ) : (
        <ArrowDownTrayIcon className="h-5 w-5" aria-hidden="true" />
      )}
      <span>{label}</span>
    </button>
  );
}
