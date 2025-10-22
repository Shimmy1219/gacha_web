import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PropsWithChildren
} from 'react';

import { type ModalBaseProps, type ModalComponent, type ModalState, type ModalStackEntry } from './ModalTypes';
import { ModalRoot } from './ModalRoot';

interface ModalContextValue {
  stack: ModalStackEntry[];
  push: <T = unknown>(component: ModalComponent<T>, props: ModalBaseProps<T>) => void;
  replace: <T = unknown>(component: ModalComponent<T>, props: ModalBaseProps<T>) => void;
  pop: (key?: string) => void;
  dismissAll: () => void;
}

const ModalContext = createContext<ModalContextValue | undefined>(undefined);

type ModalAction =
  | { type: 'PUSH'; entry: ModalStackEntry }
  | { type: 'POP'; key?: string }
  | { type: 'REPLACE'; entry: ModalStackEntry }
  | { type: 'DISMISS_ALL' };

const initialState: ModalState = {
  stack: [],
  modalCount: 0
};

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case 'PUSH': {
      const stack = [...state.stack, action.entry];
      return { stack, modalCount: stack.length };
    }
    case 'POP': {
      if (!state.stack.length) {
        return state;
      }

      const stack = action.key
        ? state.stack.filter((entry) => entry.key !== action.key)
        : state.stack.slice(0, -1);

      return { stack, modalCount: stack.length };
    }
    case 'REPLACE': {
      if (!state.stack.length) {
        return { stack: [action.entry], modalCount: 1 };
      }

      const stack = [...state.stack.slice(0, -1), action.entry];
      return { stack, modalCount: stack.length };
    }
    case 'DISMISS_ALL':
      return { stack: [], modalCount: 0 };
    default:
      return state;
  }
}

function createEntryKey(id: string, counter: number): string {
  return `${id}::${counter}`;
}

export function ModalProvider({ children }: PropsWithChildren): JSX.Element {
  const [state, dispatch] = useReducer(modalReducer, initialState);
  const counterRef = useRef(0);
  const overflowRef = useRef<string | null>(null);
  const [isBrowser, setIsBrowser] = useState(false);

  useEffect(() => {
    setIsBrowser(typeof window !== 'undefined' && typeof document !== 'undefined');
  }, []);

  useEffect(() => {
    if (!isBrowser) {
      return;
    }

    const { body } = document;
    if (state.stack.length > 0) {
      if (overflowRef.current === null) {
        overflowRef.current = body.style.overflow;
      }
      body.dataset.modalOpen = '1';
      body.style.overflow = 'hidden';
    } else {
      body.dataset.modalOpen = '0';
      if (overflowRef.current !== null) {
        body.style.overflow = overflowRef.current;
        overflowRef.current = null;
      } else {
        body.style.removeProperty('overflow');
      }
    }
  }, [state.stack.length, isBrowser]);

  const push = useCallback<ModalContextValue['push']>((component, props) => {
    const nextKey = createEntryKey(props.id, ++counterRef.current);
    dispatch({ type: 'PUSH', entry: { key: nextKey, component, props } });
  }, []);

  const replace = useCallback<ModalContextValue['replace']>((component, props) => {
    const nextKey = createEntryKey(props.id, ++counterRef.current);
    dispatch({ type: 'REPLACE', entry: { key: nextKey, component, props } });
  }, []);

  const pop = useCallback<ModalContextValue['pop']>((key) => {
    dispatch({ type: 'POP', key });
  }, []);

  const dismissAll = useCallback(() => {
    dispatch({ type: 'DISMISS_ALL' });
  }, []);

  const value = useMemo<ModalContextValue>(
    () => ({
      stack: state.stack,
      push,
      replace,
      pop,
      dismissAll
    }),
    [state.stack, push, replace, pop, dismissAll]
  );

  return (
    <ModalContext.Provider value={value}>
      {children}
      <ModalRoot />
    </ModalContext.Provider>
  );
}

export function useModal(): ModalContextValue {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}
