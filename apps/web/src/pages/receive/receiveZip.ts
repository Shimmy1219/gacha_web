import JSZip, { JSZipObject } from 'jszip';

import type { ReceiveItemMetadata, ReceiveMediaItem, ReceiveMediaKind } from './types';
import {
  type DigitalItemTypeKey,
  inferDigitalItemTypeFromBlob,
  normalizeDigitalItemType
} from '@domain/digital-items/digitalItemTypes';

interface SelectionMetadataPayload {
  user?: { displayName?: string };
  owner?: { displayName?: string };
  pullIds?: string[];
  historyPulls?: Array<{ pullId?: string; pullCount?: number }>;
}

export interface ReceiveZipSummary {
  gachaNames: string[];
  itemNames: string[];
  pullCount: number | null;
  userName: string | null;
  ownerName: string | null;
  itemCount: number;
  pullIds: string[];
}

interface CatalogMetadataPayloadItem {
  itemId?: string;
  itemName?: string;
  rarityId?: string;
  rarityLabel?: string;
  rarityColor?: string | null;
  isRiagu?: boolean;
  assetCount?: number;
  order?: number;
}

interface CatalogMetadataPayloadGacha {
  gachaId?: string;
  gachaName?: string;
  items?: CatalogMetadataPayloadItem[];
}

interface CatalogMetadataPayload {
  version?: number;
  generatedAt?: string;
  gachas?: CatalogMetadataPayloadGacha[];
}

export interface ReceiveCatalogItem {
  itemId: string | null;
  itemName: string;
  rarityId: string | null;
  rarityLabel: string | null;
  rarityColor: string | null;
  isRiagu: boolean;
  assetCount: number;
  order: number | null;
}

export interface ReceiveCatalogGacha {
  gachaId: string | null;
  gachaName: string;
  items: ReceiveCatalogItem[];
}

type ReceiveZipProgressCallback = (processed: number, total: number) => void;

interface LoadReceiveZipInventoryOptions {
  onProgress?: ReceiveZipProgressCallback;
  migrateDigitalItemTypes?: boolean;
  includeMedia?: boolean;
  metadataFilter?: (metadata: ReceiveItemMetadata) => boolean;
}

interface ItemsMetadataLoadResult {
  metadataMap: Record<string, ReceiveItemMetadata>;
  rawMap: Record<string, Record<string, unknown>> | null;
  entryName: string | null;
}

type ReceiveZipInput = Blob | ArrayBuffer | Uint8Array;

function detectMediaKind(filename: string, mimeType?: string): ReceiveMediaKind {
  const lower = filename.toLowerCase();
  if (mimeType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(lower)) {
    return 'image';
  }
  if (mimeType?.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(lower)) {
    return 'video';
  }
  if (mimeType?.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg)$/i.test(lower)) {
    return 'audio';
  }
  if (/\.(txt|json|md)$/i.test(lower)) {
    return 'text';
  }
  return 'other';
}

function resolveKindHint(kind: ReceiveMediaKind): 'image' | 'video' | 'audio' | 'other' {
  if (kind === 'image') {
    return 'image';
  }
  if (kind === 'video') {
    return 'video';
  }
  if (kind === 'audio') {
    return 'audio';
  }
  return 'other';
}

function normalizeZipPath(path: string): string {
  return path.replace(/^\.\//, '').replace(/^\//, '');
}

function findZipObjectByRelativePath(zip: JSZip, relativePath: string): JSZipObject | undefined {
  const normalized = normalizeZipPath(relativePath);
  const direct = zip.file(normalized);
  if (direct) {
    return direct;
  }

  const candidates = Object.values(zip.files).filter((entry) => !entry.dir);
  return candidates.find((entry) => entry.name === normalized || entry.name.endsWith(`/${normalized}`));
}

async function loadItemsMetadata(zip: JSZip): Promise<Record<string, ReceiveItemMetadata>> {
  const result = await loadItemsMetadataWithSource(zip);
  return result.metadataMap;
}

async function loadItemsMetadataWithSource(zip: JSZip): Promise<ItemsMetadataLoadResult> {
  const metaEntry = Object.values(zip.files).find(
    (entry) => !entry.dir && entry.name.endsWith('meta/items.json')
  );
  if (!metaEntry) {
    return {
      metadataMap: {},
      rawMap: null,
      entryName: null
    };
  }

  try {
    const jsonText = await metaEntry.async('string');
    const parsed = JSON.parse(jsonText) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        metadataMap: {},
        rawMap: null,
        entryName: metaEntry.name
      };
    }

    const sourceMap = parsed as Record<string, unknown>;
    const mapped: Record<string, ReceiveItemMetadata> = {};
    const rawMap: Record<string, Record<string, unknown>> = {};

    for (const [id, metadata] of Object.entries(sourceMap)) {
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        continue;
      }
      const rawMetadata = { ...(metadata as Record<string, unknown>) };
      rawMap[id] = rawMetadata;

      const typedMetadata = rawMetadata as Omit<ReceiveItemMetadata, 'id'>;
      const digitalItemType = normalizeDigitalItemType(rawMetadata.digitalItemType) ?? undefined;
      const isRiagu = Boolean(rawMetadata.isRiagu);
      mapped[id] = {
        id,
        ...typedMetadata,
        filePath: typeof typedMetadata.filePath === 'string' ? typedMetadata.filePath : null,
        gachaId: typeof typedMetadata.gachaId === 'string' ? typedMetadata.gachaId : typedMetadata.gachaId ?? null,
        itemId: typeof typedMetadata.itemId === 'string' ? typedMetadata.itemId : typedMetadata.itemId ?? null,
        rarityColor: typedMetadata.rarityColor ?? null,
        digitalItemType: isRiagu ? undefined : digitalItemType,
        isOmitted: Boolean(typedMetadata.isOmitted)
      };
    }

    return {
      metadataMap: mapped,
      rawMap,
      entryName: metaEntry.name
    };
  } catch (error) {
    console.error('Failed to parse items metadata', error);
    return {
      metadataMap: {},
      rawMap: null,
      entryName: metaEntry.name
    };
  }
}

async function migrateItemsMetadataDigitalItemTypes(
  zip: JSZip,
  metadataEntries: ReceiveItemMetadata[],
  rawMap: Record<string, Record<string, unknown>> | null,
  entryName: string | null
): Promise<boolean> {
  if (!rawMap || !entryName || metadataEntries.length === 0) {
    return false;
  }

  let changed = false;

  for (const metadata of metadataEntries) {
    const rawMetadata = rawMap[metadata.id];
    if (!rawMetadata) {
      continue;
    }

    const hasDigitalItemTypeKey = Object.prototype.hasOwnProperty.call(rawMetadata, 'digitalItemType');
    const isRiaguItem = Boolean(rawMetadata.isRiagu ?? metadata.isRiagu);
    metadata.isRiagu = isRiaguItem;

    if (isRiaguItem) {
      metadata.digitalItemType = undefined;
      if (hasDigitalItemTypeKey) {
        delete rawMetadata.digitalItemType;
        changed = true;
      }
      continue;
    }

    const normalizedType = normalizeDigitalItemType(rawMetadata.digitalItemType);
    if (normalizedType) {
      metadata.digitalItemType = normalizedType;
      if (rawMetadata.digitalItemType !== normalizedType) {
        rawMetadata.digitalItemType = normalizedType;
        changed = true;
      }
      continue;
    }

    let inferred: DigitalItemTypeKey = 'other';
    if (metadata.filePath) {
      const entry = findZipObjectByRelativePath(zip, metadata.filePath);
      if (entry) {
        try {
          const blobEntry = await entry.async('blob');
          const filename = entry.name.split('/').pop() ?? entry.name;
          const mimeType = blobEntry.type || undefined;
          inferred = await inferDigitalItemTypeFromBlob({
            blob: blobEntry,
            mimeType,
            fileName: filename,
            kindHint: resolveKindHint(detectMediaKind(filename, mimeType))
          });
        } catch (error) {
          console.warn('Failed to infer digital item type while migrating receive zip item metadata', {
            metadataId: metadata.id,
            error
          });
        }
      }
    }

    if (!hasDigitalItemTypeKey || rawMetadata.digitalItemType !== inferred) {
      changed = true;
      rawMetadata.digitalItemType = inferred;
    }
    metadata.digitalItemType = inferred;
  }

  if (!changed) {
    return false;
  }

  zip.file(entryName, JSON.stringify(rawMap, null, 2), {
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  return true;
}

async function loadCatalogMetadata(zip: JSZip): Promise<ReceiveCatalogGacha[]> {
  const catalogEntry = Object.values(zip.files).find(
    (entry) => !entry.dir && entry.name.endsWith('meta/catalog.json')
  );
  if (!catalogEntry) {
    return [];
  }

  try {
    const jsonText = await catalogEntry.async('string');
    const parsed = JSON.parse(jsonText) as CatalogMetadataPayload;
    const gachas = Array.isArray(parsed.gachas) ? parsed.gachas : [];
    return gachas
      .map((gacha): ReceiveCatalogGacha | null => {
        const gachaId = typeof gacha.gachaId === 'string' ? gacha.gachaId.trim() : null;
        const gachaName =
          typeof gacha.gachaName === 'string' && gacha.gachaName.trim()
            ? gacha.gachaName.trim()
            : gachaId ?? '不明なガチャ';
        const items = Array.isArray(gacha.items)
          ? gacha.items
              .map((item): ReceiveCatalogItem | null => {
                const itemName =
                  typeof item.itemName === 'string' && item.itemName.trim()
                    ? item.itemName.trim()
                    : '';
                if (!itemName) {
                  return null;
                }
                const itemId = typeof item.itemId === 'string' ? item.itemId.trim() : null;
                const rarityId = typeof item.rarityId === 'string' ? item.rarityId.trim() : null;
                const rarityLabel = typeof item.rarityLabel === 'string' ? item.rarityLabel : null;
                const rarityColor = typeof item.rarityColor === 'string' ? item.rarityColor : null;
                const assetCount =
                  typeof item.assetCount === 'number' && Number.isFinite(item.assetCount)
                    ? Math.max(0, Math.floor(item.assetCount))
                    : 0;
                const order =
                  typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : null;
                return {
                  itemId,
                  itemName,
                  rarityId,
                  rarityLabel,
                  rarityColor,
                  isRiagu: Boolean(item.isRiagu),
                  assetCount,
                  order
                };
              })
              .filter((item): item is ReceiveCatalogItem => Boolean(item))
          : [];
        if (items.length === 0) {
          return null;
        }
        return { gachaId, gachaName, items };
      })
      .filter((gacha): gacha is ReceiveCatalogGacha => Boolean(gacha));
  } catch (error) {
    console.error('Failed to parse catalog metadata', error);
    return [];
  }
}

async function extractReceiveMediaItemsFromZip(
  zip: JSZip,
  metadataEntries: ReceiveItemMetadata[],
  onProgress?: ReceiveZipProgressCallback
): Promise<ReceiveMediaItem[]> {
  if (metadataEntries.length > 0) {
    const mediaItems: ReceiveMediaItem[] = [];
    const total = metadataEntries.length;
    let processed = 0;

    for (const metadata of metadataEntries) {
      const isRiaguItem = Boolean(metadata.isRiagu);
      metadata.digitalItemType = isRiaguItem
        ? undefined
        : normalizeDigitalItemType(metadata.digitalItemType) ?? undefined;
      if (!metadata.filePath) {
        processed += 1;
        onProgress?.(processed, total);
        continue;
      }
      const entry = findZipObjectByRelativePath(zip, metadata.filePath);
      if (!entry) {
        processed += 1;
        onProgress?.(processed, total);
        continue;
      }

      try {
        const blobEntry = await entry.async('blob');
        const filename = entry.name.split('/').pop() ?? entry.name;
        const mimeType = blobEntry.type || undefined;
        const kind = detectMediaKind(filename, mimeType);
        mediaItems.push({
          id: metadata.id,
          path: entry.name,
          filename,
          size: blobEntry.size,
          blob: blobEntry,
          mimeType,
          kind,
          metadata
        });
      } catch (error) {
        console.warn('Failed to extract receive media entry', {
          metadataId: metadata.id,
          filePath: metadata.filePath,
          error
        });
      }
      processed += 1;
      onProgress?.(processed, total);
    }

    return mediaItems;
  }

  const entries = Object.entries(zip.files).filter(([, file]) => !file.dir && /\/items\//.test(file.name));
  const total = entries.length;
  let processed = 0;
  const mediaItems: ReceiveMediaItem[] = [];

  for (const [path, file] of entries) {
    const filename = path.split('/').pop() ?? path;
    const lowerFilename = filename.toLowerCase();

    if (path.startsWith('__MACOSX/') || lowerFilename.endsWith('.json')) {
      processed += 1;
      onProgress?.(processed, total);
      continue;
    }

    try {
      const blobEntry = await file.async('blob');
      if (blobEntry.type === 'application/json') {
        processed += 1;
        onProgress?.(processed, total);
        continue;
      }

      const mimeType = blobEntry.type || undefined;
      mediaItems.push({
        id: path,
        path,
        filename,
        size: blobEntry.size,
        blob: blobEntry,
        mimeType,
        kind: detectMediaKind(filename, mimeType)
      });
    } catch (error) {
      console.warn('Failed to extract receive media fallback entry', {
        path,
        error
      });
    }
    processed += 1;
    onProgress?.(processed, total);
  }

  return mediaItems;
}

export async function extractReceiveMediaItems(
  blob: ReceiveZipInput,
  onProgress?: ReceiveZipProgressCallback
): Promise<ReceiveMediaItem[]> {
  const zip = await JSZip.loadAsync(blob);
  const metadataMap = await loadItemsMetadata(zip);
  const metadataEntries = Object.values(metadataMap);
  return extractReceiveMediaItemsFromZip(zip, metadataEntries, onProgress);
}

export async function loadReceiveZipInventory(
  blob: ReceiveZipInput,
  options?: ReceiveZipProgressCallback | LoadReceiveZipInventoryOptions
): Promise<{
  metadataEntries: ReceiveItemMetadata[];
  mediaItems: ReceiveMediaItem[];
  catalog: ReceiveCatalogGacha[];
  migratedBlob?: Blob;
}> {
  const resolvedOptions: LoadReceiveZipInventoryOptions =
    typeof options === 'function'
      ? { onProgress: options }
      : options ?? {};

  const zip = await JSZip.loadAsync(blob);
  const metadataBundle = await loadItemsMetadataWithSource(zip);
  const metadataMap = metadataBundle.metadataMap;
  const metadataEntries = Object.values(metadataMap);
  const filteredMetadataEntries =
    typeof resolvedOptions.metadataFilter === 'function'
      ? metadataEntries.filter((metadata) => resolvedOptions.metadataFilter?.(metadata))
      : metadataEntries;
  let migratedBlob: Blob | undefined;

  if (resolvedOptions.migrateDigitalItemTypes) {
    const migrated = await migrateItemsMetadataDigitalItemTypes(
      zip,
      metadataEntries,
      metadataBundle.rawMap,
      metadataBundle.entryName
    );
    if (migrated) {
      migratedBlob = await zip.generateAsync({ type: 'blob' });
    }
  }

  const includeMedia = resolvedOptions.includeMedia ?? true;
  let mediaItems: ReceiveMediaItem[] = [];
  if (includeMedia) {
    // When metadata is missing and a metadata filter is provided, we cannot safely
    // map fallback file entries to a group, so skip extraction.
    if (metadataEntries.length === 0 && typeof resolvedOptions.metadataFilter === 'function') {
      mediaItems = [];
    } else {
      const metadataForExtraction =
        typeof resolvedOptions.metadataFilter === 'function' ? filteredMetadataEntries : metadataEntries;
      mediaItems = await extractReceiveMediaItemsFromZip(zip, metadataForExtraction, resolvedOptions.onProgress);
    }
  }
  const catalog = await loadCatalogMetadata(zip);
  return { metadataEntries, mediaItems, catalog, migratedBlob };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const unique = new Set<string>();
  values.forEach((value) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed) {
      unique.add(trimmed);
    }
  });
  return Array.from(unique);
}

function resolvePullIds(payload: SelectionMetadataPayload | null): string[] {
  if (!payload) {
    return [];
  }
  const direct = Array.isArray(payload.pullIds) ? payload.pullIds : [];
  const history = Array.isArray(payload.historyPulls)
    ? payload.historyPulls.map((entry) => entry?.pullId ?? null)
    : [];
  return uniqueStrings([...direct, ...history]);
}

function resolveOwnerName(payload: SelectionMetadataPayload | null): string | null {
  if (!payload?.owner?.displayName) {
    return null;
  }
  const trimmed = payload.owner.displayName.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function loadSelectionMetadata(zip: JSZip): Promise<SelectionMetadataPayload | null> {
  const selectionEntry = Object.values(zip.files).find(
    (entry) => !entry.dir && entry.name.endsWith('meta/selection.json')
  );
  if (!selectionEntry) {
    return null;
  }
  try {
    const raw = await selectionEntry.async('string');
    return JSON.parse(raw) as SelectionMetadataPayload;
  } catch (error) {
    console.warn('Failed to parse receive selection metadata', error);
    return null;
  }
}

export async function loadReceiveZipPullIds(blob: ReceiveZipInput): Promise<string[]> {
  try {
    const zip = await JSZip.loadAsync(blob);
    const selection = await loadSelectionMetadata(zip);
    return resolvePullIds(selection);
  } catch (error) {
    console.error('Failed to parse receive zip pull ids', error);
    return [];
  }
}

export async function loadReceiveZipItemMetadata(blob: ReceiveZipInput): Promise<ReceiveItemMetadata[]> {
  try {
    const zip = await JSZip.loadAsync(blob);
    const metadataMap = await loadItemsMetadata(zip);
    return Object.values(metadataMap);
  } catch (error) {
    console.error('Failed to parse receive zip item metadata', error);
    return [];
  }
}

export async function loadReceiveZipSelectionInfo(
  blob: ReceiveZipInput
): Promise<{ pullIds: string[]; ownerName: string | null }> {
  try {
    const zip = await JSZip.loadAsync(blob);
    const selection = await loadSelectionMetadata(zip);
    return {
      pullIds: resolvePullIds(selection),
      ownerName: resolveOwnerName(selection)
    };
  } catch (error) {
    console.error('Failed to parse receive zip selection info', error);
    return { pullIds: [], ownerName: null };
  }
}

export async function loadReceiveZipSummary(blob: ReceiveZipInput): Promise<ReceiveZipSummary | null> {
  try {
    const zip = await JSZip.loadAsync(blob);
    const metadataMap = await loadItemsMetadata(zip);
    const metadataEntries = Object.values(metadataMap);

    const gachaNames = uniqueStrings(metadataEntries.map((item) => item.gachaName));
    const itemNames = uniqueStrings(metadataEntries.map((item) => item.itemName));
    const obtainedTotal = metadataEntries.reduce((sum, item) => {
      if (typeof item.obtainedCount === 'number' && Number.isFinite(item.obtainedCount)) {
        return sum + Math.max(0, item.obtainedCount);
      }
      return sum;
    }, 0);

    let pullCount: number | null = obtainedTotal > 0 ? obtainedTotal : null;
    let userName: string | null = null;

    const selection = await loadSelectionMetadata(zip);
    const pullIds = resolvePullIds(selection);
    const ownerName = resolveOwnerName(selection);
    if (selection) {
      if (typeof selection?.user?.displayName === 'string' && selection.user.displayName.trim()) {
        userName = selection.user.displayName.trim();
      }
      if (Array.isArray(selection?.historyPulls)) {
        const summed = selection.historyPulls.reduce((sum, entry) => {
          const value = typeof entry?.pullCount === 'number' && Number.isFinite(entry.pullCount)
            ? Math.max(0, entry.pullCount)
            : 0;
          return sum + value;
        }, 0);
        if (summed > 0) {
          pullCount = summed;
        }
      }
    }

    return {
      gachaNames,
      itemNames,
      pullCount,
      userName,
      ownerName,
      itemCount: metadataEntries.length,
      pullIds
    };
  } catch (error) {
    console.error('Failed to parse receive zip summary', error);
    return null;
  }
}
