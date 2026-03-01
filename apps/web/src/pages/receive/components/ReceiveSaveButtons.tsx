import { ArrowDownTrayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

interface ReceiveSaveButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
}

/**
 * 単体アイテムを保存するためのアイコンボタンを描画する。
 * @param param0 ボタンの表示文言と HTML button 属性。
 * @returns 単体保存ボタン。
 */
export function ReceiveSaveButton({ label = '保存', className, ...rest }: ReceiveSaveButtonProps): JSX.Element {
  return (
    <button
      type="button"
      {...rest}
      aria-label={label}
      className={clsx(
        'receive-save-button btn btn-primary inline-flex items-center rounded-xl disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
    >
      <ArrowDownTrayIcon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

interface ReceiveBulkSaveButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  label?: string;
  loadingLabel?: string;
  tone?: 'muted' | 'accent';
  showIcon?: boolean;
}

/**
 * 複数アイテムを一括保存するためのボタンを描画する。
 * @param param0 ローディング状態、見た目トーン、表示文言などのボタン設定。
 * @returns 一括保存ボタン。
 */
export function ReceiveBulkSaveButton({
  isLoading = false,
  label = 'まとめて保存',
  loadingLabel = '保存中…',
  tone = 'muted',
  showIcon = true,
  className,
  disabled,
  ...rest
}: ReceiveBulkSaveButtonProps): JSX.Element {
  const isDisabled = disabled || isLoading;
  const toneClassName = tone === 'accent' ? 'btn-primary' : 'btn-muted';
  const currentLabel = isLoading ? loadingLabel : label;

  return (
    <button
      type="button"
      {...rest}
      disabled={isDisabled}
      className={clsx(
        'receive-bulk-save-button btn inline-flex items-center gap-2 rounded-full disabled:cursor-not-allowed disabled:opacity-60',
        toneClassName,
        className
      )}
    >
      {showIcon
        ? isLoading
          ? <ArrowPathIcon className="receive-bulk-save-button__icon h-5 w-5 animate-spin" aria-hidden="true" />
          : <ArrowDownTrayIcon className="receive-bulk-save-button__icon h-5 w-5" aria-hidden="true" />
        : null}
      <span className="receive-bulk-save-button__label">{currentLabel}</span>
    </button>
  );
}
