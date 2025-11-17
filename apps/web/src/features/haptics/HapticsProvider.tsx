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

        clickListener = (event: MouseEvent) => {
          const target = event.target instanceof HTMLElement ? event.target : null;
          if (!target) {
            return;
          }

          const actionable = target.closest(
            'button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]'
          );
          if (actionable) {
            triggerSelection();
          }
        };

        document.addEventListener('click', clickListener, true);

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
    };
  }, []);

  const value = useMemo(() => contextValue, [contextValue]);

  return <HapticsContext.Provider value={value}>{children}</HapticsContext.Provider>;
}

export function useHaptics(): HapticsContextValue {
  return useContext(HapticsContext);
}
