import JSZip from 'jszip';

import {
  type AppPersistence,
  type GachaAppStateV3,
  type GachaCatalogStateV3,
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
import { exportAllAssets, importAssets, type StoredAssetRecord } from '@domain/assets/assetStorage';
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

interface BackupAssetMetadata extends Omit<StoredAssetRecord, 'blob'> {
  path: string;
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
  skippedGacha: Array<{ id: string; name?: string }>;
}

export interface BackupImportResult {
  importedGachaIds: string[];
  importedGachaNames: string[];
  skippedGacha: Array<{ id: string; name?: string }>;
  importedAssetCount: number;
}

function ensureBrowserEnvironment(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('バックアップ機能はブラウザ環境でのみ利用できます');
  }
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
        if (item?.imageAssetId) {
          // Track via item map; actual asset import is resolved separately
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
  base: GachaCatalogStateV3 | undefined,
  addition: GachaCatalogStateV3 | undefined,
  gachaIds: Set<string>,
  now: string
): GachaCatalogStateV3 | undefined {
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
    version: resolveVersion(base?.version, addition.version, 3),
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
    const catalogSnapshot = addition.catalogState?.byGacha?.[gachaId];
    if (!catalogSnapshot?.items) {
      return;
    }
    Object.values(catalogSnapshot.items).forEach((item) => {
      if (item?.imageAssetId) {
        assetIds.add(item.imageAssetId);
      }
    });
  });
  return assetIds;
}

export async function exportBackupToDevice(persistence: AppPersistence): Promise<void> {
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
    const { blob: _blob, ...metadata } = asset;
    assetMetadata.push({ ...metadata, path });
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
  { persistence, stores }: { persistence: AppPersistence; stores: DomainStores }
): Promise<BackupImportResult> {
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

  const baseSnapshot = persistence.loadSnapshot();
  const { snapshot: mergedSnapshot, context, skipped } = mergeSnapshots(baseSnapshot, metadata.snapshot);

  const importedGachaIds = Array.from(context.gachaIds);
  if (importedGachaIds.length === 0) {
    return {
      importedGachaIds: [],
      importedGachaNames: [],
      skippedGacha: skipped,
      importedAssetCount: 0
    };
  }

  const assetIdsToImport = collectAssetIdsToImport(metadata.snapshot, context.gachaIds);
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
    assetRecords.push({ ...assetMeta, blob });
  }

  await importAssets(assetRecords);

  persistence.saveSnapshot(mergedSnapshot);

  stores.appState.hydrate(mergedSnapshot.appState);
  stores.catalog.hydrate(mergedSnapshot.catalogState);
  stores.rarities.hydrate(mergedSnapshot.rarityState);
  stores.userProfiles.hydrate(mergedSnapshot.userProfiles);
  stores.riagu.hydrate(mergedSnapshot.riaguState);
  stores.ptControls.hydrate(mergedSnapshot.ptSettings);
  stores.uiPreferences.hydrate(mergedSnapshot.uiPreferences);
  stores.pullHistory.hydrate(mergedSnapshot.pullHistory);
  stores.userInventories.hydrate(mergedSnapshot.userInventories);

  const projection = projectInventories({
    pullHistory: mergedSnapshot.pullHistory,
    catalogState: mergedSnapshot.catalogState,
    legacyInventories: mergedSnapshot.userInventories
  });
  stores.userInventories.applyProjectionResult(projection.state, { emit: true, persist: 'debounced' });

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
