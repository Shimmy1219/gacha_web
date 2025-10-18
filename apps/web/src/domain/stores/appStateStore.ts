import { AppPersistence, type GachaAppStateV3 } from '../app-persistence';
import { PersistedStore, type UpdateOptions } from './persistedStore';

export class AppStateStore extends PersistedStore<GachaAppStateV3 | undefined> {
  constructor(persistence: AppPersistence) {
    super(persistence);
  }

  protected persistImmediate(state: GachaAppStateV3 | undefined): void {
    this.persistence.saveAppState(state);
  }

  protected persistDebounced(state: GachaAppStateV3 | undefined): void {
    this.persistence.saveAppStateDebounced(state);
  }

  setSelectedGacha(gachaId: string | null, options: UpdateOptions = { persist: 'debounced' }): void {
    this.update(
      (previous) => {
        if (!previous) {
          return previous;
        }
        if (previous.selectedGachaId === gachaId) {
          return previous;
        }
        return {
          ...previous,
          selectedGachaId: gachaId,
          updatedAt: new Date().toISOString()
        };
      },
      options
    );
  }
}
