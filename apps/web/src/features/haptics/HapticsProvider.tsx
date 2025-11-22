import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from 'react';

import type { HapticsModule } from '../../types/ios-haptics';

interface HapticsContextValue {
  isSupported: boolean;
  triggerSelection: () => void;
  triggerConfirmation: () => void;
  triggerError: () => void;
}

const noop = () => {};

const defaultContextValue: HapticsContextValue = {
  isSupported: false,
  triggerSelection: noop,
  triggerConfirmation: noop,
  triggerError: noop
};

const HapticsContext = createContext<HapticsContextValue>(defaultContextValue);

export function HapticsProvider({ children }: PropsWithChildren): JSX.Element {
  const [contextValue, setContextValue] = useState<HapticsContextValue>(defaultContextValue);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    let disposed = false;
    let clickListener: ((event: MouseEvent) => void) | undefined;
    let toggleChangeListener: ((event: Event) => void) | undefined;

    const setup = async () => {
      try {
        /* eslint-disable import/no-unresolved */
        const { haptic, supportsHaptics } = (await import(
          /* @vite-ignore */ 'https://esm.sh/ios-haptics'
        )) as HapticsModule;
        /* eslint-enable import/no-unresolved */

        if (disposed || !supportsHaptics) {
          return;
        }

        const triggerSelection = () => {
          haptic?.();
        };

        const triggerConfirmation = () => {
          if (typeof haptic?.confirm === 'function') {
            haptic.confirm();
            return;
          }

          triggerSelection();
        };

        const triggerError = () => {
          if (typeof haptic?.error === 'function') {
            haptic.error();
            return;
          }

          triggerSelection();
        };

        const handleToggleFeedback = (target: HTMLElement | null) => {
          if (!target) {
            return false;
          }

          const toggleLikeElement = target.closest('[role="switch"], [aria-pressed]');
          if (toggleLikeElement) {
            triggerSelection();
            return true;
          }

          return false;
        };

        clickListener = (event: MouseEvent) => {
          const target = event.target instanceof HTMLElement ? event.target : null;
          if (!target) {
            return;
          }

          if (handleToggleFeedback(target)) {
            return;
          }

          const actionable = target.closest(
            'button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]'
          );
          if (actionable) {
            triggerSelection();
          }
        };

        toggleChangeListener = (event: Event) => {
          const target = event.target instanceof HTMLInputElement ? event.target : null;
          if (!target) {
            return;
          }

          if (target.type === 'checkbox' || target.getAttribute('role') === 'switch') {
            triggerSelection();
          }
        };

        document.addEventListener('click', clickListener, true);
        document.addEventListener('change', toggleChangeListener, true);

        setContextValue({
          isSupported: true,
          triggerSelection,
          triggerConfirmation,
          triggerError
        });
      } catch (error) {
        console.error('Failed to initialize haptics support', error);
      }
    };

    void setup();

    return () => {
      disposed = true;
      if (clickListener) {
        document.removeEventListener('click', clickListener, true);
      }
      if (toggleChangeListener) {
        document.removeEventListener('change', toggleChangeListener, true);
      }
    };
  }, []);

  const value = useMemo(() => contextValue, [contextValue]);

  return <HapticsContext.Provider value={value}>{children}</HapticsContext.Provider>;
}

export function useHaptics(): HapticsContextValue {
  return useContext(HapticsContext);
}
