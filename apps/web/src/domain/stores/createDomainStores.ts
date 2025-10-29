import type { AppPersistence, GachaLocalStorageSnapshot } from '../app-persistence';
import { projectInventories } from '../inventoryProjection';
import { AppStateStore } from './appStateStore';
import { CatalogStore } from './catalogStore';
import { PtControlsStore } from './ptControlsStore';
import { RarityStore } from './rarityStore';
import { RiaguStore } from './riaguStore';
import { PullHistoryStore } from './pullHistoryStore';
import { UserInventoryStore } from './userInventoryStore';
import { UserProfileStore } from './userProfileStore';
import { UiPreferencesStore } from './uiPreferencesStore';

export interface DomainStores {
  appState: AppStateStore;
  catalog: CatalogStore;
  rarities: RarityStore;
  userInventories: UserInventoryStore;
  userProfiles: UserProfileStore;
  riagu: RiaguStore;
  ptControls: PtControlsStore;
  uiPreferences: UiPreferencesStore;
  pullHistory: PullHistoryStore;
}

export function createDomainStores(persistence: AppPersistence): DomainStores {
  const stores: DomainStores = {
    appState: new AppStateStore(persistence),
    catalog: new CatalogStore(persistence),
    rarities: new RarityStore(persistence),
    userInventories: new UserInventoryStore(persistence),
    userProfiles: new UserProfileStore(persistence),
    riagu: new RiaguStore(persistence),
    ptControls: new PtControlsStore(persistence),
    uiPreferences: new UiPreferencesStore(persistence),
    pullHistory: new PullHistoryStore(persistence)
  };

  const snapshot = hydrateStores(stores, () => persistence.loadSnapshot());

  const initialLegacy = snapshot?.userInventories;

  const runProjection = (includeLegacy: boolean) => {
    const { state } = projectInventories({
      pullHistory: stores.pullHistory.getState(),
      catalogState: stores.catalog.getState(),
      legacyInventories: includeLegacy ? initialLegacy : undefined
    });

    stores.userInventories.applyProjectionResult(state);
    stores.userInventories.saveDebounced();
  };

  runProjection(true);

  let skipInitialPullHistory = true;
  stores.pullHistory.subscribe(() => {
    if (skipInitialPullHistory) {
      skipInitialPullHistory = false;
      return;
    }
    runProjection(false);
  });

  let skipInitialCatalog = true;
  stores.catalog.subscribe(() => {
    if (skipInitialCatalog) {
      skipInitialCatalog = false;
      return;
    }
    runProjection(false);
  });

  return stores;
}

function hydrateStores(
  stores: DomainStores,
  load: () => GachaLocalStorageSnapshot
): GachaLocalStorageSnapshot | null {
  try {
    const snapshot = load();
    stores.appState.hydrate(snapshot.appState);
    stores.catalog.hydrate(snapshot.catalogState);
    stores.rarities.hydrate(snapshot.rarityState);
    stores.userInventories.hydrate(snapshot.userInventories);
    stores.userProfiles.hydrate(snapshot.userProfiles);
    stores.riagu.hydrate(snapshot.riaguState);
    stores.ptControls.hydrate(snapshot.ptSettings);
    stores.uiPreferences.hydrate(snapshot.uiPreferences);
    stores.pullHistory.hydrate(snapshot.pullHistory);
    return snapshot;
  } catch (error) {
    console.warn('Failed to hydrate domain stores from persistence snapshot', error);
    return null;
  }
}
