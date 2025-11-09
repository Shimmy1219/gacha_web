const MAX_PREVIEW_DIMENSION = 320;
const IMAGE_PREVIEW_TYPE = 'image/webp';
const IMAGE_PREVIEW_QUALITY = 0.75;
const VIDEO_PREVIEW_CAPTURE_FRACTION = 0.1;
const VIDEO_PREVIEW_FALLBACK_TIME = 0;

function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function clampPreviewDimensions(width: number, height: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }

  const scale = Math.min(1, MAX_PREVIEW_DIMENSION / Math.max(width, height));
  const scaledWidth = Math.max(1, Math.round(width * scale));
  const scaledHeight = Math.max(1, Math.round(height * scale));

  return { width: scaledWidth, height: scaledHeight };
}

async function bitmapFromImageBlob(blob: Blob): Promise<{ source: ImageBitmap | HTMLImageElement; revoke?: () => void }> {
  if (typeof window === 'undefined') {
    throw new Error('Image preview generation is only available in browser environments');
  }

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return { source: bitmap, revoke: () => bitmap.close() };
  }

  const url = URL.createObjectURL(blob);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = (event) => {
      URL.revokeObjectURL(url);
      reject(event instanceof ErrorEvent ? event.error : new Error('Failed to load image'));
    };
    element.src = url;
  });

  return {
    source: image,
    revoke: () => {
      URL.revokeObjectURL(url);
    }
  };
}

function drawSourceToCanvas(
  source: CanvasImageSource,
  width: number,
  height: number
): CanvasRenderingContext2D | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.drawImage(source, 0, 0, width, height);
  return context;
}

async function canvasToBlob(context: CanvasRenderingContext2D): Promise<Blob | null> {
  const canvas = context.canvas;
  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), IMAGE_PREVIEW_TYPE, IMAGE_PREVIEW_QUALITY);
  });
}

async function generateImagePreview(blob: Blob): Promise<Blob | null> {
  const { source, revoke } = await bitmapFromImageBlob(blob);
  try {
    const width = 'width' in source ? (source as ImageBitmap | HTMLImageElement).width : 0;
    const height = 'height' in source ? (source as ImageBitmap | HTMLImageElement).height : 0;
    const { width: targetWidth, height: targetHeight } = clampPreviewDimensions(width, height);

    if (targetWidth <= 0 || targetHeight <= 0) {
      return null;
    }

    const context = drawSourceToCanvas(source, targetWidth, targetHeight);
    if (!context) {
      return null;
    }

    return await canvasToBlob(context);
  } finally {
    if (typeof revoke === 'function') {
      revoke();
    }
  }
}

async function waitForVideoEvent(video: HTMLVideoElement, event: 'loadeddata' | 'seeked'): Promise<void> {
  return await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(event, handleSuccess);
      video.removeEventListener('error', handleError);
      video.removeEventListener('abort', handleError);
    };

    const handleSuccess = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error('Failed to prepare video for preview'));
    };

    video.addEventListener(event, handleSuccess, { once: true });
    video.addEventListener('error', handleError, { once: true });
    video.addEventListener('abort', handleError, { once: true });
  });
}

async function generateVideoPreview(blob: Blob): Promise<Blob | null> {
  if (typeof document === 'undefined') {
    return null;
  }

  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await waitForVideoEvent(video, 'loadeddata');

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
    const seekCandidate = duration
      ? Math.min(duration * VIDEO_PREVIEW_CAPTURE_FRACTION, Math.max(duration - 0.001, 0))
      : VIDEO_PREVIEW_FALLBACK_TIME;
    const seekTime = Math.max(seekCandidate, 0);

    if (seekTime > 0) {
      video.currentTime = seekTime;
      await waitForVideoEvent(video, 'seeked');
    }

    const { width: targetWidth, height: targetHeight } = clampPreviewDimensions(video.videoWidth, video.videoHeight);
    if (targetWidth <= 0 || targetHeight <= 0) {
      return null;
    }

    const context = drawSourceToCanvas(video, targetWidth, targetHeight);
    if (!context) {
      return null;
    }

    return await canvasToBlob(context);
  } catch (error) {
    console.warn('Failed to generate video preview', error);
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function generateAssetPreview(blob: Blob): Promise<Blob | null> {
  if (!isBrowserEnvironment()) {
    return null;
  }

  if (blob.type.startsWith('image/')) {
    try {
      return await generateImagePreview(blob);
    } catch (error) {
      console.warn('Failed to generate image preview', error);
      return null;
    }
  }

  if (blob.type.startsWith('video/')) {
    return await generateVideoPreview(blob);
  }

  return null;
}

export const __TESTING__ = {
  clampPreviewDimensions
};
