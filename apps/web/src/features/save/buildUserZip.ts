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

export interface OriginalPrizeMissingItem {
  gachaId: string | undefined;
  gachaName: string;
  inventoryId?: string;
  itemId: string;
  itemName: string;
  missingCount: number;
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

interface ZipCatalogItemMetadata {
  itemId: string;
  itemName: string;
  rarityId: string;
  rarityLabel: string;
  rarityColor: string | null;
  isRiagu: boolean;
  assetCount: number;
  order: number | null;
}

interface ZipCatalogGachaMetadata {
  gachaId: string;
  gachaName: string;
  items: ZipCatalogItemMetadata[];
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

  if (catalogItem.originalPrize) {
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

interface OriginalPrizeSelectionResult {
  assets: SelectedAsset[];
  missingItems: OriginalPrizeMissingItem[];
  includedPullIds?: Set<string>;
  missingPullIds: Set<string>;
}

function resolveInventoryIdForGacha(
  inventories: Record<string, UserInventorySnapshotV3 | undefined> | undefined,
  gachaId: string | undefined
): string | undefined {
  if (!inventories || !gachaId) {
    return undefined;
  }
  const snapshot = Object.values(inventories).find((entry) => entry?.gachaId === gachaId);
  return snapshot?.inventoryId;
}

function collectOriginalPrizeSelection(params: {
  snapshot: GachaLocalStorageSnapshot;
  selection: SaveTargetSelection;
  userId: string;
  normalizedUserId: string;
  itemIdFilter: Set<string> | null | undefined;
  warnings: Set<string>;
  seenAssets: Set<string>;
}): OriginalPrizeSelectionResult {
  const { snapshot, selection, userId, normalizedUserId, itemIdFilter, warnings, seenAssets } = params;
  const history = snapshot.pullHistory;
  const catalogState = snapshot.catalogState;
  const appState = snapshot.appState;
  const inventoriesForUser = snapshot.userInventories?.inventories?.[userId];
  const assets: SelectedAsset[] = [];
  const missingItems: OriginalPrizeMissingItem[] = [];
  const missingPullIds = new Set<string>();

  const addMissingItem = (entry: {
    gachaId: string | undefined;
    itemId: string;
    itemName: string;
    missingCount: number;
  }): void => {
    const gachaName = entry.gachaId ? appState?.meta?.[entry.gachaId]?.displayName ?? entry.gachaId : 'unknown-gacha';
    missingItems.push({
      gachaId: entry.gachaId,
      gachaName,
      inventoryId: resolveInventoryIdForGacha(inventoriesForUser, entry.gachaId),
      itemId: entry.itemId,
      itemName: entry.itemName,
      missingCount: entry.missingCount
    });
    warnings.add(`オリジナル景品のファイルが未設定: ${gachaName} / ${entry.itemName}`);
  };

  if (selection.mode === 'history') {
    if (!history?.pulls) {
      return { assets, missingItems, includedPullIds: new Set<string>(), missingPullIds };
    }
    const includedPullIds = new Set<string>();

    selection.pullIds.forEach((rawId) => {
      const entryId = rawId?.trim();
      if (!entryId) {
        return;
      }

      const entry = history.pulls?.[entryId];
      if (!entry || normalizeUserId(entry.userId) !== normalizedUserId) {
        return;
      }

      const context = resolveCatalogContext(catalogState, appState, entry.gachaId);
      const assignedKeys = new Set<string>();
      let contributed = false;
      let entryHasOriginalPrize = false;

      Object.entries(entry.itemCounts ?? {}).forEach(([itemId, count]) => {
        if (!itemId || !Number.isFinite(count) || count <= 0) {
          return;
        }
        if (itemIdFilter && !itemIdFilter.has(itemId)) {
          return;
        }

        const catalogItem = context.catalogGacha?.items?.[itemId];
        if (!catalogItem?.originalPrize) {
          return;
        }

        entryHasOriginalPrize = true;
        const requiredCount = Math.trunc(count);
        const itemName = catalogItem.name ?? itemId;
        const assignments = entry.originalPrizeAssignments?.[itemId] ?? [];
        let assignedCount = 0;

        assignments.forEach((assignment) => {
          if (!assignment?.assetId) {
            return;
          }
          const index = Math.trunc(assignment.index);
          if (index < 0) {
            return;
          }
          const assignmentKey = `${entry.id}:${itemId}:${index}`;
          if (assignedKeys.has(assignmentKey)) {
            return;
          }
          assignedKeys.add(assignmentKey);
          assignedCount += 1;

          if (seenAssets.has(assignment.assetId)) {
            return;
          }
          seenAssets.add(assignment.assetId);
          assets.push({
            assetId: assignment.assetId,
            gachaId: entry.gachaId,
            gachaName: context.gachaName,
            itemId,
            itemName,
            rarityId: catalogItem.rarityId ?? 'unknown',
            count: 1,
            isRiagu: Boolean(catalogItem.riagu)
          });
          contributed = true;
        });

        if (assignedCount < requiredCount) {
          addMissingItem({
            gachaId: entry.gachaId,
            itemId,
            itemName,
            missingCount: requiredCount - assignedCount
          });
          missingPullIds.add(entryId);
        }
      });

      if (contributed || entryHasOriginalPrize) {
        includedPullIds.add(entryId);
      }
    });

    return { assets, missingItems, includedPullIds, missingPullIds };
  }

  const gachaFilter = selection.mode === 'gacha' ? new Set(selection.gachaIds) : null;
  const requiredCounts = new Map<string, { count: number; item: SelectedAsset }>();

  Object.values(inventoriesForUser ?? {}).forEach((inventory) => {
    if (!inventory) {
      return;
    }
    if (gachaFilter && !gachaFilter.has(inventory.gachaId)) {
      return;
    }

    const context = resolveCatalogContext(catalogState, appState, inventory.gachaId);
    const countsByRarity = inventory.counts ?? {};
    const itemsByRarity = inventory.items ?? {};

    Object.entries(itemsByRarity).forEach(([rarityId, itemIds]) => {
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return;
      }

      const fallbackCounts = new Map<string, number>();
      itemIds.forEach((itemId) => {
        fallbackCounts.set(itemId, (fallbackCounts.get(itemId) ?? 0) + 1);
      });

      Array.from(fallbackCounts.keys()).forEach((itemId) => {
        if (itemIdFilter && !itemIdFilter.has(itemId)) {
          return;
        }
        const catalogItem = context.catalogGacha?.items?.[itemId];
        if (!catalogItem?.originalPrize) {
          return;
        }

        const explicitCount = countsByRarity[rarityId]?.[itemId];
        const totalCount = typeof explicitCount === 'number' && explicitCount > 0
          ? explicitCount
          : fallbackCounts.get(itemId) ?? 0;
        if (totalCount <= 0) {
          return;
        }

        const key = `${inventory.gachaId}:${itemId}`;
        requiredCounts.set(key, {
          count: totalCount,
          item: {
            assetId: '',
            gachaId: inventory.gachaId,
            gachaName: context.gachaName,
            itemId,
            itemName: catalogItem.name ?? itemId,
            rarityId: catalogItem.rarityId ?? rarityId,
            count: totalCount,
            isRiagu: Boolean(catalogItem.riagu)
          }
        });
      });
    });
  });

  if (requiredCounts.size === 0) {
    return { assets, missingItems, missingPullIds };
  }

  const assignedCounts = new Map<string, number>();
  const assignmentKeys = new Set<string>();

  Object.values(history?.pulls ?? {}).forEach((entry) => {
    if (!entry || normalizeUserId(entry.userId) !== normalizedUserId) {
      return;
    }
    if (gachaFilter && !gachaFilter.has(entry.gachaId)) {
      return;
    }

    const assignedCountsForEntry = new Map<string, number>();

    Object.entries(entry.originalPrizeAssignments ?? {}).forEach(([itemId, assignments]) => {
      const key = `${entry.gachaId}:${itemId}`;
      const required = requiredCounts.get(key);
      if (!required || !Array.isArray(assignments)) {
        return;
      }

      const uniqueIndices = new Set<number>();
      assignments.forEach((assignment) => {
        if (!assignment?.assetId) {
          return;
        }
        const index = Math.trunc(assignment.index);
        if (index < 0) {
          return;
        }
        if (uniqueIndices.has(index)) {
          return;
        }
        uniqueIndices.add(index);
        assignedCountsForEntry.set(itemId, uniqueIndices.size);
        const assignmentKey = `${entry.id}:${itemId}:${index}`;
        if (assignmentKeys.has(assignmentKey)) {
          return;
        }
        assignmentKeys.add(assignmentKey);
        assignedCounts.set(key, (assignedCounts.get(key) ?? 0) + 1);

        if (seenAssets.has(assignment.assetId)) {
          return;
        }
        seenAssets.add(assignment.assetId);
        assets.push({
          ...required.item,
          assetId: assignment.assetId,
          count: 1
        });
      });
    });

    Object.entries(entry.itemCounts ?? {}).forEach(([itemId, rawCount]) => {
      if (!itemId || !Number.isFinite(rawCount) || rawCount <= 0) {
        return;
      }
      const key = `${entry.gachaId}:${itemId}`;
      if (!requiredCounts.has(key)) {
        return;
      }
      const entryCount = Math.trunc(rawCount);
      const assignedCount = assignedCountsForEntry.get(itemId) ?? 0;
      if (assignedCount < entryCount) {
        missingPullIds.add(entry.id);
      }
    });
  });

  requiredCounts.forEach((required, key) => {
    const assigned = assignedCounts.get(key) ?? 0;
    if (assigned >= required.count) {
      return;
    }
    addMissingItem({
      gachaId: required.item.gachaId,
      itemId: required.item.itemId,
      itemName: required.item.itemName,
      missingCount: required.count - assigned
    });
  });

  return { assets, missingItems, missingPullIds };
}

export function findOriginalPrizeMissingItems(params: {
  snapshot: GachaLocalStorageSnapshot;
  selection: SaveTargetSelection;
  userId: string;
  itemIdFilter?: Set<string> | null;
}): OriginalPrizeMissingItem[] {
  const warnings = new Set<string>();
  const seenAssets = new Set<string>();
  const normalizedUserId = normalizeUserId(params.userId);
  return collectOriginalPrizeSelection({
    snapshot: params.snapshot,
    selection: params.selection,
    userId: params.userId,
    normalizedUserId,
    itemIdFilter: params.itemIdFilter,
    warnings,
    seenAssets
  }).missingItems;
}

function aggregateInventoryItems(
  inventories: Record<string, UserInventorySnapshotV3 | undefined> | undefined,
  catalogState: GachaCatalogStateV4 | undefined,
  appState: GachaLocalStorageSnapshot['appState'] | undefined,
  selection: SaveTargetSelection,
  warnings: Set<string>,
  itemIdFilter: Set<string> | null | undefined,
  seenAssets: Set<string>
): SelectedAsset[] {
  if (!inventories) {
    return [];
  }

  const gachaFilter = selection.mode === 'gacha' ? new Set(selection.gachaIds) : null;
  const selected: SelectedAsset[] = [];

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
  newItemsOnlyPullIds?: Set<string> | null,
  originalPrizeOnlyPullIds?: Set<string> | null,
  seenAssets?: Set<string>
): { assets: SelectedAsset[]; pulls: HistorySelectionMetadata[]; includedPullIds: Set<string> } {
  const history = snapshot.pullHistory;
  if (!history?.pulls) {
    return { assets: [], pulls: [], includedPullIds: new Set<string>() };
  }

  const catalogState = snapshot.catalogState;
  const appState = snapshot.appState;
  const resolvedSeenAssets = seenAssets ?? new Set<string>();
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

    const originalPrizeOnly = Boolean(originalPrizeOnlyPullIds && originalPrizeOnlyPullIds.has(entryId));
    const newItemsOnly = !originalPrizeOnly && Boolean(newItemsOnlyPullIds && newItemsOnlyPullIds.has(entryId));
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

    if (!originalPrizeOnly) {
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
          resolvedSeenAssets,
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
    }

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

function resolveCatalogGachaIds(
  selection: SaveTargetSelection,
  catalogState: GachaCatalogStateV4 | undefined,
  metadataAssets: SelectedAsset[]
): string[] {
  if (!catalogState?.byGacha) {
    return [];
  }
  if (selection.mode === 'gacha') {
    return Array.from(new Set(selection.gachaIds.filter((id) => id && id.trim())));
  }
  if (selection.mode === 'history') {
    return Array.from(
      new Set(
        metadataAssets
          .map((asset) => asset.gachaId)
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      )
    );
  }
  return Object.keys(catalogState.byGacha);
}

function buildCatalogSummary(
  catalogState: GachaCatalogStateV4 | undefined,
  appState: GachaLocalStorageSnapshot['appState'] | undefined,
  rarityState: GachaRarityStateV3 | undefined,
  selection: SaveTargetSelection,
  metadataAssets: SelectedAsset[]
): ZipCatalogGachaMetadata[] {
  if (!catalogState?.byGacha) {
    return [];
  }
  const gachaIds = resolveCatalogGachaIds(selection, catalogState, metadataAssets);
  if (gachaIds.length === 0) {
    return [];
  }

  const summaries: ZipCatalogGachaMetadata[] = [];
  gachaIds.forEach((gachaId) => {
    const gachaSnapshot = catalogState.byGacha[gachaId];
    if (!gachaSnapshot) {
      return;
    }
    const gachaName = appState?.meta?.[gachaId]?.displayName ?? gachaId;
    const orderIndex = new Map<string, number>();
    (gachaSnapshot.order ?? []).forEach((itemId, index) => {
      orderIndex.set(itemId, index);
    });

    const items: ZipCatalogItemMetadata[] = Object.entries(gachaSnapshot.items ?? {}).map(([itemId, item]) => {
      const rarityLabel = resolveRarityLabel(rarityState, item.rarityId ?? '');
      const rarityColor = rarityState?.entities?.[item.rarityId ?? '']?.color ?? null;
      const assetCount = Array.isArray(item.assets) ? item.assets.length : 0;
      const fallbackOrder = orderIndex.get(itemId);
      const orderValue = Number.isFinite(item.order)
        ? (item.order as number)
        : Number.isFinite(fallbackOrder)
          ? (fallbackOrder as number)
          : null;

      return {
        itemId,
        itemName: item.name ?? itemId,
        rarityId: item.rarityId ?? 'unknown',
        rarityLabel,
        rarityColor,
        isRiagu: Boolean(item.riagu),
        assetCount,
        order: orderValue
      };
    });

    items.sort((a, b) => {
      if (a.order !== null && b.order !== null && a.order !== b.order) {
        return a.order - b.order;
      }
      if (a.order !== null) {
        return -1;
      }
      if (b.order !== null) {
        return 1;
      }
      return a.itemName.localeCompare(b.itemName, 'ja');
    });

    if (items.length > 0) {
      summaries.push({ gachaId, gachaName, items });
    }
  });

  summaries.sort((a, b) => a.gachaName.localeCompare(b.gachaName, 'ja'));
  return summaries;
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
  const seenAssets = new Set<string>();

  const catalogState = snapshot.catalogState;
  const rarityState: GachaRarityStateV3 | undefined = snapshot.rarityState;
  const inventoriesForUser = snapshot.userInventories?.inventories?.[userId];
  const normalizedUserId = normalizeUserId(userId);
  const normalizedItemFilter = itemIdFilter && itemIdFilter.size > 0 ? new Set(itemIdFilter) : null;

  const originalPrizeSelection = collectOriginalPrizeSelection({
    snapshot,
    selection,
    userId,
    normalizedUserId,
    itemIdFilter: normalizedItemFilter,
    warnings,
    seenAssets
  });

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
    const missingOnlyPullIds =
      selection.missingOnlyPullIds && selection.missingOnlyPullIds.length > 0
        ? new Set(selection.missingOnlyPullIds)
        : null;
    const historyAggregation = aggregateHistoryItems(
      snapshot,
      selection,
      warnings,
      normalizedUserId,
      normalizedItemFilter,
      newItemsOnlyPullIds,
      missingOnlyPullIds,
      seenAssets
    );
    collected = [...originalPrizeSelection.assets, ...historyAggregation.assets];
    historySelectionDetails = historyAggregation.pulls;
    includedPullIds = historyAggregation.includedPullIds;
    if (originalPrizeSelection.includedPullIds) {
      originalPrizeSelection.includedPullIds.forEach((id) => includedPullIds.add(id));
    }

    if (newItemsOnlyPullIds && newItemsOnlyPullIds.size > 0) {
      const allHistoryAggregation = aggregateHistoryItems(
        snapshot,
        selection,
        warnings,
        normalizedUserId,
        normalizedItemFilter,
        null,
        missingOnlyPullIds
      );
      const metadataEntries = new Map<string, SelectedAsset>();
      originalPrizeSelection.assets.forEach((item) => {
        metadataEntries.set(item.assetId, item);
      });
      allHistoryAggregation.assets.forEach((item) => {
        metadataEntries.set(item.assetId, item);
      });
      metadataAssets = Array.from(metadataEntries.values());
      const selectedAssetIds = new Set(collected.map((item) => item.assetId));
      omittedAssetIds = new Set(
        metadataAssets
          .filter((item) => !selectedAssetIds.has(item.assetId))
          .map((item) => item.assetId)
      );
    } else {
      const metadataEntries = new Map<string, SelectedAsset>();
      collected.forEach((item) => {
        metadataEntries.set(item.assetId, item);
      });
      metadataAssets = Array.from(metadataEntries.values());
    }
  } else {
    collected = aggregateInventoryItems(
      inventoriesForUser,
      catalogState,
      snapshot.appState,
      selection,
      warnings,
      normalizedItemFilter,
      seenAssets
    );
    if (originalPrizeSelection.assets.length > 0) {
      collected = [...originalPrizeSelection.assets, ...collected];
    }
    includedPullIds = collectPullIdsForSelection(snapshot.pullHistory, normalizedUserId, selection);
    if (includedPullIds.size > 0) {
      historySelectionDetails = collectHistoryMetadataForPullIds(
        snapshot.pullHistory,
        normalizedUserId,
        Array.from(includedPullIds)
      );
    }
    const metadataEntries = new Map<string, SelectedAsset>();
    collected.forEach((item) => {
      metadataEntries.set(item.assetId, item);
    });
    metadataAssets = Array.from(metadataEntries.values());
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
    const catalogSummary = buildCatalogSummary(catalogState, snapshot.appState, rarityState, selection, metadataAssets);
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

    if (catalogSummary.length > 0) {
      metaFolder.file(
        'catalog.json',
        JSON.stringify(
          {
            version: 1,
            generatedAt,
            gachas: catalogSummary
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
    }

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
  const originalPrizeMissingPullIds = Array.from(originalPrizeSelection.missingPullIds);

  return {
    blob,
    fileName,
    fileCount: availableRecords.length,
    warnings: Array.from(warnings),
    pullIds,
    originalPrizeMissingPullIds
  };
}
