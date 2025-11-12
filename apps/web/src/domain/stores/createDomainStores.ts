import { GACHA_STORAGE_UPDATED_EVENT } from '../app-persistence';
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
  dispose(): void;
}

export function createDomainStores(persistence: AppPersistence): DomainStores {
  const cleanupTasks: Array<() => void> = [];
  let disposed = false;
  let legacyInventories: GachaLocalStorageSnapshot['userInventories'] | undefined;

  const stores: DomainStores = {
    appState: new AppStateStore(persistence),
    catalog: new CatalogStore(persistence),
    rarities: new RarityStore(persistence),
    userInventories: new UserInventoryStore(persistence),
    userProfiles: new UserProfileStore(persistence),
    riagu: new RiaguStore(persistence),
    ptControls: new PtControlsStore(persistence),
    uiPreferences: new UiPreferencesStore(persistence),
    pullHistory: new PullHistoryStore(persistence),
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;

      while (cleanupTasks.length > 0) {
        const cleanup = cleanupTasks.pop();
        try {
          cleanup?.();
        } catch (error) {
          console.warn('Failed to dispose domain store resource', error);
        }
      }

      legacyInventories = undefined;
    }
  };

  const snapshot = hydrateStores(stores, () => persistence.loadSnapshot());

  legacyInventories = snapshot?.userInventories;

  const unsubscribeUserInventories = stores.userInventories.subscribe((nextState) => {
    if (!nextState && legacyInventories) {
      legacyInventories = undefined;
    }
  });
  cleanupTasks.push(unsubscribeUserInventories);

  if (typeof window !== 'undefined') {
    const refreshLegacyInventories = () => {
      try {
        const latestSnapshot = persistence.loadSnapshot();
        legacyInventories = latestSnapshot.userInventories;
      } catch (error) {
        console.warn('Failed to refresh legacy inventories from persistence snapshot', error);
        legacyInventories = undefined;
      }
    };

    window.addEventListener('storage', refreshLegacyInventories);
    window.addEventListener(GACHA_STORAGE_UPDATED_EVENT, refreshLegacyInventories);
    cleanupTasks.push(() => {
      window.removeEventListener('storage', refreshLegacyInventories);
      window.removeEventListener(GACHA_STORAGE_UPDATED_EVENT, refreshLegacyInventories);
    });
  }

  const runProjection = () => {
    const { state } = projectInventories({
      pullHistory: stores.pullHistory.getState(),
      catalogState: stores.catalog.getState(),
      legacyInventories
    });

    stores.userInventories.applyProjectionResult(state);
    stores.userInventories.saveDebounced();
  };

  runProjection();

  let skipInitialPullHistory = true;
  const unsubscribePullHistory = stores.pullHistory.subscribe(() => {
    if (skipInitialPullHistory) {
      skipInitialPullHistory = false;
      return;
    }
    runProjection();
  });
  cleanupTasks.push(unsubscribePullHistory);

  let skipInitialCatalog = true;
  const unsubscribeCatalog = stores.catalog.subscribe(() => {
    if (skipInitialCatalog) {
      skipInitialCatalog = false;
      return;
    }
    runProjection();
  });
  cleanupTasks.push(unsubscribeCatalog);

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
