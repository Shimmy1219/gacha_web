import { type ReactNode } from 'react';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ModalBaseProps<T = unknown> {
  id: string;
  title: string;
  size?: ModalSize;
  description?: string;
  dismissible?: boolean;
  payload?: T;
  onClose?: () => void;
}

export interface ModalComponentProps<T = unknown> extends ModalBaseProps<T> {
  close: () => void;
  dismiss: () => void;
  push: <P = unknown>(component: ModalComponent<P>, props: ModalBaseProps<P>) => void;
  replace: <P = unknown>(component: ModalComponent<P>, props: ModalBaseProps<P>) => void;
  isTop: boolean;
  footer?: ReactNode;
}

export type ModalComponent<T = unknown> = (props: ModalComponentProps<T>) => ReactNode;

export interface ModalStackEntry {
  key: string;
  component: ModalComponent<any>;
  props: ModalBaseProps<any>;
}

export interface ModalState {
  stack: ModalStackEntry[];
  modalCount: number;
}
