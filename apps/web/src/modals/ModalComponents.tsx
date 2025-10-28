import {
  DialogBackdrop,
  DialogDescription,
  DialogPanel,
  DialogTitle
} from '@headlessui/react';
import { clsx } from 'clsx';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode
} from 'react';

import { type ModalSize } from './ModalTypes';

const SIZE_CLASS_MAP: Record<ModalSize, string> = {
  sm: 'max-w-lg',
  md: 'max-w-xl',
  lg: 'max-w-[55rem]',
  xl: 'max-w-[64rem]',
  full: 'max-w-[min(96vw,110rem)] w-[min(96vw,110rem)] max-h-[96vh]'
};

interface ModalOverlayProps extends ComponentPropsWithoutRef<typeof DialogBackdrop> {}

export const ModalOverlay = forwardRef<
  ElementRef<typeof DialogBackdrop>,
  ModalOverlayProps
>(function ModalOverlay({ className, ...props }, ref) {
  return (
    <DialogBackdrop
      {...props}
      ref={ref}
      className={clsx(
        'modal-overlay fixed inset-0 bg-black/65 backdrop-blur-sm transition-opacity duration-200',
        className
      )}
    />
  );
});

interface ModalPanelProps extends ComponentPropsWithoutRef<typeof DialogPanel> {
  size?: ModalSize;
}

export const ModalPanel = forwardRef<
  ElementRef<typeof DialogPanel>,
  ModalPanelProps
>(function ModalPanel({ size = 'md', className, ...props }, ref) {
  return (
    <DialogPanel
      {...props}
      ref={ref}
      className={clsx(
        'modal-panel relative z-10 flex w-full transform flex-col overflow-hidden rounded-2xl border border-border/70 bg-panel/95 text-surface-foreground backdrop-blur',
        SIZE_CLASS_MAP[size],
        'p-6',
        className
      )}
    />
  );
});

interface ModalHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function ModalHeader({ title, description, actions, className }: ModalHeaderProps): JSX.Element {
  return (
    <div className={clsx('modal-header flex flex-wrap items-start justify-between gap-4 border-b border-white/5 pb-4', className)}>
      <div className="space-y-2">
        <DialogTitle className="text-lg font-semibold text-surface-foreground">{title}</DialogTitle>
        {description ? (
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </DialogDescription>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

interface ModalBodyProps extends ComponentPropsWithoutRef<'div'> {}

export const ModalBody = forwardRef<ElementRef<'div'>, ModalBodyProps>(function ModalBody(
  { className, ...props },
  ref
) {
  return <div {...props} ref={ref} className={clsx('modal-body mt-2 space-y-2 text-sm', className)} />;
});

interface ModalFooterProps extends ComponentPropsWithoutRef<'div'> {}

export function ModalFooter({ className, ...props }: ModalFooterProps): JSX.Element {
  return (
    <div
      {...props}
      className={clsx(
        'modal-footer mt-8 flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-white/5 pt-4',
        className
      )}
    />
  );
}
