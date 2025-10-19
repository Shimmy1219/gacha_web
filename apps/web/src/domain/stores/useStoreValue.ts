import { useSyncExternalStore } from 'react';

import type { PersistedStore } from './persistedStore';

export function useStoreValue<TState>(store: PersistedStore<TState>): TState | undefined {
  return useSyncExternalStore<TState | undefined>(
    (onStoreChange) =>
      store.subscribe((_state) => {
        onStoreChange();
      }),
    () => store.getState(),
    () => store.getState()
  );
}
