import JSZip, { JSZipObject } from 'jszip';

import type { ReceiveItemMetadata, ReceiveMediaItem, ReceiveMediaKind } from './types';
import { inferDigitalItemTypeFromBlob, normalizeDigitalItemType } from '@domain/digital-items/digitalItemTypes';

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
  const metaEntry = Object.values(zip.files).find(
    (entry) => !entry.dir && entry.name.endsWith('meta/items.json')
  );
  if (!metaEntry) {
    return {};
  }

  try {
    const jsonText = await metaEntry.async('string');
    const parsed = JSON.parse(jsonText) as Record<string, Omit<ReceiveItemMetadata, 'id'>>;
    const mapped: Record<string, ReceiveItemMetadata> = {};
    for (const [id, metadata] of Object.entries(parsed)) {
      const digitalItemType = normalizeDigitalItemType((metadata as { digitalItemType?: unknown }).digitalItemType) ?? undefined;
      const isRiagu = Boolean((metadata as { isRiagu?: unknown }).isRiagu);
      mapped[id] = {
        id,
        ...metadata,
        filePath: typeof metadata.filePath === 'string' ? metadata.filePath : null,
        gachaId: typeof metadata.gachaId === 'string' ? metadata.gachaId : metadata.gachaId ?? null,
        itemId: typeof metadata.itemId === 'string' ? metadata.itemId : metadata.itemId ?? null,
        rarityColor: metadata.rarityColor ?? null,
        digitalItemType: isRiagu ? undefined : digitalItemType,
        isOmitted: Boolean(metadata.isOmitted)
      };
    }
    return mapped;
  } catch (error) {
    console.error('Failed to parse items metadata', error);
    return {};
  }
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
  onProgress?: (processed: number, total: number) => void
): Promise<ReceiveMediaItem[]> {
  if (metadataEntries.length > 0) {
    const mediaItems: ReceiveMediaItem[] = [];
    const total = metadataEntries.length;
    let processed = 0;

    for (const metadata of metadataEntries) {
      const isRiaguItem = Boolean(metadata.isRiagu);
      if (!metadata.filePath) {
        metadata.digitalItemType = isRiaguItem
          ? undefined
          : normalizeDigitalItemType(metadata.digitalItemType) ?? 'other';
        processed += 1;
        onProgress?.(processed, total);
        continue;
      }
      const entry = findZipObjectByRelativePath(zip, metadata.filePath);
      if (!entry) {
        metadata.digitalItemType = isRiaguItem
          ? undefined
          : normalizeDigitalItemType(metadata.digitalItemType) ?? 'other';
        processed += 1;
        onProgress?.(processed, total);
        continue;
      }

      const blobEntry = await entry.async('blob');
      const filename = entry.name.split('/').pop() ?? entry.name;
      const mimeType = blobEntry.type || undefined;
      const kind = detectMediaKind(filename, mimeType);
      const digitalItemType =
        isRiaguItem
          ? undefined
          : normalizeDigitalItemType(metadata.digitalItemType) ??
            (await inferDigitalItemTypeFromBlob({
              blob: blobEntry,
              mimeType,
              kindHint: kind === 'image' ? 'image' : kind === 'video' ? 'video' : kind === 'audio' ? 'audio' : 'other'
            }));
      metadata.digitalItemType = digitalItemType;
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
    processed += 1;
    onProgress?.(processed, total);
  }

  return mediaItems;
}

export async function extractReceiveMediaItems(
  blob: Blob,
  onProgress?: (processed: number, total: number) => void
): Promise<ReceiveMediaItem[]> {
  const zip = await JSZip.loadAsync(blob);
  const metadataMap = await loadItemsMetadata(zip);
  const metadataEntries = Object.values(metadataMap);
  return extractReceiveMediaItemsFromZip(zip, metadataEntries, onProgress);
}

export async function loadReceiveZipInventory(
  blob: Blob,
  onProgress?: (processed: number, total: number) => void
): Promise<{ metadataEntries: ReceiveItemMetadata[]; mediaItems: ReceiveMediaItem[]; catalog: ReceiveCatalogGacha[] }> {
  const zip = await JSZip.loadAsync(blob);
  const metadataMap = await loadItemsMetadata(zip);
  const metadataEntries = Object.values(metadataMap);
  const mediaItems = await extractReceiveMediaItemsFromZip(zip, metadataEntries, onProgress);
  const catalog = await loadCatalogMetadata(zip);
  return { metadataEntries, mediaItems, catalog };
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

export async function loadReceiveZipPullIds(blob: Blob): Promise<string[]> {
  try {
    const zip = await JSZip.loadAsync(blob);
    const selection = await loadSelectionMetadata(zip);
    return resolvePullIds(selection);
  } catch (error) {
    console.error('Failed to parse receive zip pull ids', error);
    return [];
  }
}

export async function loadReceiveZipItemMetadata(blob: Blob): Promise<ReceiveItemMetadata[]> {
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
  blob: Blob
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

export async function loadReceiveZipSummary(blob: Blob): Promise<ReceiveZipSummary | null> {
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
