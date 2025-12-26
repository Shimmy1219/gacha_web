import JSZip from 'jszip';

import type { ReceiveMediaItem } from './types';

const DEFAULT_SHARE_FILE_TYPE = 'application/octet-stream';
const MAX_WEB_SHARE_FILE_COUNT = 30;
const MAX_WEB_SHARE_TOTAL_BYTES = 200 * 1024 * 1024;
const BULK_SHARE_TITLE = '受け取りファイル';
const BULK_ARCHIVE_FILENAME = 'received_files.zip';

function normalizeZipPath(path: string): string {
  return path.replace(/^\.\//, '').replace(/^\//, '');
}

export function deriveReceiveDownloadFilename(item: Pick<ReceiveMediaItem, 'path' | 'filename'>): string {
  if (item.path) {
    const normalizedPath = normalizeZipPath(item.path);
    const withoutItemsPrefix = normalizedPath.startsWith('items/')
      ? normalizedPath.slice('items/'.length)
      : normalizedPath;
    const sanitized = withoutItemsPrefix.replace(/\/+/g, '__').replace(/__+/g, '__');
    if (sanitized.trim().length > 0) {
      return sanitized;
    }
  }
  return item.filename;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function createShareFile(filename: string, blob: Blob): File | null {
  if (typeof File === 'undefined') {
    return null;
  }
  try {
    return new File([blob], filename, { type: blob.type || DEFAULT_SHARE_FILE_TYPE });
  } catch (error) {
    console.warn('Failed to create share file', error);
    return null;
  }
}

async function shareFilesIfPossible(files: File[], title: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function' || files.length === 0) {
    return false;
  }
  try {
    if (navigator.canShare({ files })) {
      await navigator.share({ files, title });
      return true;
    }
  } catch (error) {
    console.warn('Web Share API failed', error);
  }
  return false;
}

async function saveOneWithShare(filename: string, blob: Blob): Promise<void> {
  const file = createShareFile(filename, blob);
  if (file) {
    const shared = await shareFilesIfPossible([file], filename);
    if (shared) {
      return;
    }
  }
  triggerBlobDownload(blob, filename);
}

export async function saveReceiveItem(item: ReceiveMediaItem): Promise<void> {
  const filename = deriveReceiveDownloadFilename(item);
  await saveOneWithShare(filename, item.blob);
}

export async function saveReceiveItems(items: ReceiveMediaItem[]): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const canUseWebShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && typeof File !== 'undefined';
  if (canUseWebShare) {
    const files: File[] = [];
    let totalSize = 0;
    for (const item of items) {
      const filename = deriveReceiveDownloadFilename(item);
      const file = createShareFile(filename, item.blob);
      if (!file) {
        files.length = 0;
        break;
      }
      files.push(file);
      totalSize += item.blob.size;
      if (files.length >= MAX_WEB_SHARE_FILE_COUNT || totalSize > MAX_WEB_SHARE_TOTAL_BYTES) {
        break;
      }
    }

    const shared = await shareFilesIfPossible(files, BULK_SHARE_TITLE);
    if (shared) {
      return;
    }
  }

  const zip = new JSZip();
  for (const item of items) {
    const filename = deriveReceiveDownloadFilename(item);
    zip.file(filename, item.blob, { binary: true, compression: 'STORE' });
  }
  const archiveBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  await saveOneWithShare(BULK_ARCHIVE_FILENAME, archiveBlob);
}
