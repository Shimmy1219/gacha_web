import { AppPersistence, type PtSettingsStateV3 } from '../app-persistence';
import { PersistedStore } from './persistedStore';

export class PtControlsStore extends PersistedStore<PtSettingsStateV3 | undefined> {
  constructor(persistence: AppPersistence) {
    super(persistence);
  }

  protected persistImmediate(state: PtSettingsStateV3 | undefined): void {
    this.persistence.savePtSettings(state);
  }

  protected persistDebounced(state: PtSettingsStateV3 | undefined): void {
    this.persistence.savePtSettingsDebounced(state);
  }
}
