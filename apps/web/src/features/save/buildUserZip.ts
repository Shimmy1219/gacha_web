import JSZip from 'jszip';

import type {
  GachaCatalogItemV3,
  GachaCatalogStateV3,
  GachaLocalStorageSnapshot,
  GachaRarityStateV3,
  UserInventorySnapshotV3
} from '@domain/app-persistence';
import { loadAsset, type StoredAssetRecord } from '@domain/assets/assetStorage';

import type { SaveTargetSelection, ZipBuildResult } from './types';

interface SelectedAsset {
  assetId: string;
  gachaId: string;
  gachaName: string;
  itemId: string;
  itemName: string;
  rarityId: string;
  count: number;
  isRiagu: boolean;
}

interface ZipItemMetadata {
  filePath: string;
  gachaName: string;
  itemName: string;
  rarity: string;
  isRiagu: boolean;
  riaguType: string | null;
  obtainedCount: number;
  isNewForUser: boolean;
}

interface HistorySelectionMetadata {
  pullId: string;
  pullCount: number;
  executedAt: string | null;
}

interface BuildParams {
  snapshot: GachaLocalStorageSnapshot;
  selection: SaveTargetSelection;
  userId: string;
  userName: string;
}

function ensureBrowserEnvironment(): void {
  if (typeof window === 'undefined') {
    throw new Error('ブラウザ環境でのみ保存処理を実行できます');
  }
}

function sanitizePathComponent(value: string): string {
  const normalized = value.replace(/[\\/:*?"<>|]/g, '_').trim();
  return normalized.length > 0 ? normalized : 'unknown';
}

function formatTimestamp(date: Date): string {
  const pad = (input: number) => input.toString().padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function sanitizeFileName(displayName: string, timestamp: string): string {
  const base = sanitizePathComponent(displayName);
  const fallback = base.length > 0 ? base : 'user';
  return `${fallback}${timestamp}.zip`;
}

function aggregateInventoryItems(
  inventories: Record<string, UserInventorySnapshotV3 | undefined> | undefined,
  catalogState: GachaCatalogStateV3 | undefined,
  appState: GachaLocalStorageSnapshot['appState'] | undefined,
  selection: SaveTargetSelection,
  warnings: Set<string>
): SelectedAsset[] {
  if (!inventories) {
    return [];
  }

  const gachaFilter = selection.mode === 'gacha' ? new Set(selection.gachaIds) : null;
  const selected: SelectedAsset[] = [];
  const seenAssets = new Set<string>();

  Object.values(inventories).forEach((snapshot) => {
    if (!snapshot) {
      return;
    }
    if (gachaFilter && !gachaFilter.has(snapshot.gachaId)) {
      return;
    }

    const catalogGacha = snapshot.gachaId ? catalogState?.byGacha?.[snapshot.gachaId] : undefined;
    const gachaName = snapshot.gachaId
      ? appState?.meta?.[snapshot.gachaId]?.displayName ?? snapshot.gachaId
      : 'unknown-gacha';

    Object.entries(snapshot.items ?? {}).forEach(([rarityId, itemIds]) => {
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return;
      }

      itemIds.forEach((itemId) => {
        if (!itemId) {
          return;
        }

        const catalogItem: GachaCatalogItemV3 | undefined = catalogGacha?.items?.[itemId];
        if (!catalogItem) {
          warnings.add(`カタログ情報が見つかりません: ${snapshot.gachaId ?? 'unknown'} / ${itemId}`);
          return;
        }

        const assetId = catalogItem.imageAssetId;
        if (!assetId) {
          warnings.add(`画像アセットが未設定: ${snapshot.gachaId ?? 'unknown'} / ${catalogItem.name ?? itemId}`);
          return;
        }

        if (seenAssets.has(assetId)) {
          return;
        }

        seenAssets.add(assetId);
        const count = snapshot.counts?.[rarityId]?.[itemId];
        const obtainedCount = typeof count === 'number' && count > 0 ? count : 1;
        selected.push({
          assetId,
          gachaId: snapshot.gachaId,
          gachaName,
          itemId,
          itemName: catalogItem.name ?? itemId,
          rarityId: catalogItem.rarityId ?? rarityId,
          count: obtainedCount,
          isRiagu: Boolean(catalogItem.riagu)
        });
      });
    });
  });

  return selected;
}

function aggregateHistoryItems(
  snapshot: GachaLocalStorageSnapshot,
  selection: Extract<SaveTargetSelection, { mode: 'history' }>,
  warnings: Set<string>
): { assets: SelectedAsset[]; pulls: HistorySelectionMetadata[] } {
  const history = snapshot.pullHistory;
  if (!history?.pulls) {
    return { assets: [], pulls: [] };
  }

  const catalogState = snapshot.catalogState;
  const appState = snapshot.appState;
  const seenAssets = new Set<string>();
  const selected: SelectedAsset[] = [];
  const pullMetadata: HistorySelectionMetadata[] = [];
  const selectedIds = new Set(selection.pullIds);

  Object.entries(history.pulls).forEach(([entryId, entry]) => {
    if (!entry || !selectedIds.has(entryId)) {
      return;
    }

    const normalizedPullCount = Number.isFinite(entry.pullCount)
      ? Math.max(0, Math.floor(entry.pullCount))
      : 0;
    pullMetadata.push({
      pullId: entryId,
      pullCount: normalizedPullCount,
      executedAt: typeof entry.executedAt === 'string' ? entry.executedAt : null
    });

    const gachaId = entry.gachaId;
    const catalogGacha = gachaId ? catalogState?.byGacha?.[gachaId] : undefined;
    const gachaName = gachaId ? appState?.meta?.[gachaId]?.displayName ?? gachaId : 'unknown-gacha';

    Object.entries(entry.itemCounts ?? {}).forEach(([itemId, count]) => {
      if (!itemId || !Number.isFinite(count) || count <= 0) {
        return;
      }

      const catalogItem = catalogGacha?.items?.[itemId];
      if (!catalogItem) {
        warnings.add(`履歴に対応する景品が見つかりません: ${gachaId ?? 'unknown'} / ${itemId}`);
        return;
      }

      const assetId = catalogItem.imageAssetId;
      if (!assetId) {
        warnings.add(`履歴の景品に画像が設定されていません: ${gachaId ?? 'unknown'} / ${catalogItem.name ?? itemId}`);
        return;
      }

      if (seenAssets.has(assetId)) {
        return;
      }

      seenAssets.add(assetId);
      const obtainedCount = typeof count === 'number' && count > 0 ? count : 1;
      selected.push({
        assetId,
        gachaId,
        gachaName,
        itemId,
        itemName: catalogItem.name ?? itemId,
        rarityId: catalogItem.rarityId ?? 'unknown',
        count: obtainedCount,
        isRiagu: Boolean(catalogItem.riagu)
      });
    });
  });

  return { assets: selected, pulls: pullMetadata };
}

function resolveRarityLabel(rarityState: GachaRarityStateV3 | undefined, rarityId: string): string {
  if (!rarityId) {
    return 'unknown';
  }
  const entity = rarityState?.entities?.[rarityId];
  if (!entity) {
    return 'unknown';
  }
  return entity.label || 'unknown';
}

function resolveRiaguType(
  riaguState: GachaLocalStorageSnapshot['riaguState'],
  itemId: string
): string | null {
  const riaguCardId = riaguState?.indexByItemId?.[itemId];
  if (!riaguCardId) {
    return null;
  }
  const card = riaguState?.riaguCards?.[riaguCardId];
  return card?.typeLabel ?? null;
}

function isItemNewForUser(
  inventoriesState: GachaLocalStorageSnapshot['userInventories'],
  userId: string,
  gachaId: string,
  itemId: string
): boolean {
  const entries = inventoriesState?.byItemId?.[itemId];
  if (!entries || entries.length === 0) {
    return true;
  }
  return !entries.some((entry) => entry.userId === userId && entry.gachaId === gachaId);
}

export async function buildUserZipFromSelection({
  snapshot,
  selection,
  userId,
  userName
}: BuildParams): Promise<ZipBuildResult> {
  ensureBrowserEnvironment();

  const warnings = new Set<string>();

  const catalogState = snapshot.catalogState;
  const rarityState: GachaRarityStateV3 | undefined = snapshot.rarityState;
  const inventoriesForUser = snapshot.userInventories?.inventories?.[userId];

  let collected: SelectedAsset[] = [];
  let historySelectionDetails: HistorySelectionMetadata[] = [];
  if (selection.mode === 'history') {
    const historyAggregation = aggregateHistoryItems(snapshot, selection, warnings);
    collected = historyAggregation.assets;
    historySelectionDetails = historyAggregation.pulls;
  } else {
    collected = aggregateInventoryItems(inventoriesForUser, catalogState, snapshot.appState, selection, warnings);
  }

  if (collected.length === 0) {
    throw new Error('保存できる景品が見つかりませんでした');
  }

  const records = await Promise.all(
    collected.map(async (item) => {
      const asset = await loadAsset(item.assetId);
      if (!asset) {
        warnings.add(`画像を読み込めませんでした: ${item.gachaName} / ${item.itemName}`);
        return null;
      }
      return { item, asset };
    })
  );

  const availableRecords = records.filter((record): record is { item: SelectedAsset; asset: StoredAssetRecord } => {
    return Boolean(record?.asset?.blob);
  });

  if (availableRecords.length === 0) {
    throw new Error('画像データを読み込めませんでした');
  }

  const zip = new JSZip();
  const itemsFolder = zip.folder('items');
  const itemMetadataMap: Record<string, ZipItemMetadata> = {};

  availableRecords.forEach(({ item, asset }) => {
    if (!itemsFolder) {
      return;
    }

    const gachaDir = itemsFolder.folder(sanitizePathComponent(item.gachaName));
    if (!gachaDir) {
      return;
    }

    const fileName = item.assetId;

    gachaDir.file(fileName, asset.blob, {
      binary: true,
      compression: 'STORE'
    });

    const filePath = `items/${sanitizePathComponent(item.gachaName)}/${fileName}`;
    const rarityLabel = resolveRarityLabel(rarityState, item.rarityId);
    itemMetadataMap[item.assetId] = {
      filePath,
      gachaName: item.gachaName,
      itemName: item.itemName,
      rarity: rarityLabel,
      isRiagu: item.isRiagu,
      riaguType: resolveRiaguType(snapshot.riaguState, item.itemId),
      obtainedCount: item.count,
      isNewForUser: isItemNewForUser(snapshot.userInventories, userId, item.gachaId, item.itemId)
    };
  });

  const metaFolder = zip.folder('meta');
  const generatedAt = new Date().toISOString();
  if (metaFolder) {
    metaFolder.file(
      'selection.json',
      JSON.stringify(
        {
          version: 1,
          generatedAt,
          user: {
            id: userId,
            displayName: userName
          },
          selection,
          itemCount: availableRecords.length,
          warnings: Array.from(warnings),
          historyPulls: historySelectionDetails.map((detail) => ({
            pullId: detail.pullId,
            pullCount: detail.pullCount,
            executedAt: detail.executedAt
          }))
        },
        null,
        2
      ),
      {
        date: new Date(generatedAt),
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      }
    );

    metaFolder.file(
      'items.json',
      JSON.stringify(itemMetadataMap, null, 2),
      {
        date: new Date(generatedAt),
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      }
    );
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const timestamp = formatTimestamp(new Date());
  const fileName = sanitizeFileName(userName || userId, timestamp);

  return {
    blob,
    fileName,
    fileCount: availableRecords.length,
    warnings: Array.from(warnings)
  };
}
