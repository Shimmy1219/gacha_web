import { Dialog } from '@headlessui/react';
import { clsx } from 'clsx';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

import { type ModalSize } from './ModalTypes';

const SIZE_CLASS_MAP: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-5xl'
};

interface ModalOverlayProps extends ComponentPropsWithoutRef<typeof Dialog.Overlay> {}

export function ModalOverlay({ className, ...props }: ModalOverlayProps): JSX.Element {
  return (
    <Dialog.Overlay
      {...props}
      className={clsx(
        'modal-overlay fixed inset-0 bg-black/65 backdrop-blur-sm transition-opacity duration-200',
        className
      )}
    />
  );
}

interface ModalPanelProps extends ComponentPropsWithoutRef<typeof Dialog.Panel> {
  size?: ModalSize;
}

export function ModalPanel({ size = 'md', className, ...props }: ModalPanelProps): JSX.Element {
  return (
    <Dialog.Panel
      {...props}
      className={clsx(
        'modal-panel flex w-full transform flex-col overflow-hidden rounded-2xl border border-border/70 bg-panel/95 text-surface-foreground shadow-panel backdrop-blur',
        SIZE_CLASS_MAP[size],
        'p-6',
        className
      )}
    />
  );
}

interface ModalHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function ModalHeader({ title, description, actions, className }: ModalHeaderProps): JSX.Element {
  return (
    <div className={clsx('modal-header flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="space-y-2">
        <Dialog.Title className="text-lg font-semibold text-surface-foreground">{title}</Dialog.Title>
        {description ? (
          <Dialog.Description className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </Dialog.Description>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

interface ModalBodyProps extends ComponentPropsWithoutRef<'div'> {}

export function ModalBody({ className, ...props }: ModalBodyProps): JSX.Element {
  return <div {...props} className={clsx('modal-body mt-6 space-y-6 text-sm', className)} />;
}

interface ModalFooterProps extends ComponentPropsWithoutRef<'div'> {}

export function ModalFooter({ className, ...props }: ModalFooterProps): JSX.Element {
  return (
    <div
      {...props}
      className={clsx(
        'modal-footer mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-white/5 pt-4',
        className
      )}
    />
  );
}
