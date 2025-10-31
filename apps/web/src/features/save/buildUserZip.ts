import JSZip from 'jszip';

import type {
  GachaCatalogStateV3,
  GachaLocalStorageSnapshot,
  GachaRarityStateV3,
  UserInventorySnapshotV3
} from '@domain/app-persistence';
import { loadAsset, type StoredAssetRecord } from '@domain/assets/assetStorage';

import type { SaveTargetSelection, ZipBuildResult } from './types';

interface SelectedAsset {
  assetId: string;
  gachaId: string | undefined;
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

type CatalogGacha = GachaCatalogStateV3['byGacha'][string] | undefined;

type WarningBuilder = (
  type: 'missingItem' | 'missingAsset',
  context: { gachaId: string | undefined; itemId: string; itemName?: string }
) => string;

function ensureBrowserEnvironment(): void {
  if (typeof window === 'undefined') {
    throw new Error('ブラウザ環境でのみ保存処理を実行できます');
  }
}

function sanitizePathComponent(value: string): string {
  const normalized = value.replace(/[\\/:*?"<>|]/g, '_').trim();
  return normalized.length > 0 ? normalized : 'unknown';
}

const MIME_TYPE_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/avif': '.avif'
};

function extractExtensionFromName(name: string | undefined): string | null {
  if (!name) {
    return null;
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }

  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === trimmed.length - 1) {
    return null;
  }

  const extension = trimmed.slice(lastDot);
  return /^\.[0-9A-Za-z]+$/.test(extension) ? extension : null;
}

function resolveMimeTypeExtension(type: string | undefined): string | null {
  if (!type) {
    return null;
  }

  const normalized = type.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return MIME_TYPE_EXTENSION_MAP[normalized] ?? null;
}

function inferAssetExtension(asset: StoredAssetRecord): string {
  const nameExtension = extractExtensionFromName(asset.name);
  if (nameExtension) {
    return nameExtension;
  }

  const blob = asset.blob;
  if (blob && 'name' in blob) {
    const blobName = (blob as File).name;
    const blobNameExtension = extractExtensionFromName(blobName);
    if (blobNameExtension) {
      return blobNameExtension;
    }
  }

  const mimeExtension = resolveMimeTypeExtension(blob.type || asset.type);
  if (mimeExtension) {
    return mimeExtension;
  }

  return '.bin';
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

function resolveCatalogContext(
  catalogState: GachaCatalogStateV3 | undefined,
  appState: GachaLocalStorageSnapshot['appState'] | undefined,
  gachaId: string | undefined
): { gachaId: string | undefined; gachaName: string; catalogGacha: CatalogGacha } {
  const catalogGacha = gachaId ? catalogState?.byGacha?.[gachaId] : undefined;
  const gachaName = gachaId
    ? appState?.meta?.[gachaId]?.displayName ?? gachaId
    : 'unknown-gacha';

  return { gachaId, gachaName, catalogGacha };
}

function createSelectedAsset(
  context: { gachaId: string | undefined; gachaName: string; catalogGacha: CatalogGacha },
  itemId: string,
  fallbackRarityId: string,
  rawCount: unknown,
  warnings: Set<string>,
  seenAssets: Set<string>,
  buildWarning: WarningBuilder
): SelectedAsset | null {
  if (!itemId) {
    return null;
  }

  const catalogItem = context.catalogGacha?.items?.[itemId];
  if (!catalogItem) {
    warnings.add(
      buildWarning('missingItem', {
        gachaId: context.gachaId,
        itemId
      })
    );
    return null;
  }

  const assetId = catalogItem.imageAssetId;
  if (!assetId) {
    warnings.add(
      buildWarning('missingAsset', {
        gachaId: context.gachaId,
        itemId,
        itemName: catalogItem.name ?? itemId
      })
    );
    return null;
  }

  if (seenAssets.has(assetId)) {
    return null;
  }

  seenAssets.add(assetId);
  const normalizedCount =
    typeof rawCount === 'number' && Number.isFinite(rawCount) && rawCount > 0
      ? rawCount
      : 1;

  return {
    assetId,
    gachaId: context.gachaId,
    gachaName: context.gachaName,
    itemId,
    itemName: catalogItem.name ?? itemId,
    rarityId: catalogItem.rarityId ?? fallbackRarityId,
    count: normalizedCount,
    isRiagu: Boolean(catalogItem.riagu)
  };
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

    const context = resolveCatalogContext(catalogState, appState, snapshot.gachaId);

    Object.entries(snapshot.items ?? {}).forEach(([rarityId, itemIds]) => {
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return;
      }

      itemIds.forEach((itemId) => {
        const asset = createSelectedAsset(
          context,
          itemId,
          rarityId,
          snapshot.counts?.[rarityId]?.[itemId],
          warnings,
          seenAssets,
          (type, { gachaId, itemId: warningItemId, itemName }) => {
            const id = gachaId ?? 'unknown';
            return type === 'missingItem'
              ? `カタログ情報が見つかりません: ${id} / ${warningItemId}`
              : `画像アセットが未設定: ${id} / ${itemName ?? warningItemId}`;
          }
        );

        if (asset) {
          selected.push(asset);
        }
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
    const context = resolveCatalogContext(catalogState, appState, gachaId);

    Object.entries(entry.itemCounts ?? {}).forEach(([itemId, count]) => {
      if (!itemId || !Number.isFinite(count) || count <= 0) {
        return;
      }

      const asset = createSelectedAsset(
        context,
        itemId,
        'unknown',
        count,
        warnings,
        seenAssets,
        (type, { gachaId: warningGachaId, itemId: warningItemId, itemName }) => {
          const id = warningGachaId ?? 'unknown';
          return type === 'missingItem'
            ? `履歴に対応する景品が見つかりません: ${id} / ${warningItemId}`
            : `履歴の景品に画像が設定されていません: ${id} / ${itemName ?? warningItemId}`;
        }
      );

      if (asset) {
        selected.push(asset);
      }
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
  gachaId: string | undefined,
  itemId: string
): boolean {
  if (!gachaId) {
    return true;
  }
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

    const sanitizedGachaName = sanitizePathComponent(item.gachaName);
    const gachaDir = itemsFolder.folder(sanitizedGachaName);
    if (!gachaDir) {
      return;
    }

    const fileExtension = inferAssetExtension(asset);
    const fileName = `${item.assetId}${fileExtension}`;

    gachaDir.file(fileName, asset.blob, {
      binary: true,
      compression: 'STORE'
    });

    const filePath = `items/${sanitizedGachaName}/${fileName}`;
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
