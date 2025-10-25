import { AppPersistence, type UserInventoriesStateV3 } from '../app-persistence';
import { PersistedStore, type UpdateOptions } from './persistedStore';

export class UserInventoryStore extends PersistedStore<UserInventoriesStateV3 | undefined> {
  constructor(persistence: AppPersistence) {
    super(persistence);
  }

  applyProjectionResult(
    state: UserInventoriesStateV3 | undefined,
    options: UpdateOptions = {}
  ): void {
    const { emit, persist = 'none' } = options;
    this.setState(state, { emit, persist: 'none' });

    if (persist === 'immediate') {
      this.save();
    } else if (persist === 'debounced') {
      this.saveDebounced();
    }
  }

  protected persistImmediate(state: UserInventoriesStateV3 | undefined): void {
    this.persistence.saveUserInventories(state);
  }

  protected persistDebounced(state: UserInventoriesStateV3 | undefined): void {
    this.persistence.saveUserInventoriesDebounced(state);
  }
}
