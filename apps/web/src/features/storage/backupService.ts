import JSZip from 'jszip';

import {
  type AppPersistence,
  type GachaAppStateV3,
  type GachaCatalogStateV4,
  type GachaLocalStorageSnapshot,
  type GachaRarityStateV3,
  type HitCountsStateV3,
  type PtSettingsStateV3,
  type PullHistoryStateV1,
  type RiaguStateV3,
  type SaveOptionsSnapshotV3,
  type UserInventoriesStateV3,
  type UserProfilesStateV3
} from '@domain/app-persistence';
import { deleteAllAssets, exportAllAssets, importAssets, type StoredAssetRecord } from '@domain/assets/assetStorage';
import { projectInventories } from '@domain/inventoryProjection';
import { type DomainStores } from '@domain/stores/createDomainStores';

const BACKUP_VERSION = 1;
const METADATA_FILENAME = 'metadata.json';
const ASSETS_DIRECTORY = 'assets';

function formatBackupTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

interface BackupAssetMetadata {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  path: string;
  previewId?: string | null;
  previewPath?: string | null;
  previewType?: string | null;
  previewSize?: number | null;
  /**
   * @deprecated v1 バックアップでは previewBlob を JSON 化できず空オブジェクトになるため互換目的で残す
   */
  previewBlob?: unknown;
}

interface BackupFileMetadata {
  version: number;
  savedAt: string;
  snapshot: GachaLocalStorageSnapshot;
  assets?: BackupAssetMetadata[];
}

interface ImportContext {
  gachaIds: Set<string>;
  itemIds: Set<string>;
  rarityIds: Set<string>;
  userIds: Set<string>;
}

interface MergeResult {
  snapshot: GachaLocalStorageSnapshot;
  context: ImportContext;
  skipped: Array<{ id: string; name?: string }>;
}

export interface BackupImportResult {
  importedGachaIds: string[];
  importedGachaNames: string[];
  skippedGacha: Array<{ id: string; name?: string }>;
  importedAssetCount: number;
}

export interface BackupDuplicateEntry {
  id: string;
  existingName?: string;
  incomingName?: string;
}

export type BackupDuplicateResolution = 'overwrite' | 'skip';

export interface BackupImportOptions {
  persistence: AppPersistence;
  stores: DomainStores;
  resolveDuplicate?:
    | ((entry: BackupDuplicateEntry) => BackupDuplicateResolution | void)
    | ((entry: BackupDuplicateEntry) => Promise<BackupDuplicateResolution | void>);
}

export interface BackupOverwriteOptions {
  persistence: AppPersistence;
  stores: DomainStores;
}

function ensureBrowserEnvironment(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('バックアップ機能はブラウザ環境でのみ利用できます');
  }
}

function hydrateStores(stores: DomainStores, snapshot: GachaLocalStorageSnapshot): void {
  stores.appState.hydrate(snapshot.appState);
  stores.catalog.hydrate(snapshot.catalogState);
  stores.rarities.hydrate(snapshot.rarityState);
  stores.userProfiles.hydrate(snapshot.userProfiles);
  stores.riagu.hydrate(snapshot.riaguState);
  stores.ptControls.hydrate(snapshot.ptSettings);
  stores.uiPreferences.hydrate(snapshot.uiPreferences);
  stores.pullHistory.hydrate(snapshot.pullHistory);
  stores.userInventories.hydrate(snapshot.userInventories);

  const projection = projectInventories({
    pullHistory: snapshot.pullHistory,
    catalogState: snapshot.catalogState,
    previousState: snapshot.userInventories
  });
  stores.userInventories.applyProjectionResult(projection.state, { emit: true, persist: 'debounced' });
}

async function loadBackupFromFile(
  file: File
): Promise<{ zip: JSZip; metadata: BackupFileMetadata; normalizedSnapshot: GachaLocalStorageSnapshot }> {
  ensureBrowserEnvironment();

  const zip = await JSZip.loadAsync(file);
  const metadataEntry = zip.file(METADATA_FILENAME);
  if (!metadataEntry) {
    throw new Error('バックアップのメタデータが見つかりませんでした');
  }

  const metadataRaw = await metadataEntry.async('string');
  const metadata = JSON.parse(metadataRaw) as BackupFileMetadata;

  if (!metadata.snapshot) {
    throw new Error('バックアップに有効なスナップショットが含まれていません');
  }

  if (metadata.version !== BACKUP_VERSION) {
    throw new Error('このバックアップ形式には対応していません');
  }

  const normalizedSnapshot: GachaLocalStorageSnapshot = {
    ...metadata.snapshot,
    catalogState: normalizeCatalogStateSnapshot(metadata.snapshot.catalogState)
  };

  return { zip, metadata, normalizedSnapshot };
}

async function extractAssetRecordsFromBackupZip(
  zip: JSZip,
  metadata: BackupFileMetadata,
  assetIdsToImport: Set<string>
): Promise<StoredAssetRecord[]> {
  const assetRecords: StoredAssetRecord[] = [];
  const assetEntries = metadata.assets ?? [];

  for (const assetMeta of assetEntries) {
    if (!assetMeta?.id || !assetIdsToImport.has(assetMeta.id)) {
      continue;
    }

    const path = assetMeta.path ?? `${ASSETS_DIRECTORY}/${assetMeta.id}`;
    const assetFile = zip.file(path);
    if (!assetFile) {
      console.warn(`バックアップ内のアセット ${assetMeta.id} が見つかりませんでした`);
      continue;
    }

    const blob = await assetFile.async('blob');

    let previewBlob: Blob | null = null;
    const previewPath = assetMeta.previewPath ?? null;
    const previewType = assetMeta.previewType ?? null;

    if (previewPath) {
      const previewEntry = zip.file(previewPath);
      if (!previewEntry) {
        console.warn(`バックアップ内のプレビュー ${previewPath} が見つかりませんでした`);
      } else {
        const previewBuffer = await previewEntry.async('arraybuffer');
        const blobOptions: BlobPropertyBag = previewType ? { type: previewType } : {};
        previewBlob = new Blob([previewBuffer], blobOptions);
      }
    } else if (assetMeta.previewBlob instanceof Blob) {
      // 互換性確保: v1 バックアップで previewBlob が含まれていた場合のみ利用
      previewBlob = assetMeta.previewBlob;
    }

    const resolvedPreviewType = previewType ?? (previewBlob?.type ?? null);
    const resolvedPreviewSize =
      typeof assetMeta.previewSize === 'number' && Number.isFinite(assetMeta.previewSize)
        ? Number(assetMeta.previewSize)
        : previewBlob instanceof Blob
          ? previewBlob.size
          : null;

    assetRecords.push({
      id: assetMeta.id,
      name: assetMeta.name,
      type: assetMeta.type,
      size: assetMeta.size,
      createdAt: assetMeta.createdAt,
      updatedAt: assetMeta.updatedAt,
      previewId: assetMeta.previewId ?? null,
      previewType: resolvedPreviewType,
      previewSize: resolvedPreviewSize,
      previewBlob,
      blob
    });
  }

  return assetRecords;
}

function resolveVersion(...versions: Array<number | undefined>): number {
  let result = 0;
  versions.forEach((value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      result = Math.max(result, value);
    }
  });
  return result > 0 ? result : 1;
}

function dedupeOrder(base: string[] | undefined, additions: string[]): string[] {
  const nextOrder: string[] = Array.isArray(base) ? [...base] : [];
  const seen = new Set(nextOrder);

  additions.forEach((id) => {
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    nextOrder.push(id);
  });

  return nextOrder;
}

function cloneSnapshot<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }
  const globalClone = (globalThis as { structuredClone?: <U>(input: U) => U }).structuredClone;
  if (typeof globalClone === 'function') {
    return globalClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function pruneSnapshotForOverwrite(
  base: GachaLocalStorageSnapshot,
  overwriteIds: Set<string>
): GachaLocalStorageSnapshot {
  if (!base || overwriteIds.size === 0) {
    return base;
  }

  const snapshot = cloneSnapshot(base);
  const itemIdsByGacha = new Map<string, Set<string>>();

  overwriteIds.forEach((gachaId) => {
    const itemIds = new Set<string>();
    const baseCatalog = base.catalogState?.byGacha?.[gachaId];
    if (baseCatalog?.items) {
      Object.values(baseCatalog.items).forEach((item) => {
        if (item?.itemId) {
          itemIds.add(item.itemId);
        }
      });
    }
    itemIdsByGacha.set(gachaId, itemIds);

    const rarityIds = new Set<string>();
    const baseRarities = base.rarityState?.byGacha?.[gachaId];
    baseRarities?.forEach((rarityId) => {
      if (rarityId) {
        rarityIds.add(rarityId);
      }
    });

    if (snapshot.appState?.meta) {
      delete snapshot.appState.meta[gachaId];
      if (Array.isArray(snapshot.appState.order)) {
        snapshot.appState.order = snapshot.appState.order.filter((id) => id !== gachaId);
      }
      if (snapshot.appState.selectedGachaId === gachaId) {
        snapshot.appState.selectedGachaId = snapshot.appState.order?.[0] ?? null;
      }
    }

    if (snapshot.catalogState?.byGacha) {
      delete snapshot.catalogState.byGacha[gachaId];
    }

    if (snapshot.rarityState?.byGacha) {
      delete snapshot.rarityState.byGacha[gachaId];
    }
    if (snapshot.rarityState?.entities) {
      rarityIds.forEach((rarityId) => {
        delete snapshot.rarityState!.entities[rarityId];
      });
    }
    if (snapshot.rarityState?.indexByName) {
      delete snapshot.rarityState.indexByName[gachaId];
    }

    if (snapshot.ptSettings?.byGachaId) {
      delete snapshot.ptSettings.byGachaId[gachaId];
    }

    if (snapshot.userInventories?.inventories) {
      Object.values(snapshot.userInventories.inventories).forEach((record) => {
        if (!record) {
          return;
        }
        if (Object.prototype.hasOwnProperty.call(record, gachaId)) {
          delete record[gachaId];
        }
      });
    }

    if (snapshot.pullHistory?.pulls) {
      Object.entries(snapshot.pullHistory.pulls).forEach(([pullId, entry]) => {
        if (entry?.gachaId === gachaId) {
          delete snapshot.pullHistory!.pulls[pullId];
        }
      });
      if (Array.isArray(snapshot.pullHistory?.order)) {
        snapshot.pullHistory.order = snapshot.pullHistory.order.filter((pullId) => {
          const entry = snapshot.pullHistory!.pulls[pullId];
          return Boolean(entry);
        });
      }
    }
  });

  overwriteIds.forEach((gachaId) => {
    const itemIds = itemIdsByGacha.get(gachaId);
    if (itemIds && snapshot.userInventories?.byItemId) {
      const byItemId = snapshot.userInventories.byItemId;
      itemIds.forEach((itemId) => {
        const entries = byItemId[itemId];
        if (!entries) {
          return;
        }
        const filtered = entries.filter((entry) => entry?.gachaId !== gachaId);
        if (filtered.length > 0) {
          byItemId[itemId] = filtered;
        } else {
          delete byItemId[itemId];
        }
      });
    }

    if (itemIds && snapshot.hitCounts?.byItemId) {
      const hitCountsByItemId = snapshot.hitCounts.byItemId;
      itemIds.forEach((itemId) => {
        if (Object.prototype.hasOwnProperty.call(hitCountsByItemId, itemId)) {
          delete hitCountsByItemId[itemId];
        }
      });
    }

    if (itemIds && snapshot.riaguState) {
      if (snapshot.riaguState.riaguCards) {
        const riaguCards = snapshot.riaguState.riaguCards;
        Object.entries(riaguCards).forEach(([cardId, card]) => {
          if (!card) {
            return;
          }
          if (card.gachaId === gachaId || (card.itemId && itemIds.has(card.itemId))) {
            delete riaguCards[cardId];
          }
        });
      }
      if (snapshot.riaguState.indexByItemId) {
        const indexByItemId = snapshot.riaguState.indexByItemId;
        itemIds.forEach((itemId) => {
          if (Object.prototype.hasOwnProperty.call(indexByItemId, itemId)) {
            delete indexByItemId[itemId];
          }
        });
      }
    }
  });

  return snapshot;
}

function determineImportContext(
  base: GachaLocalStorageSnapshot,
  addition: GachaLocalStorageSnapshot
): { context: ImportContext; skipped: Array<{ id: string; name?: string }> } {
  const baseMeta = base.appState?.meta ?? {};
  const additionMeta = addition.appState?.meta ?? {};
  const gachaIds = new Set<string>();
  const skipped: Array<{ id: string; name?: string }> = [];

  Object.entries(additionMeta).forEach(([gachaId, meta]) => {
    if (!gachaId) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(baseMeta, gachaId)) {
      skipped.push({ id: gachaId, name: meta?.displayName });
      return;
    }
    gachaIds.add(gachaId);
  });

  const itemIds = new Set<string>();
  const rarityIds = new Set<string>();
  const userIds = new Set<string>();

  gachaIds.forEach((gachaId) => {
    const catalogSnapshot = addition.catalogState?.byGacha?.[gachaId];
    if (catalogSnapshot?.items) {
      Object.values(catalogSnapshot.items).forEach((item) => {
        if (item?.itemId) {
          itemIds.add(item.itemId);
        }
        if (item?.rarityId) {
          rarityIds.add(item.rarityId);
        }
      });
    }

    const rarityList = addition.rarityState?.byGacha?.[gachaId];
    rarityList?.forEach((rarityId) => {
      if (rarityId) {
        rarityIds.add(rarityId);
      }
    });
  });

  const inventoriesByUser = addition.userInventories?.inventories ?? {};
  Object.entries(inventoriesByUser).forEach(([userId, record]) => {
    if (!userId || !record) {
      return;
    }
    const hasTargetGacha = Object.keys(record).some((gachaId) => gachaIds.has(gachaId));
    if (hasTargetGacha) {
      userIds.add(userId);
    }
  });

  const pulls = addition.pullHistory?.pulls ?? {};
  Object.values(pulls).forEach((entry) => {
    if (!entry) {
      return;
    }
    if (entry.userId && gachaIds.has(entry.gachaId)) {
      userIds.add(entry.userId);
    }
  });

  return {
    context: {
      gachaIds,
      itemIds,
      rarityIds,
      userIds
    },
    skipped
  };
}

function normalizeCatalogStateSnapshot(
  state: GachaLocalStorageSnapshot['catalogState']
): GachaCatalogStateV4 | undefined {
  if (!state?.byGacha) {
    return state;
  }

  let touched = false;
  const nextByGacha = { ...state.byGacha };

  Object.entries(state.byGacha).forEach(([gachaId, snapshot]) => {
    if (!snapshot?.items) {
      return;
    }

    let itemsTouched = false;
    const nextItems = { ...snapshot.items };

    Object.entries(snapshot.items).forEach(([itemId, item]) => {
      if (!itemId || !item) {
        return;
      }

      if (Array.isArray(item.assets) && item.assets.length > 0) {
        return;
      }

      const legacyAssetId = (item as { imageAssetId?: unknown }).imageAssetId;
      if (typeof legacyAssetId !== 'string' || legacyAssetId.length === 0) {
        return;
      }

      const legacyThumbnailId = (item as { thumbnailAssetId?: unknown }).thumbnailAssetId;
      const thumbnailAssetId = typeof legacyThumbnailId === 'string' ? legacyThumbnailId : null;

      const { imageAssetId: _imageAssetId, thumbnailAssetId: _thumbnailAssetId, ...rest } = item as GachaCatalogStateV4['byGacha'][string]['items'][string] & {
        imageAssetId?: unknown;
        thumbnailAssetId?: unknown;
      };

      nextItems[itemId] = {
        ...rest,
        assets: [{ assetId: legacyAssetId, thumbnailAssetId }]
      };
      itemsTouched = true;
    });

    if (itemsTouched) {
      nextByGacha[gachaId] = {
        ...snapshot,
        items: nextItems
      };
      touched = true;
    }
  });

  if (!touched) {
    return state;
  }

  return {
    ...state,
    version: typeof state.version === 'number' ? Math.max(state.version, 4) : 4,
    byGacha: nextByGacha
  };
}

function mergeAppState(
  base: GachaAppStateV3 | undefined,
  addition: GachaAppStateV3 | undefined,
  gachaIds: Set<string>,
  now: string
): GachaAppStateV3 | undefined {
  if (!addition || gachaIds.size === 0) {
    return base;
  }

  const nextMeta = { ...(base?.meta ?? {}) };
  const nextOrderBase = Array.isArray(base?.order) ? base?.order : [];
  const additions: string[] = [];

  addition.order?.forEach((gachaId) => {
    if (gachaIds.has(gachaId)) {
      additions.push(gachaId);
    }
  });

  gachaIds.forEach((gachaId) => {
    if (!addition.meta?.[gachaId]) {
      return;
    }
    nextMeta[gachaId] = addition.meta[gachaId];
    if (!addition.order?.includes(gachaId)) {
      additions.push(gachaId);
    }
  });

  if (Object.keys(nextMeta).length === (base?.meta ? Object.keys(base.meta).length : 0)) {
    return base;
  }

  const nextOrder = dedupeOrder(nextOrderBase, additions);
  const selected = base?.selectedGachaId ?? (addition.selectedGachaId && gachaIds.has(addition.selectedGachaId)
    ? addition.selectedGachaId
    : base?.selectedGachaId ?? nextOrder[0] ?? null);

  return {
    version: resolveVersion(base?.version, addition.version, 3),
    updatedAt: now,
    meta: nextMeta,
    order: nextOrder,
    selectedGachaId: selected ?? null
  };
}

function mergeCatalogState(
  base: GachaCatalogStateV4 | undefined,
  addition: GachaCatalogStateV4 | undefined,
  gachaIds: Set<string>,
  now: string
): GachaCatalogStateV4 | undefined {
  if (!addition || gachaIds.size === 0) {
    return base;
  }

  const nextByGacha = { ...(base?.byGacha ?? {}) };
  let touched = false;

  gachaIds.forEach((gachaId) => {
    const snapshot = addition.byGacha?.[gachaId];
    if (!snapshot) {
      return;
    }
    nextByGacha[gachaId] = snapshot;
    touched = true;
  });

  if (!touched) {
    return base;
  }

  return {
    version: resolveVersion(base?.version, addition.version, 4),
    updatedAt: now,
    byGacha: nextByGacha
  };
}

function mergeRarityState(
  base: GachaRarityStateV3 | undefined,
  addition: GachaRarityStateV3 | undefined,
  gachaIds: Set<string>,
  now: string
): GachaRarityStateV3 | undefined {
  if (!addition || gachaIds.size === 0) {
    return base;
  }

  const nextByGacha = { ...(base?.byGacha ?? {}) };
  const nextEntities = { ...(base?.entities ?? {}) };
  let nextIndexByName = base?.indexByName ? { ...base.indexByName } : undefined;
  let touched = false;

  gachaIds.forEach((gachaId) => {
    const rarityIds = addition.byGacha?.[gachaId];
    if (!rarityIds) {
      return;
    }
    nextByGacha[gachaId] = rarityIds;
    rarityIds.forEach((rarityId) => {
      const entity = addition.entities?.[rarityId];
      if (entity) {
        nextEntities[rarityId] = entity;
      }
    });
    if (addition.indexByName?.[gachaId]) {
      if (!nextIndexByName) {
        nextIndexByName = {};
      }
      nextIndexByName[gachaId] = addition.indexByName[gachaId];
    }
    touched = true;
  });

  if (!touched) {
    return base;
  }

  return {
    version: resolveVersion(base?.version, addition.version, 3),
    updatedAt: now,
    byGacha: nextByGacha,
    entities: nextEntities,
    ...(nextIndexByName ? { indexByName: nextIndexByName } : {})
  };
}

function mergeUserProfiles(
  base: UserProfilesStateV3 | undefined,
  addition: UserProfilesStateV3 | undefined,
  userIds: Set<string>,
  now: string
): UserProfilesStateV3 | undefined {
  if (!addition || userIds.size === 0) {
    return base;
  }

  const nextUsers = { ...(base?.users ?? {}) };
  let touched = false;

  userIds.forEach((userId) => {
    if (!userId) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(nextUsers, userId)) {
      return;
    }
    const user = addition.users?.[userId];
    if (!user) {
      return;
    }
    nextUsers[userId] = user;
    touched = true;
  });

  if (!touched) {
    return base;
  }

  return {
    version: resolveVersion(base?.version, addition.version, 3),
    updatedAt: now,
    users: nextUsers
  };
}

function mergeUserInventories(
  base: UserInventoriesStateV3 | undefined,
  addition: UserInventoriesStateV3 | undefined,
  gachaIds: Set<string>,
  itemIds: Set<string>,
  now: string
): UserInventoriesStateV3 | undefined {
  if (!addition || gachaIds.size === 0) {
    return base;
  }

  const nextInventories: UserInventoriesStateV3['inventories'] = { ...(base?.inventories ?? {}) };
  const nextByItemId: UserInventoriesStateV3['byItemId'] = { ...(base?.byItemId ?? {}) };
  let touched = false;

  Object.entries(addition.inventories ?? {}).forEach(([userId, gachaMap]) => {
    if (!userId || !gachaMap) {
      return;
    }
    const current = { ...(nextInventories[userId] ?? {}) };
    let userTouched = false;

    Object.entries(gachaMap).forEach(([gachaId, snapshot]) => {
      if (!gachaIds.has(gachaId) || !snapshot) {
        return;
      }
      if (Object.prototype.hasOwnProperty.call(current, gachaId)) {
        return;
      }
      current[gachaId] = snapshot;
      userTouched = true;
    });

    if (userTouched) {
      nextInventories[userId] = current;
      touched = true;
    }
  });

  Object.entries(addition.byItemId ?? {}).forEach(([itemId, entries]) => {
    if (!itemId || !Array.isArray(entries) || !itemIds.has(itemId)) {
      return;
    }
    const existing = nextByItemId[itemId] ?? [];
    const appended = entries.filter((entry) => entry && gachaIds.has(entry.gachaId));
    if (appended.length === 0) {
      return;
    }
    nextByItemId[itemId] = [...existing, ...appended];
    touched = true;
  });

  if (!touched) {
    return base;
  }

  return {
    version: resolveVersion(base?.version, addition.version, 3),
    updatedAt: now,
    inventories: nextInventories,
    byItemId: nextByItemId
  };
}

function mergeHitCounts(
  base: HitCountsStateV3 | undefined,
  addition: HitCountsStateV3 | undefined,
  itemIds: Set<string>,
  now: string
): HitCountsStateV3 | undefined {
  if (!addition || itemIds.size === 0) {
    return base;
  }

  const nextByItemId = { ...(base?.byItemId ?? {}) };
  let touched = false;

  Object.entries(addition.byItemId ?? {}).forEach(([itemId, count]) => {
    if (!itemIds.has(itemId)) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(nextByItemId, itemId)) {
      return;
    }
    nextByItemId[itemId] = count;
    touched = true;
  });

  if (!touched) {
    return base;
  }

  return {
    version: resolveVersion(base?.version, addition.version, 3),
    updatedAt: now,
    byItemId: nextByItemId
  };
}

function mergeRiaguState(
  base: RiaguStateV3 | undefined,
  addition: RiaguStateV3 | undefined,
  gachaIds: Set<string>,
  itemIds: Set<string>,
  now: string
): RiaguStateV3 | undefined {
  if (!addition) {
    return base;
  }

  const nextCards = { ...(base?.riaguCards ?? {}) };
  const nextIndex = { ...(base?.indexByItemId ?? {}) };
  let touched = false;

  Object.entries(addition.riaguCards ?? {}).forEach(([cardId, card]) => {
    if (!card) {
      return;
    }
    if (!gachaIds.has(card.gachaId) && !itemIds.has(card.itemId)) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(nextCards, cardId)) {
      return;
    }
    nextCards[cardId] = card;
    touched = true;
  });

  Object.entries(addition.indexByItemId ?? {}).forEach(([itemId, cardId]) => {
    if (!itemIds.has(itemId) || Object.prototype.hasOwnProperty.call(nextIndex, itemId)) {
      return;
    }
    nextIndex[itemId] = cardId;
    touched = true;
  });

  if (!touched) {
    return base;
  }

  return {
    version: resolveVersion(base?.version, addition.version, 3),
    updatedAt: now,
    riaguCards: nextCards,
    indexByItemId: nextIndex
  };
}

function mergePtSettings(
  base: PtSettingsStateV3 | undefined,
  addition: PtSettingsStateV3 | undefined,
  gachaIds: Set<string>,
  now: string
): PtSettingsStateV3 | undefined {
  if (!addition || gachaIds.size === 0) {
    return base;
  }

  const nextByGachaId = { ...(base?.byGachaId ?? {}) };
  let touched = false;

  gachaIds.forEach((gachaId) => {
    if (Object.prototype.hasOwnProperty.call(nextByGachaId, gachaId)) {
      return;
    }
    const setting = addition.byGachaId?.[gachaId];
    if (!setting) {
      return;
    }
    nextByGachaId[gachaId] = setting;
    touched = true;
  });

  if (!touched) {
    return base;
  }

  return {
    version: resolveVersion(base?.version, addition.version, 3),
    updatedAt: now,
    byGachaId: nextByGachaId
  };
}

function mergePullHistory(
  base: PullHistoryStateV1 | undefined,
  addition: PullHistoryStateV1 | undefined,
  gachaIds: Set<string>,
  now: string
): PullHistoryStateV1 | undefined {
  if (!addition || gachaIds.size === 0) {
    return base;
  }

  const nextPulls = { ...(base?.pulls ?? {}) };
  const orderAdditions: string[] = [];
  let touched = false;

  Object.entries(addition.pulls ?? {}).forEach(([pullId, pull]) => {
    if (!pull || !gachaIds.has(pull.gachaId)) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(nextPulls, pullId)) {
      return;
    }
    nextPulls[pullId] = pull;
    touched = true;
  });

  addition.order?.forEach((pullId) => {
    const pull = addition.pulls?.[pullId];
    if (!pull || !gachaIds.has(pull.gachaId)) {
      return;
    }
    orderAdditions.push(pullId);
  });

  if (!touched) {
    return base;
  }

  const nextOrder = dedupeOrder(base?.order, orderAdditions);

  return {
    version: resolveVersion(base?.version, addition.version, 1),
    updatedAt: now,
    order: nextOrder,
    pulls: nextPulls
  };
}

function mergeSaveOptions(
  base: Record<string, SaveOptionsSnapshotV3> | undefined,
  addition: Record<string, SaveOptionsSnapshotV3> | undefined,
  userIds: Set<string>
): Record<string, SaveOptionsSnapshotV3> | undefined {
  const next: Record<string, SaveOptionsSnapshotV3> = { ...(base ?? {}) };
  let touched = false;

  Object.entries(addition ?? {}).forEach(([userId, value]) => {
    if (!userId || !value) {
      return;
    }
    if (!userIds.has(userId)) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(next, userId)) {
      return;
    }
    next[userId] = value;
    touched = true;
  });

  if (!touched) {
    return base;
  }

  return next;
}

function mergeSnapshots(base: GachaLocalStorageSnapshot, addition: GachaLocalStorageSnapshot): MergeResult {
  const { context, skipped } = determineImportContext(base, addition);
  const now = new Date().toISOString();

  const nextSnapshot: GachaLocalStorageSnapshot = {
    appState: mergeAppState(base.appState, addition.appState, context.gachaIds, now),
    catalogState: mergeCatalogState(base.catalogState, addition.catalogState, context.gachaIds, now),
    rarityState: mergeRarityState(base.rarityState, addition.rarityState, context.gachaIds, now),
    userInventories: mergeUserInventories(
      base.userInventories,
      addition.userInventories,
      context.gachaIds,
      context.itemIds,
      now
    ),
    userProfiles: mergeUserProfiles(base.userProfiles, addition.userProfiles, context.userIds, now),
    hitCounts: mergeHitCounts(base.hitCounts, addition.hitCounts, context.itemIds, now),
    riaguState: mergeRiaguState(base.riaguState, addition.riaguState, context.gachaIds, context.itemIds, now),
    ptSettings: mergePtSettings(base.ptSettings, addition.ptSettings, context.gachaIds, now),
    uiPreferences: base.uiPreferences ?? addition.uiPreferences,
    receiveHistory: base.receiveHistory ?? addition.receiveHistory,
    receivePrefs: base.receivePrefs ?? addition.receivePrefs,
    pullHistory: mergePullHistory(base.pullHistory, addition.pullHistory, context.gachaIds, now),
    saveOptions: mergeSaveOptions(base.saveOptions, addition.saveOptions, context.userIds)
  };

  if (!nextSnapshot.appState) {
    nextSnapshot.appState = base.appState ?? addition.appState;
  }
  if (!nextSnapshot.catalogState) {
    nextSnapshot.catalogState = base.catalogState ?? addition.catalogState;
  }
  if (!nextSnapshot.rarityState) {
    nextSnapshot.rarityState = base.rarityState ?? addition.rarityState;
  }
  if (!nextSnapshot.userInventories) {
    nextSnapshot.userInventories = base.userInventories ?? addition.userInventories;
  }
  if (!nextSnapshot.userProfiles) {
    nextSnapshot.userProfiles = base.userProfiles ?? addition.userProfiles;
  }
  if (!nextSnapshot.hitCounts) {
    nextSnapshot.hitCounts = base.hitCounts ?? addition.hitCounts;
  }
  if (!nextSnapshot.riaguState) {
    nextSnapshot.riaguState = base.riaguState ?? addition.riaguState;
  }
  if (!nextSnapshot.ptSettings) {
    nextSnapshot.ptSettings = base.ptSettings ?? addition.ptSettings;
  }
  if (!nextSnapshot.pullHistory) {
    nextSnapshot.pullHistory = base.pullHistory ?? addition.pullHistory;
  }
  if (!nextSnapshot.saveOptions) {
    nextSnapshot.saveOptions = base.saveOptions ?? addition.saveOptions;
  }

  return { snapshot: nextSnapshot, context, skipped };
}

function collectAssetIdsToImport(
  addition: GachaLocalStorageSnapshot,
  gachaIds: Set<string>
): Set<string> {
  const assetIds = new Set<string>();
  gachaIds.forEach((gachaId) => {
    const thumbnailAssetId = addition.appState?.meta?.[gachaId]?.thumbnailAssetId;
    if (typeof thumbnailAssetId === 'string' && thumbnailAssetId.length > 0) {
      assetIds.add(thumbnailAssetId);
    }

    const catalogSnapshot = addition.catalogState?.byGacha?.[gachaId];
    if (!catalogSnapshot?.items) {
      return;
    }
    Object.values(catalogSnapshot.items).forEach((item) => {
      const assets = Array.isArray(item?.assets) ? item.assets : [];
      if (assets.length > 0) {
        assets.forEach((asset) => {
          if (asset?.assetId) {
            assetIds.add(asset.assetId);
          }
        });
        return;
      }

      const legacyAssetId = (item as { imageAssetId?: unknown }).imageAssetId;
      if (typeof legacyAssetId === 'string' && legacyAssetId.length > 0) {
        assetIds.add(legacyAssetId);
      }
    });
  });
  return assetIds;
}

export interface BackupShimmyBuildResult {
  blob: Blob;
  fileName: string;
  savedAt: string;
}

export async function buildBackupShimmyBlob(persistence: AppPersistence): Promise<BackupShimmyBuildResult> {
  ensureBrowserEnvironment();

  const [snapshot, assets] = await Promise.all([Promise.resolve(persistence.loadSnapshot()), exportAllAssets()]);
  const zip = new JSZip();
  const savedAt = new Date().toISOString();

  const assetMetadata: BackupAssetMetadata[] = [];
  assets.forEach((asset) => {
    if (!asset?.id) {
      return;
    }

    const path = `${ASSETS_DIRECTORY}/${asset.id}`;
    zip.file(path, asset.blob, { binary: true, compression: 'STORE' });

    let previewPath: string | null = null;
    let previewType: string | null = null;
    let previewSize: number | null = asset.previewSize ?? null;

    if (asset.previewBlob instanceof Blob) {
      previewType = asset.previewBlob.type || null;
      previewSize = Number.isFinite(asset.previewBlob.size) ? asset.previewBlob.size : previewSize;
      previewPath = `${ASSETS_DIRECTORY}/${asset.id}.preview`;
      zip.file(previewPath, asset.previewBlob, { binary: true, compression: 'STORE' });
    }

    assetMetadata.push({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      size: asset.size,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      path,
      previewId: asset.previewId ?? null,
      previewPath,
      previewType,
      previewSize
    });
  });

  const metadata: BackupFileMetadata = {
    version: BACKUP_VERSION,
    savedAt,
    snapshot,
    assets: assetMetadata
  };

  zip.file(METADATA_FILENAME, JSON.stringify(metadata, null, 2), {
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  const backupTimestamp = formatBackupTimestamp(new Date(savedAt));
  const fileName = `shiyura-gacha-backup-${backupTimestamp}.shimmy`;

  return { blob, fileName, savedAt };
}

export async function exportBackupToDevice(persistence: AppPersistence): Promise<void> {
  const { blob, fileName } = await buildBackupShimmyBlob(persistence);

  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function importBackupFromFile(
  file: File,
  options: BackupImportOptions
): Promise<BackupImportResult> {
  const { persistence, stores, resolveDuplicate } = options;
  const { zip, metadata, normalizedSnapshot } = await loadBackupFromFile(file);
  const baseSnapshot = persistence.loadSnapshot();

  const existingMeta = baseSnapshot.appState?.meta ?? {};
  const importMeta = normalizedSnapshot.appState?.meta ?? {};
  const duplicateEntries: BackupDuplicateEntry[] = [];

  Object.entries(importMeta).forEach(([gachaId, meta]) => {
    if (!gachaId) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(existingMeta, gachaId)) {
      duplicateEntries.push({
        id: gachaId,
        existingName: existingMeta[gachaId]?.displayName,
        incomingName: meta?.displayName
      });
    }
  });

  const overwriteGachaIds = new Set<string>();

  if (duplicateEntries.length > 0) {
    for (const entry of duplicateEntries) {
      let decision: BackupDuplicateResolution | void;

      if (resolveDuplicate) {
        decision = await resolveDuplicate(entry);
      } else if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        const displayName = entry.incomingName ?? entry.existingName ?? entry.id;
        const message =
          `バックアップ内の「${displayName}」は既に登録済みです。` +
          '\n上書きしますか？\n\nOK: 上書きする\nキャンセル: スキップする';
        const shouldOverwrite = window.confirm(message);
        decision = shouldOverwrite ? 'overwrite' : 'skip';
      }

      if (decision === 'overwrite') {
        overwriteGachaIds.add(entry.id);
      }
    }
  }

  const sanitizedBaseSnapshot =
    overwriteGachaIds.size > 0 ? pruneSnapshotForOverwrite(baseSnapshot, overwriteGachaIds) : baseSnapshot;

  const { snapshot: mergedSnapshot, context, skipped } = mergeSnapshots(sanitizedBaseSnapshot, normalizedSnapshot);

  const importedGachaIds = Array.from(context.gachaIds);
  if (importedGachaIds.length === 0) {
    return {
      importedGachaIds: [],
      importedGachaNames: [],
      skippedGacha: skipped,
      importedAssetCount: 0
    };
  }

  const assetIdsToImport = collectAssetIdsToImport(normalizedSnapshot, context.gachaIds);
  const assetRecords = await extractAssetRecordsFromBackupZip(zip, metadata, assetIdsToImport);

  await importAssets(assetRecords);

  persistence.saveSnapshot(mergedSnapshot);
  hydrateStores(stores, mergedSnapshot);

  const importedGachaNames = importedGachaIds
    .map((gachaId) => mergedSnapshot.appState?.meta?.[gachaId]?.displayName)
    .filter((name): name is string => Boolean(name));

  return {
    importedGachaIds,
    importedGachaNames,
    skippedGacha: skipped,
    importedAssetCount: assetRecords.length
  };
}

export async function restoreBackupOverwriteAllFromFile(
  file: File,
  options: BackupOverwriteOptions
): Promise<BackupImportResult> {
  const { persistence, stores } = options;
  const { zip, metadata, normalizedSnapshot } = await loadBackupFromFile(file);

  const importedGachaIds = Object.keys(normalizedSnapshot.appState?.meta ?? {}).filter(Boolean);
  const gachaIdSet = new Set(importedGachaIds);

  const assetIdsToImport = collectAssetIdsToImport(normalizedSnapshot, gachaIdSet);
  const assetRecords = await extractAssetRecordsFromBackupZip(zip, metadata, assetIdsToImport);

  // 上書き復元では既存アセットが孤立するため、全削除してから取り込み直す。
  await deleteAllAssets();
  await importAssets(assetRecords);

  persistence.saveSnapshot(normalizedSnapshot);
  hydrateStores(stores, normalizedSnapshot);

  const importedGachaNames = importedGachaIds
    .map((gachaId) => normalizedSnapshot.appState?.meta?.[gachaId]?.displayName)
    .filter((name): name is string => Boolean(name));

  return {
    importedGachaIds,
    importedGachaNames,
    skippedGacha: [],
    importedAssetCount: assetRecords.length
  };
}
