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

let domainStoreInstanceCounter = 0;

export function createDomainStores(persistence: AppPersistence): DomainStores {
  const cleanupTasks: Array<() => void> = [];
  let disposed = false;
  let legacyInventories: GachaLocalStorageSnapshot['userInventories'] | undefined;
  const domainStoreInstanceId = `domain-stores:${++domainStoreInstanceCounter}`;

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

  console.info('【デバッグ】domain-storesを初期化しました', {
    インスタンスID: domainStoreInstanceId,
    pullHistoryStoreHydrated: stores.pullHistory.isHydrated() ? '済' : '未',
    userInventoryStoreHydrated: stores.userInventories.isHydrated() ? '済' : '未'
  });

  legacyInventories = snapshot?.userInventories;

  const unsubscribeUserInventories = stores.userInventories.subscribe((nextState) => {
    const snapshotExists = Boolean(nextState);
    console.info('【デバッグ】user-inventory購読通知を受信しました', {
      スナップショット有無: snapshotExists ? 'あり' : 'なし',
      永続化済みレガシー在庫有無: legacyInventories ? 'あり' : 'なし'
    });

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
        console.info('【デバッグ】legacy-user-inventoriesを再読込しました', {
          レガシー在庫ユーザー数: legacyInventories?.inventories
            ? Object.keys(legacyInventories.inventories).length
            : 0
        });
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

  const runProjection = (reason: string) => {
    const startedAt = Date.now();
    const pullHistoryState = stores.pullHistory.getState();
    const pullEntryCount = pullHistoryState?.order?.length ?? 0;

    const { state, diagnostics } = projectInventories({
      pullHistory: pullHistoryState,
      catalogState: stores.catalog.getState(),
      legacyInventories
    });

    const durationMs = Date.now() - startedAt;

    console.info('【デバッグ】inventoryProjectionを実行しました', {
      実行理由: reason,
      プル履歴件数: pullEntryCount,
      プロジェクション対象ユーザー数: diagnostics.projectedUsers,
      プロジェクション生成在庫数: diagnostics.projectedInventories,
      処理時間ミリ秒: durationMs,
      警告件数: diagnostics.warnings.length
    });

    stores.userInventories.applyProjectionResult(state);
    stores.userInventories.saveDebounced();
  };

  console.info('【デバッグ】inventoryProjectionの実行を要求しました', {
    インスタンスID: domainStoreInstanceId,
    実行理由: 'initial-hydration'
  });
  runProjection('initial-hydration');

  let skipInitialPullHistory = true;
  const unsubscribePullHistory = stores.pullHistory.subscribe((nextState) => {
    console.info('【デバッグ】pull-history購読通知を受信しました(詳細)', {
      インスタンスID: domainStoreInstanceId,
      初期通知か: skipInitialPullHistory ? 'はい' : 'いいえ',
      スナップショット有無: nextState ? 'あり' : 'なし',
      プル履歴件数: nextState?.order?.length ?? 0,
      更新日時: nextState?.updatedAt ?? '未設定'
    });
    if (skipInitialPullHistory) {
      skipInitialPullHistory = false;
      console.info('【デバッグ】pull-history購読通知(初期化)を受信しました', {
        インスタンスID: domainStoreInstanceId
      });
      return;
    }
    console.info('【デバッグ】pull-history購読通知を受信しました', {
      インスタンスID: domainStoreInstanceId
    });
    console.info('【デバッグ】inventoryProjectionの実行を要求しました', {
      インスタンスID: domainStoreInstanceId,
      実行理由: 'pull-history:update'
    });
    runProjection('pull-history:update');
  });
  cleanupTasks.push(unsubscribePullHistory);

  let skipInitialCatalog = true;
  const unsubscribeCatalog = stores.catalog.subscribe((nextState) => {
    console.info('【デバッグ】catalog購読通知を受信しました(詳細)', {
      インスタンスID: domainStoreInstanceId,
      初期通知か: skipInitialCatalog ? 'はい' : 'いいえ',
      スナップショット有無: nextState ? 'あり' : 'なし',
      ガチャ数: nextState?.order?.length ?? 0,
      更新日時: nextState?.updatedAt ?? '未設定'
    });
    if (skipInitialCatalog) {
      skipInitialCatalog = false;
      console.info('【デバッグ】catalog購読通知(初期化)を受信しました', {
        インスタンスID: domainStoreInstanceId
      });
      return;
    }
    console.info('【デバッグ】catalog購読通知を受信しました', {
      インスタンスID: domainStoreInstanceId
    });
    console.info('【デバッグ】inventoryProjectionの実行を要求しました', {
      インスタンスID: domainStoreInstanceId,
      実行理由: 'catalog:update'
    });
    runProjection('catalog:update');
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
