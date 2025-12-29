import JSZip from 'jszip';

import type {
  GachaCatalogStateV4,
  GachaLocalStorageSnapshot,
  GachaRarityStateV3,
  PullHistoryStateV1,
  UserInventorySnapshotV3
} from '@domain/app-persistence';
import { loadAsset, type StoredAssetRecord } from '@domain/assets/assetStorage';
import { generateDeterministicUserId } from '@domain/idGenerators';

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
  filePath: string | null;
  gachaId?: string | null;
  gachaName: string;
  itemId?: string | null;
  itemName: string;
  rarity: string;
  rarityColor: string | null;
  isRiagu: boolean;
  riaguType: string | null;
  obtainedCount: number;
  isNewForUser: boolean;
  isOmitted?: boolean;
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
  ownerName?: string;
  includeMetadata?: boolean;
  itemIdFilter?: Set<string>;
}

type CatalogGacha = GachaCatalogStateV4['byGacha'][string] | undefined;

type WarningBuilder = (
  type: 'missingItem' | 'missingAsset',
  context: { gachaId: string | undefined; itemId: string; itemName?: string }
) => string;

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

const DEFAULT_USER_ID = generateDeterministicUserId('default-user');

function ensureBrowserEnvironment(): void {
  if (typeof window === 'undefined') {
    throw new Error('ブラウザ環境でのみ保存処理を実行できます');
  }
}

function sanitizePathComponent(value: string): string {
  const normalized = value.replace(/[\\/:*?"<>|]/g, '_').trim();
  return normalized.length > 0 ? normalized : 'unknown';
}

function normalizeUserId(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : DEFAULT_USER_ID;
}

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
  catalogState: GachaCatalogStateV4 | undefined,
  appState: GachaLocalStorageSnapshot['appState'] | undefined,
  gachaId: string | undefined
): { gachaId: string | undefined; gachaName: string; catalogGacha: CatalogGacha } {
  const catalogGacha = gachaId ? catalogState?.byGacha?.[gachaId] : undefined;
  const gachaName = gachaId ? appState?.meta?.[gachaId]?.displayName ?? gachaId : 'unknown-gacha';

  return { gachaId, gachaName, catalogGacha };
}

function createSelectedAssets(
  context: { gachaId: string | undefined; gachaName: string; catalogGacha: CatalogGacha },
  itemId: string,
  fallbackRarityId: string,
  rawCount: unknown,
  warnings: Set<string>,
  seenAssets: Set<string>,
  buildWarning: WarningBuilder
): SelectedAsset[] {
  if (!itemId) {
    return [];
  }

  const catalogItem = context.catalogGacha?.items?.[itemId];
  if (!catalogItem) {
    warnings.add(
      buildWarning('missingItem', {
        gachaId: context.gachaId,
        itemId
      })
    );
    return [];
  }

  const assetEntries = Array.isArray(catalogItem.assets) ? catalogItem.assets : [];
  const assetIds = assetEntries
    .map((asset) => asset?.assetId)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  if (assetIds.length === 0) {
    warnings.add(
      buildWarning('missingAsset', {
        gachaId: context.gachaId,
        itemId,
        itemName: catalogItem.name ?? itemId
      })
    );
    return [];
  }

  const normalizedCount =
    typeof rawCount === 'number' && Number.isFinite(rawCount) && rawCount > 0 ? rawCount : 1;

  return assetIds.reduce<SelectedAsset[]>((acc, assetId) => {
    if (seenAssets.has(assetId)) {
      return acc;
    }

    seenAssets.add(assetId);
    acc.push({
      assetId,
      gachaId: context.gachaId,
      gachaName: context.gachaName,
      itemId,
      itemName: catalogItem.name ?? itemId,
      rarityId: catalogItem.rarityId ?? fallbackRarityId,
      count: normalizedCount,
      isRiagu: Boolean(catalogItem.riagu)
    });
    return acc;
  }, []);
}

function aggregateInventoryItems(
  inventories: Record<string, UserInventorySnapshotV3 | undefined> | undefined,
  catalogState: GachaCatalogStateV4 | undefined,
  appState: GachaLocalStorageSnapshot['appState'] | undefined,
  selection: SaveTargetSelection,
  warnings: Set<string>,
  itemIdFilter?: Set<string> | null
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
        if (itemIdFilter && !itemIdFilter.has(itemId)) {
          return;
        }
        const assets = createSelectedAssets(
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
              : `ファイルが未設定: ${id} / ${itemName ?? warningItemId}`;
          }
        );

        if (assets.length > 0) {
          selected.push(...assets);
        }
      });
    });
  });

  return selected;
}

function aggregateHistoryItems(
  snapshot: GachaLocalStorageSnapshot,
  selection: Extract<SaveTargetSelection, { mode: 'history' }>,
  warnings: Set<string>,
  normalizedTargetUserId: string,
  itemIdFilter?: Set<string> | null,
  newItemsOnlyPullIds?: Set<string> | null
): { assets: SelectedAsset[]; pulls: HistorySelectionMetadata[]; includedPullIds: Set<string> } {
  const history = snapshot.pullHistory;
  if (!history?.pulls) {
    return { assets: [], pulls: [], includedPullIds: new Set<string>() };
  }

  const catalogState = snapshot.catalogState;
  const appState = snapshot.appState;
  const seenAssets = new Set<string>();
  const selected: SelectedAsset[] = [];
  const pullMetadata: HistorySelectionMetadata[] = [];
  const includedPullIds = new Set<string>();

  selection.pullIds.forEach((rawId) => {
    const entryId = rawId?.trim();
    if (!entryId) {
      return;
    }

    const entry = history.pulls?.[entryId];
    if (!entry) {
      return;
    }

    if (normalizeUserId(entry.userId) !== normalizedTargetUserId) {
      return;
    }

    const newItemsOnly = Boolean(newItemsOnlyPullIds && newItemsOnlyPullIds.has(entryId));
    const newItemsSet = newItemsOnly ? new Set(entry.newItems ?? []) : null;

    const normalizedPullCount = Number.isFinite(entry.pullCount)
      ? Math.max(0, Math.floor(entry.pullCount))
      : 0;

    pullMetadata.push({
      pullId: entryId,
      pullCount: normalizedPullCount,
      executedAt: typeof entry.executedAt === 'string' ? entry.executedAt : null
    });

    const context = resolveCatalogContext(catalogState, appState, entry.gachaId);
    let entryContributed = false;

    Object.entries(entry.itemCounts ?? {}).forEach(([itemId, count]) => {
      if (!itemId || !Number.isFinite(count) || count <= 0) {
        return;
      }
      if (itemIdFilter && !itemIdFilter.has(itemId)) {
        return;
      }
      if (newItemsSet && !newItemsSet.has(itemId)) {
        return;
      }

      const assets = createSelectedAssets(
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
            : `履歴の景品にファイルが設定されていません: ${id} / ${itemName ?? warningItemId}`;
        }
      );

      if (assets.length > 0) {
        selected.push(...assets);
        entryContributed = true;
      }
    });

    if (entryContributed) {
      includedPullIds.add(entryId);
    }
  });

  return { assets: selected, pulls: pullMetadata, includedPullIds };
}

function collectPullIdsForSelection(
  history: PullHistoryStateV1 | undefined,
  normalizedTargetUserId: string,
  selection: SaveTargetSelection
): Set<string> {
  const result = new Set<string>();
  if (!history?.pulls) {
    return result;
  }

  const evaluateEntry = (pullId: string | undefined): void => {
    const trimmedId = pullId?.trim();
    if (!trimmedId || result.has(trimmedId)) {
      return;
    }
    const entry = history.pulls?.[trimmedId];
    if (!entry) {
      return;
    }
    if (normalizeUserId(entry.userId) !== normalizedTargetUserId) {
      return;
    }
    result.add(trimmedId);
  };

  if (selection.mode === 'history') {
    selection.pullIds.forEach((pullId) => {
      evaluateEntry(pullId);
    });
    return result;
  }

  const allowedGachaIds = selection.mode === 'gacha' ? new Set(selection.gachaIds) : null;

  Object.entries(history.pulls).forEach(([pullId, entry]) => {
    if (!pullId || !entry) {
      return;
    }
    if (normalizeUserId(entry.userId) !== normalizedTargetUserId) {
      return;
    }
    if (allowedGachaIds && !allowedGachaIds.has(entry.gachaId)) {
      return;
    }
    evaluateEntry(pullId);
  });

  return result;
}

function collectHistoryMetadataForPullIds(
  history: PullHistoryStateV1 | undefined,
  normalizedTargetUserId: string,
  pullIds: string[]
): HistorySelectionMetadata[] {
  if (!history?.pulls || pullIds.length === 0) {
    return [];
  }

  const metadata: HistorySelectionMetadata[] = [];
  pullIds.forEach((rawId) => {
    const pullId = rawId?.trim();
    if (!pullId) {
      return;
    }
    const entry = history.pulls?.[pullId];
    if (!entry) {
      return;
    }
    if (normalizeUserId(entry.userId) !== normalizedTargetUserId) {
      return;
    }

    const normalizedPullCount = Number.isFinite(entry.pullCount)
      ? Math.max(0, Math.floor(entry.pullCount))
      : 0;

    metadata.push({
      pullId,
      pullCount: normalizedPullCount,
      executedAt: typeof entry.executedAt === 'string' ? entry.executedAt : null
    });
  });

  return metadata;
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
  const normalizedUserId = normalizeUserId(userId);
  return !entries.some((entry) => normalizeUserId(entry.userId) === normalizedUserId && entry.gachaId === gachaId);
}

export async function buildUserZipFromSelection({
  snapshot,
  selection,
  userId,
  userName,
  ownerName,
  includeMetadata = true,
  itemIdFilter
}: BuildParams): Promise<ZipBuildResult> {
  ensureBrowserEnvironment();

  const warnings = new Set<string>();

  const catalogState = snapshot.catalogState;
  const rarityState: GachaRarityStateV3 | undefined = snapshot.rarityState;
  const inventoriesForUser = snapshot.userInventories?.inventories?.[userId];
  const normalizedUserId = normalizeUserId(userId);
  const normalizedItemFilter = itemIdFilter && itemIdFilter.size > 0 ? new Set(itemIdFilter) : null;

  let collected: SelectedAsset[] = [];
  let historySelectionDetails: HistorySelectionMetadata[] = [];
  let includedPullIds: Set<string> = new Set();
  let metadataAssets: SelectedAsset[] = [];
  let omittedAssetIds: Set<string> = new Set();
  if (selection.mode === 'history') {
    const newItemsOnlyPullIds =
      selection.newItemsOnlyPullIds && selection.newItemsOnlyPullIds.length > 0
        ? new Set(selection.newItemsOnlyPullIds)
        : null;
    const historyAggregation = aggregateHistoryItems(
      snapshot,
      selection,
      warnings,
      normalizedUserId,
      normalizedItemFilter,
      newItemsOnlyPullIds
    );
    collected = historyAggregation.assets;
    historySelectionDetails = historyAggregation.pulls;
    includedPullIds = historyAggregation.includedPullIds;

    if (newItemsOnlyPullIds && newItemsOnlyPullIds.size > 0) {
      const allHistoryAggregation = aggregateHistoryItems(
        snapshot,
        selection,
        warnings,
        normalizedUserId,
        normalizedItemFilter,
        null
      );
      metadataAssets = allHistoryAggregation.assets;
      const selectedAssetIds = new Set(collected.map((item) => item.assetId));
      omittedAssetIds = new Set(
        metadataAssets
          .filter((item) => !selectedAssetIds.has(item.assetId))
          .map((item) => item.assetId)
      );
    } else {
      metadataAssets = collected;
    }
  } else {
    collected = aggregateInventoryItems(
      inventoriesForUser,
      catalogState,
      snapshot.appState,
      selection,
      warnings,
      normalizedItemFilter
    );
    includedPullIds = collectPullIdsForSelection(snapshot.pullHistory, normalizedUserId, selection);
    if (includedPullIds.size > 0) {
      historySelectionDetails = collectHistoryMetadataForPullIds(
        snapshot.pullHistory,
        normalizedUserId,
        Array.from(includedPullIds)
      );
    }
    metadataAssets = collected;
  }

  if (collected.length === 0) {
    throw new Error('保存できる景品が見つかりませんでした');
  }

  const records = await Promise.all(
    collected.map(async (item) => {
      const asset = await loadAsset(item.assetId);
      if (!asset) {
        warnings.add(`ファイルを読み込めませんでした: ${item.gachaName} / ${item.itemName}`);
        return null;
      }
      return { item, asset };
    })
  );

  const availableRecords = records.filter((record): record is { item: SelectedAsset; asset: StoredAssetRecord } => {
    return Boolean(record?.asset?.blob);
  });

  if (availableRecords.length === 0) {
    throw new Error('ファイルデータを読み込めませんでした');
  }

  const zip = new JSZip();
  const itemsFolder = zip.folder('items');
  const itemMetadataMap: Record<string, ZipItemMetadata> | null = includeMetadata ? {} : null;

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

    if (itemMetadataMap) {
      const filePath = `items/${sanitizedGachaName}/${fileName}`;
      const rarityLabel = resolveRarityLabel(rarityState, item.rarityId);
      const rarityColor = rarityState?.entities?.[item.rarityId]?.color ?? null;
      itemMetadataMap[item.assetId] = {
        filePath,
        gachaId: item.gachaId ?? null,
        gachaName: item.gachaName,
        itemId: item.itemId ?? null,
        itemName: item.itemName,
        rarity: rarityLabel,
        rarityColor,
        isRiagu: item.isRiagu,
        riaguType: resolveRiaguType(snapshot.riaguState, item.itemId),
        obtainedCount: item.count,
        isNewForUser: isItemNewForUser(snapshot.userInventories, userId, item.gachaId, item.itemId),
        isOmitted: false
      };
    }
  });

  if (itemMetadataMap && metadataAssets.length > 0) {
    metadataAssets.forEach((item) => {
      if (itemMetadataMap[item.assetId]) {
        return;
      }
      const rarityLabel = resolveRarityLabel(rarityState, item.rarityId);
      const rarityColor = rarityState?.entities?.[item.rarityId]?.color ?? null;
      itemMetadataMap[item.assetId] = {
        filePath: null,
        gachaId: item.gachaId ?? null,
        gachaName: item.gachaName,
        itemId: item.itemId ?? null,
        itemName: item.itemName,
        rarity: rarityLabel,
        rarityColor,
        isRiagu: item.isRiagu,
        riaguType: resolveRiaguType(snapshot.riaguState, item.itemId),
        obtainedCount: item.count,
        isNewForUser: isItemNewForUser(snapshot.userInventories, userId, item.gachaId, item.itemId),
        isOmitted: omittedAssetIds.has(item.assetId)
      };
    });
  }

  const metaFolder = includeMetadata ? zip.folder('meta') : null;
  const generatedAt = includeMetadata ? new Date().toISOString() : null;
  const pullIds = Array.from(includedPullIds);
  const normalizedOwnerName = typeof ownerName === 'string' ? ownerName.trim() : '';
  if (includeMetadata && metaFolder && generatedAt && itemMetadataMap) {
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
          owner: normalizedOwnerName ? { displayName: normalizedOwnerName } : undefined,
          selection,
          itemCount: availableRecords.length,
          warnings: Array.from(warnings),
          pullIds,
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
    warnings: Array.from(warnings),
    pullIds
  };
}
