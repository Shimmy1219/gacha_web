import { AppPersistence, type RiaguStateV3 } from '../app-persistence';
import { PersistedStore } from './persistedStore';

export class RiaguStore extends PersistedStore<RiaguStateV3 | undefined> {
  constructor(persistence: AppPersistence) {
    super(persistence);
  }

  protected persistImmediate(state: RiaguStateV3 | undefined): void {
    this.persistence.saveRiaguState(state);
  }

  protected persistDebounced(state: RiaguStateV3 | undefined): void {
    this.persistence.saveRiaguStateDebounced(state);
  }
}
