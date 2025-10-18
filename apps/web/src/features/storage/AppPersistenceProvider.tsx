import { createContext, useContext, useState, type PropsWithChildren } from 'react';

import { AppPersistence } from '../../../../../packages/domain/app-persistence';
import { createDomainStores, type DomainStores } from '../../../../../packages/domain/stores';

interface AppPersistenceContextValue {
  persistence: AppPersistence;
  stores: DomainStores;
}

const AppPersistenceContext = createContext<AppPersistenceContextValue | null>(null);

export function AppPersistenceProvider({ children }: PropsWithChildren): JSX.Element {
  const [value] = useState<AppPersistenceContextValue>(() => {
    const persistence = new AppPersistence();
    const stores = createDomainStores(persistence);
    return { persistence, stores };
  });

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
