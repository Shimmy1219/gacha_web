export type DigitalItemTypeKey =
  | 'icon-ring'
  | 'normal-icon'
  | 'audio'
  | 'iriam-header'
  | 'x-header'
  | 'nepuri'
  | 'smartphone-wallpaper'
  | 'simeji-background'
  | 'video'
  | 'other';

export interface DigitalItemTypeOption {
  value: DigitalItemTypeKey;
  label: string;
}

export const DIGITAL_ITEM_TYPE_OPTIONS: DigitalItemTypeOption[] = [
  { value: 'icon-ring', label: 'アイコンリング' },
  { value: 'normal-icon', label: '通常アイコン' },
  { value: 'audio', label: '音声' },
  { value: 'iriam-header', label: 'IRIAMヘッダー' },
  { value: 'x-header', label: 'Xヘッダー' },
  { value: 'nepuri', label: 'ネップリ' },
  { value: 'smartphone-wallpaper', label: 'スマホ壁紙' },
  { value: 'simeji-background', label: 'Simeji背景' },
  { value: 'video', label: '動画' },
  { value: 'other', label: 'その他' }
];

const DIGITAL_ITEM_TYPE_LABEL_MAP: Record<DigitalItemTypeKey, string> = DIGITAL_ITEM_TYPE_OPTIONS.reduce(
  (accumulator, option) => {
    accumulator[option.value] = option.label;
    return accumulator;
  },
  {} as Record<DigitalItemTypeKey, string>
);

export function getDigitalItemTypeLabel(type: DigitalItemTypeKey): string {
  return DIGITAL_ITEM_TYPE_LABEL_MAP[type] ?? 'その他';
}

export function isDigitalItemTypeKey(value: unknown): value is DigitalItemTypeKey {
  return typeof value === 'string' && (value in DIGITAL_ITEM_TYPE_LABEL_MAP);
}

export function normalizeDigitalItemType(value: unknown): DigitalItemTypeKey | null {
  return isDigitalItemTypeKey(value) ? value : null;
}

function isCloseRatio(actual: number, target: number, relativeTolerance: number): boolean {
  if (!Number.isFinite(actual) || !Number.isFinite(target) || target <= 0) {
    return false;
  }
  return Math.abs(actual - target) / target <= relativeTolerance;
}

function inferFromImageAspectRatio(params: {
  width: number;
  height: number;
  mimeType?: string | null;
}): DigitalItemTypeKey {
  const { width, height, mimeType } = params;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'other';
  }

  const ratio = width / height;

  // 1) wide headers
  if (isCloseRatio(ratio, 3 / 1, 0.08)) {
    return 'x-header';
  }
  if (isCloseRatio(ratio, 16 / 9, 0.08) || isCloseRatio(ratio, 21 / 9, 0.1)) {
    return 'iriam-header';
  }
  if (isCloseRatio(ratio, 7 / 5, 0.08)) {
    return 'nepuri';
  }

  // 2) portrait backgrounds
  if (
    isCloseRatio(ratio, 9 / 16, 0.14) ||
    isCloseRatio(ratio, 9 / 19.5, 0.16) ||
    isCloseRatio(ratio, 9 / 20, 0.16)
  ) {
    return 'smartphone-wallpaper';
  }
  if (isCloseRatio(ratio, 3 / 4, 0.14) || isCloseRatio(ratio, 2 / 3, 0.14)) {
    return 'simeji-background';
  }

  // 3) square-like (icon/icon-ring)
  if (isCloseRatio(ratio, 1 / 1, 0.06)) {
    const normalizedMime = typeof mimeType === 'string' ? mimeType.toLowerCase() : '';
    // アイコンリングは透過PNGで配布されることが多い前提で、PNG/WebP/GIFを優先して推定する。
    if (normalizedMime.includes('png') || normalizedMime.includes('webp') || normalizedMime.includes('gif')) {
      return 'icon-ring';
    }
    return 'normal-icon';
  }

  return 'other';
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

async function loadImageDimensionsFromBlob(blob: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      const width = bitmap.width;
      const height = bitmap.height;
      bitmap.close();
      return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null;
    } catch {
      // fallback below
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

export async function inferDigitalItemTypeFromBlob(params: {
  blob: Blob;
  mimeType?: string | null;
  kindHint?: 'image' | 'video' | 'audio' | 'text' | 'other';
}): Promise<DigitalItemTypeKey> {
  const mimeType = params.mimeType ?? params.blob.type ?? null;
  const kindHint = params.kindHint ?? 'other';

  const normalizedMime = typeof mimeType === 'string' ? mimeType.toLowerCase() : '';

  if (kindHint === 'audio' || normalizedMime.startsWith('audio/')) {
    return 'audio';
  }
  if (kindHint === 'video' || normalizedMime.startsWith('video/')) {
    return 'video';
  }
  if (kindHint !== 'image' && !normalizedMime.startsWith('image/')) {
    return 'other';
  }

  const dimensions = await loadImageDimensionsFromBlob(params.blob);
  if (!dimensions) {
    return 'other';
  }

  return inferFromImageAspectRatio({ ...dimensions, mimeType });
}

export async function inferDigitalItemTypeFromImageUrl(params: {
  url: string | null;
  mimeType?: string | null;
}): Promise<DigitalItemTypeKey> {
  if (!params.url) {
    return 'other';
  }
  const dimensions = await loadImageDimensionsFromUrl(params.url);
  if (!dimensions) {
    return 'other';
  }
  return inferFromImageAspectRatio({ ...dimensions, mimeType: params.mimeType });
}
