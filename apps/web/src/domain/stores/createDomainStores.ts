import type { AppPersistence, GachaLocalStorageSnapshot } from '../app-persistence';
import { AppStateStore } from './appStateStore';
import { CatalogStore } from './catalogStore';
import { PtControlsStore } from './ptControlsStore';
import { RarityStore } from './rarityStore';
import { RiaguStore } from './riaguStore';
import { UserInventoryStore } from './userInventoryStore';
import { UiPreferencesStore } from './uiPreferencesStore';

export interface DomainStores {
  appState: AppStateStore;
  catalog: CatalogStore;
  rarities: RarityStore;
  userInventories: UserInventoryStore;
  riagu: RiaguStore;
  ptControls: PtControlsStore;
  uiPreferences: UiPreferencesStore;
}

export function createDomainStores(persistence: AppPersistence): DomainStores {
  const stores: DomainStores = {
    appState: new AppStateStore(persistence),
    catalog: new CatalogStore(persistence),
    rarities: new RarityStore(persistence),
    userInventories: new UserInventoryStore(persistence),
    riagu: new RiaguStore(persistence),
    ptControls: new PtControlsStore(persistence),
    uiPreferences: new UiPreferencesStore(persistence)
  };

  hydrateStores(stores, () => persistence.loadSnapshot());

  return stores;
}

function hydrateStores(stores: DomainStores, load: () => GachaLocalStorageSnapshot): void {
  try {
    const snapshot = load();
    stores.appState.hydrate(snapshot.appState);
    stores.catalog.hydrate(snapshot.catalogState);
    stores.rarities.hydrate(snapshot.rarityState);
    stores.userInventories.hydrate(snapshot.userInventories);
    stores.riagu.hydrate(snapshot.riaguState);
    stores.ptControls.hydrate(snapshot.ptSettings);
    stores.uiPreferences.hydrate(snapshot.uiPreferences);
  } catch (error) {
    console.warn('Failed to hydrate domain stores from persistence snapshot', error);
  }
}
