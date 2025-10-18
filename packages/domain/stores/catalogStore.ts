import { AppPersistence, type GachaCatalogStateV3 } from '../app-persistence';
import { PersistedStore } from './persistedStore';

export class CatalogStore extends PersistedStore<GachaCatalogStateV3 | undefined> {
  constructor(persistence: AppPersistence) {
    super(persistence);
  }

  protected persistImmediate(state: GachaCatalogStateV3 | undefined): void {
    this.persistence.saveCatalogState(state);
  }

  protected persistDebounced(state: GachaCatalogStateV3 | undefined): void {
    this.persistence.saveCatalogStateDebounced(state);
  }
}
