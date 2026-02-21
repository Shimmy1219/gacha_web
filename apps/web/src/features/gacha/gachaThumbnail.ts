const GACHA_THUMBNAIL_MIME_TYPES = new Set(['image/png', 'image/jpeg']);
const GACHA_THUMBNAIL_EXTENSIONS = ['.png', '.jpg', '.jpeg'] as const;

function normalizeFileName(fileName: string): string {
  return fileName.trim().toLowerCase();
}

function hasSupportedGachaThumbnailExtension(fileName: string): boolean {
  const normalized = normalizeFileName(fileName);
  return GACHA_THUMBNAIL_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

async function loadImageDimensionsFromUrl(url: string): Promise<{ width: number; height: number } | null> {
  if (typeof Image === 'undefined') {
    return null;
  }

  return await new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      resolve(
        Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
          ? { width, height }
          : null
      );
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/**
 * 画像Blobから縦横サイズを取得する。
 * `createImageBitmap` が使える環境ではそちらを優先し、未対応環境では `Image` へフォールバックする。
 *
 * @param blob サイズを調べたい画像Blob
 * @returns 取得できた場合は `{ width, height }`、失敗した場合は `null`
 */
export async function loadImageDimensionsFromBlob(
  blob: Blob
): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      const width = bitmap.width;
      const height = bitmap.height;
      bitmap.close();
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        return { width, height };
      }
    } catch {
      // 下のフォールバック処理へ進む。
    }
  }

  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return null;
  }

  const url = URL.createObjectURL(blob);
  try {
    return await loadImageDimensionsFromUrl(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * ファイルがガチャサムネイルとして許可される形式かを判定する。
 * 許可形式は PNG/JPEG（`.png` / `.jpg` / `.jpeg`）。
 *
 * @param file 判定対象のファイル
 * @returns 許可形式なら `true`
 */
export function isSupportedGachaThumbnailFile(file: File): boolean {
  const normalizedType = file.type.trim().toLowerCase();
  if (GACHA_THUMBNAIL_MIME_TYPES.has(normalizedType)) {
    return true;
  }
  return hasSupportedGachaThumbnailExtension(file.name);
}

export interface GachaThumbnailValidationResult {
  ok: boolean;
  message?: string;
}

/**
 * ガチャサムネイル用ファイルのバリデーションを実施する。
 * 現在は「PNG/JPEGであること」と「正方形であること」を必須条件とする。
 *
 * @param file ユーザーが選択したファイル
 * @returns バリデーション結果
 */
export async function validateGachaThumbnailFile(file: File): Promise<GachaThumbnailValidationResult> {
  if (!isSupportedGachaThumbnailFile(file)) {
    return {
      ok: false,
      message: '配信サムネイルには正方形のPNGまたはJPGのみ設定できます。'
    };
  }

  const dimensions = await loadImageDimensionsFromBlob(file);
  if (!dimensions) {
    return {
      ok: false,
      message: '画像サイズを確認できませんでした。別の画像でお試しください。'
    };
  }

  if (dimensions.width !== dimensions.height) {
    return {
      ok: false,
      message: `正方形の画像のみ設定できます（現在: ${dimensions.width}x${dimensions.height}）。`
    };
  }

  return { ok: true };
}
