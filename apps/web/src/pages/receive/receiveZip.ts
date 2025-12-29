import JSZip, { JSZipObject } from 'jszip';

import type { ReceiveItemMetadata, ReceiveMediaItem, ReceiveMediaKind } from './types';

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
      mapped[id] = { id, ...metadata, rarityColor: metadata.rarityColor ?? null };
    }
    return mapped;
  } catch (error) {
    console.error('Failed to parse items metadata', error);
    return {};
  }
}

export async function extractReceiveMediaItems(
  blob: Blob,
  onProgress?: (processed: number, total: number) => void
): Promise<ReceiveMediaItem[]> {
  const zip = await JSZip.loadAsync(blob);
  const metadataMap = await loadItemsMetadata(zip);
  const metadataEntries = Object.values(metadataMap);

  if (metadataEntries.length > 0) {
    const mediaItems: ReceiveMediaItem[] = [];
    const total = metadataEntries.length;
    let processed = 0;

    for (const metadata of metadataEntries) {
      const entry = findZipObjectByRelativePath(zip, metadata.filePath);
      if (!entry) {
        processed += 1;
        onProgress?.(processed, total);
        continue;
      }

      const blobEntry = await entry.async('blob');
      const filename = entry.name.split('/').pop() ?? entry.name;
      const mimeType = blobEntry.type || undefined;
      mediaItems.push({
        id: metadata.id,
        path: entry.name,
        filename,
        size: blobEntry.size,
        blob: blobEntry,
        mimeType,
        kind: detectMediaKind(filename, mimeType),
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
