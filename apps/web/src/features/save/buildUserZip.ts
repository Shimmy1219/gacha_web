import JSZip from 'jszip';

import type {
  GachaCatalogItemV3,
  GachaCatalogStateV3,
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
  gachaId: string;
  gachaName: string;
  itemId: string;
  itemName: string;
  rarityId: string;
}

interface BuildParams {
  snapshot: GachaLocalStorageSnapshot;
  selection: SaveTargetSelection;
  userId: string;
  userName: string;
}

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'video/mp4': '.mp4',
  'video/webm': '.webm'
};

function ensureBrowserEnvironment(): void {
  if (typeof window === 'undefined') {
    throw new Error('ブラウザ環境でのみ保存処理を実行できます');
  }
}

function sanitizePathComponent(value: string): string {
  const normalized = value.replace(/[\\/:*?"<>|]/g, '_').trim();
  return normalized.length > 0 ? normalized : 'unknown';
}

function guessExtension(record: StoredAssetRecord, _fallbackItem: SelectedAsset): string {
  if (record.name) {
    const matched = record.name.match(/\.([a-zA-Z0-9]+)$/);
    if (matched) {
      return `.${matched[1].toLowerCase()}`;
    }
  }
  const mime = record.type?.toLowerCase() ?? '';
  if (mime && MIME_EXTENSION_MAP[mime]) {
    return MIME_EXTENSION_MAP[mime];
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

const DEFAULT_USER_ID = generateDeterministicUserId('default-user');

function normalizeUserId(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : DEFAULT_USER_ID;
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
        selected.push({
          assetId,
          gachaId: snapshot.gachaId,
          gachaName,
          itemId,
          itemName: catalogItem.name ?? itemId,
          rarityId: catalogItem.rarityId ?? rarityId
        });
      });
    });
  });

  return selected;
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

function aggregateHistoryItems(
  snapshot: GachaLocalStorageSnapshot,
  selection: Extract<SaveTargetSelection, { mode: 'history' }>,
  warnings: Set<string>,
  normalizedTargetUserId: string
): { items: SelectedAsset[]; includedPullIds: Set<string> } {
  const history = snapshot.pullHistory;
  if (!history?.pulls) {
    return { items: [], includedPullIds: new Set<string>() };
  }

  const catalogState = snapshot.catalogState;
  const appState = snapshot.appState;
  const seenAssets = new Set<string>();
  const selected: SelectedAsset[] = [];
  const selectedIds = new Set(selection.pullIds);
  const includedPullIds = new Set<string>();

  Object.entries(history.pulls).forEach(([entryId, entry]) => {
    if (!entry || !selectedIds.has(entryId)) {
      return;
    }

    if (normalizeUserId(entry.userId) !== normalizedTargetUserId) {
      return;
    }

    const gachaId = entry.gachaId;
    const catalogGacha = gachaId ? catalogState?.byGacha?.[gachaId] : undefined;
    const gachaName = gachaId ? appState?.meta?.[gachaId]?.displayName ?? gachaId : 'unknown-gacha';

    let entryContributed = false;

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
      selected.push({
        assetId,
        gachaId,
        gachaName,
        itemId,
        itemName: catalogItem.name ?? itemId,
        rarityId: catalogItem.rarityId ?? 'unknown'
      });
      entryContributed = true;
    });

    if (entryContributed) {
      includedPullIds.add(entryId);
    }
  });

  return { items: selected, includedPullIds };
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
  const normalizedUserId = normalizeUserId(userId);

  let collected: SelectedAsset[] = [];
  let includedPullIds: Set<string> = new Set();
  if (selection.mode === 'history') {
    const aggregation = aggregateHistoryItems(snapshot, selection, warnings, normalizedUserId);
    collected = aggregation.items;
    includedPullIds = aggregation.includedPullIds;
  } else {
    collected = aggregateInventoryItems(inventoriesForUser, catalogState, snapshot.appState, selection, warnings);
    includedPullIds = collectPullIdsForSelection(snapshot.pullHistory, normalizedUserId, selection);
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
  const usedNames = new Set<string>();

  availableRecords.forEach(({ item, asset }) => {
    if (!itemsFolder) {
      return;
    }

    const gachaDir = itemsFolder.folder(sanitizePathComponent(item.gachaName));
    if (!gachaDir) {
      return;
    }

    const baseName = sanitizePathComponent(item.itemName || item.itemId);
    const extension = guessExtension(asset, item);
    let fileName = `${baseName}${extension}`;
    let counter = 1;
    while (usedNames.has(`${item.gachaId}/${fileName}`)) {
      fileName = `${baseName}_${counter}${extension}`;
      counter += 1;
    }
    usedNames.add(`${item.gachaId}/${fileName}`);

    gachaDir.file(fileName, asset.blob, {
      binary: true,
      compression: 'STORE'
    });
  });

  const pullIds = Array.from(includedPullIds);
  const metaFolder = zip.folder('meta');
  const generatedAt = new Date().toISOString();
  if (metaFolder) {
    if (catalogState) {
      metaFolder.file('catalog-state-v3.json', JSON.stringify(catalogState, null, 2), {
        date: new Date(generatedAt),
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });
    }
    if (rarityState) {
      metaFolder.file('rarity-state-v3.json', JSON.stringify(rarityState, null, 2), {
        date: new Date(generatedAt),
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });
    }

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
          pullIds
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
      JSON.stringify(
        availableRecords.map(({ item }) => ({
          assetId: item.assetId,
          gachaId: item.gachaId,
          gachaName: item.gachaName,
          itemId: item.itemId,
          itemName: item.itemName,
          rarityId: item.rarityId
        })),
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
