import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Context,
  type PropsWithChildren
} from 'react';

import { AppPersistence } from '@domain/app-persistence';
import {
  createDomainStores,
  type DomainStores
} from '@domain/stores/createDomainStores';

interface AppPersistenceContextValue {
  persistence: AppPersistence;
  stores: DomainStores;
}

const APP_PERSISTENCE_CONTEXT_KEY = '__gacha_app_persistence_context__';

const globalObject = globalThis as typeof globalThis & {
  [APP_PERSISTENCE_CONTEXT_KEY]?: Context<AppPersistenceContextValue | null>;
};

const AppPersistenceContext =
  globalObject[APP_PERSISTENCE_CONTEXT_KEY] ??
  (globalObject[APP_PERSISTENCE_CONTEXT_KEY] = createContext<AppPersistenceContextValue | null>(null));

export function AppPersistenceProvider({ children }: PropsWithChildren): JSX.Element | null {
  const [value, setValue] = useState<AppPersistenceContextValue | null>(null);

  useEffect(() => {
    let active = true;
    const persistence = new AppPersistence();

    void persistence
      .whenReady()
      .catch((error) => {
        console.warn('Failed to prepare app persistence; continuing with fallback storage', error);
      })
      .then(() => {
        if (!active) {
          return;
        }
        const stores = createDomainStores(persistence);
        setValue({ persistence, stores });
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!value) {
      return;
    }
    value.stores.activate();
    return () => {
      value.stores.dispose();
    };
  }, [value]);

  if (!value) {
    return null;
  }

  return <AppPersistenceContext.Provider value={value}>{children}</AppPersistenceContext.Provider>;
}

export function useAppPersistence(): AppPersistence {
  const context = useContext(AppPersistenceContext);
  if (!context) {
    throw new Error('useAppPersistence must be used within an AppPersistenceProvider');
  }
  return context.persistence;
}

export function useDomainStores(): DomainStores {
  const context = useContext(AppPersistenceContext);
  if (!context) {
    throw new Error('useDomainStores must be used within an AppPersistenceProvider');
  }
  return context.stores;
}
