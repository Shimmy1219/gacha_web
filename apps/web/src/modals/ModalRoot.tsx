import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { useModal } from './ModalProvider';
import { ModalHeader, ModalOverlay, ModalPanel } from './ModalComponents';
import { type ModalComponentProps, type ModalStackEntry } from './ModalTypes';

function ensureModalRoot(): HTMLElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const existing = document.getElementById('modal-root');
  if (existing) {
    return existing;
  }

  const element = document.createElement('div');
  element.setAttribute('id', 'modal-root');
  document.body.appendChild(element);
  return element;
}

interface ModalRendererProps {
  entry: ModalStackEntry;
  isTop: boolean;
  zIndex: number;
}

export function ModalRoot(): JSX.Element | null {
  const { stack } = useModal();
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalElement(ensureModalRoot());
  }, []);

  const modalNodes = useMemo(() => {
    return stack.map((entry, index) => {
      const isTop = index === stack.length - 1;
      const zIndex = 50 + index * 5;
      return <ModalRenderer key={entry.key} entry={entry} isTop={isTop} zIndex={zIndex} />;
    });
  }, [stack]);

  if (!portalElement || modalNodes.length === 0) {
    return null;
  }

  return createPortal(<Fragment>{modalNodes}</Fragment>, portalElement);
}

function ModalRenderer({ entry, isTop, zIndex }: ModalRendererProps): JSX.Element {
  const { pop, dismissAll, push, replace } = useModal();

  const handleClose = () => {
    pop(entry.key);
    entry.props.onClose?.();
  };

  const componentProps: ModalComponentProps<any> = {
    ...entry.props,
    isTop,
    close: handleClose,
    dismiss: dismissAll,
    push,
    replace
  };

  const dismissible = entry.props.dismissible ?? true;

  return (
    <Transition.Root show as={Fragment} appear>
      <Dialog
        static
        open
        onClose={() => {
          if (!dismissible || !isTop) {
            return;
          }
          handleClose();
        }}
        className="modal-root fixed inset-0"
        style={{ zIndex }}
      >
        <div className="flex min-h-full items-center justify-center px-4 py-8">
          <Transition.Child
            as={Fragment}
            enter="duration-200 ease-out"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="duration-150 ease-in"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <ModalOverlay aria-hidden="true" />
          </Transition.Child>

          <Transition.Child
            as={Fragment}
            enter="duration-200 ease-out"
            enterFrom="translate-y-8 opacity-0"
            enterTo="translate-y-0 opacity-100"
            leave="duration-150 ease-in"
            leaveFrom="translate-y-0 opacity-100"
            leaveTo="translate-y-4 opacity-0"
          >
            <ModalPanel
              size={entry.props.size ?? 'md'}
              className={entry.props.panelClassName}
              paddingClassName={entry.props.panelPaddingClassName}
            >
              {dismissible ? (
                <button
                  type="button"
                  onClick={handleClose}
                  className="modal-mobile-close-button absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition hover:bg-white/10 hover:text-surface-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
                >
                  <span className="sr-only">モーダルを閉じる</span>
                  <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              ) : null}
              <ModalHeader title={entry.props.title} description={entry.props.description} />
              {entry.component(componentProps)}
            </ModalPanel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
