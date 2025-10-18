import { AppPersistence, type GachaRarityStateV3 } from '../app-persistence';
import { PersistedStore } from './persistedStore';

export class RarityStore extends PersistedStore<GachaRarityStateV3 | undefined> {
  constructor(persistence: AppPersistence) {
    super(persistence);
  }

  protected persistImmediate(state: GachaRarityStateV3 | undefined): void {
    this.persistence.saveRarityState(state);
  }

  protected persistDebounced(state: GachaRarityStateV3 | undefined): void {
    this.persistence.saveRarityStateDebounced(state);
  }
}
