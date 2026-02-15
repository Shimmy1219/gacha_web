import type { ReceiveMediaItem } from './types';
import {
  loadHistoryThumbnailBlobMap,
  saveHistoryThumbnails,
  type ReceiveHistoryThumbnailRecord
} from './historyStorage';

interface DrawableImageLike {
  width: number;
  height: number;
}

interface GeneratedThumbnail {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string | null;
}

export interface EnsureReceiveHistoryThumbnailsResult {
  thumbnailBlobByAssetId: Map<string, Blob>;
  generatedAssetIds: string[];
}

interface EnsureReceiveHistoryThumbnailsParams {
  entryId: string;
  mediaItems: ReceiveMediaItem[];
  maxSize?: number;
  concurrency?: number;
}

function isImageMediaItem(item: ReceiveMediaItem): boolean {
  if (item.kind === 'image') {
    return true;
  }
  if (item.mimeType?.startsWith('image/')) {
    return true;
  }
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)$/i.test(item.filename);
}

export function resolveReceiveMediaAssetId(item: ReceiveMediaItem): string | null {
  const metadataId = item.metadata?.id?.trim();
  if (metadataId) {
    return metadataId;
  }
  const directId = item.id?.trim();
  if (directId) {
    return directId;
  }
  return null;
}

function closeDrawable(drawable: DrawableImageLike): void {
  if (typeof (drawable as ImageBitmap).close === 'function') {
    try {
      (drawable as ImageBitmap).close();
    } catch {
      // ignore close failure
    }
  }
}

async function loadDrawableFromBlob(blob: Blob): Promise<DrawableImageLike> {
  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(blob);
  }

  if (typeof Image === 'undefined' || typeof URL === 'undefined') {
    throw new Error('画像サムネイルを生成できません（ブラウザAPIが不足しています）');
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      type,
      quality
    );
  });
}

async function generateThumbnailFromBlob(blob: Blob, maxSize: number): Promise<GeneratedThumbnail | null> {
  if (typeof document === 'undefined') {
    return null;
  }

  const drawable = await loadDrawableFromBlob(blob);
  try {
    const sourceWidth = Math.max(0, Math.floor(drawable.width));
    const sourceHeight = Math.max(0, Math.floor(drawable.height));
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return null;
    }

    const scale = Math.min(maxSize / sourceWidth, maxSize / sourceHeight, 1);
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(drawable as CanvasImageSource, 0, 0, targetWidth, targetHeight);

    const webpBlob = await canvasToBlob(canvas, 'image/webp', 0.75);
    if (webpBlob) {
      return {
        blob: webpBlob,
        width: targetWidth,
        height: targetHeight,
        mimeType: webpBlob.type || 'image/webp'
      };
    }
    const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', 0.8);
    if (jpegBlob) {
      return {
        blob: jpegBlob,
        width: targetWidth,
        height: targetHeight,
        mimeType: jpegBlob.type || 'image/jpeg'
      };
    }
    const pngBlob = await canvasToBlob(canvas, 'image/png', 0.9);
    if (!pngBlob) {
      return null;
    }
    return {
      blob: pngBlob,
      width: targetWidth,
      height: targetHeight,
      mimeType: pngBlob.type || 'image/png'
    };
  } finally {
    closeDrawable(drawable);
  }
}

async function runWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R | null>
): Promise<R[]> {
  if (values.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.floor(concurrency));
  const results: R[] = [];
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < values.length) {
      const currentIndex = cursor;
      cursor += 1;
      const result = await worker(values[currentIndex]);
      if (result !== null) {
        results.push(result);
      }
    }
  };

  const runners = Array.from({ length: Math.min(limit, values.length) }, () => runWorker());
  await Promise.all(runners);
  return results;
}

export async function ensureReceiveHistoryThumbnailsForEntry({
  entryId,
  mediaItems,
  maxSize = 128,
  concurrency = 2
}: EnsureReceiveHistoryThumbnailsParams): Promise<EnsureReceiveHistoryThumbnailsResult> {
  const thumbnailBlobByAssetId = await loadHistoryThumbnailBlobMap(entryId);

  const candidateMap = new Map<string, ReceiveMediaItem>();
  mediaItems.forEach((item) => {
    if (!isImageMediaItem(item)) {
      return;
    }
    const assetId = resolveReceiveMediaAssetId(item);
    if (!assetId || thumbnailBlobByAssetId.has(assetId) || candidateMap.has(assetId)) {
      return;
    }
    candidateMap.set(assetId, item);
  });

  const timestamp = new Date().toISOString();
  const candidates = Array.from(candidateMap.entries());
  const generatedRecords = await runWithConcurrency(
    candidates,
    concurrency,
    async ([assetId, item]): Promise<ReceiveHistoryThumbnailRecord | null> => {
      try {
        const generated = await generateThumbnailFromBlob(item.blob, maxSize);
        if (!generated) {
          return null;
        }
        thumbnailBlobByAssetId.set(assetId, generated.blob);
        return {
          entryId,
          assetId,
          blob: generated.blob,
          width: generated.width,
          height: generated.height,
          mimeType: generated.mimeType,
          createdAt: timestamp,
          updatedAt: timestamp
        };
      } catch (error) {
        console.warn('Failed to generate receive thumbnail', { entryId, assetId, error });
        return null;
      }
    }
  );

  if (generatedRecords.length > 0) {
    await saveHistoryThumbnails(generatedRecords);
  }

  return {
    thumbnailBlobByAssetId,
    generatedAssetIds: generatedRecords.map((record) => record.assetId)
  };
}
