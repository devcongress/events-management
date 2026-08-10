import type { Event as CommunityEvent } from '@/types';

export const SOURCE_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const TARGET_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const OUTPUT_IMAGE_MAX_EDGE = 1600;
export const IMAGE_UPLOAD_ACCEPT = 'image/avif,image/jpeg,image/png,image/webp';
const IMAGE_UPLOAD_TYPES = new Set(['image/avif', 'image/jpeg', 'image/png', 'image/webp']);

export function validateMeetupImageFile(file: File): string | null {
  if (file.size > SOURCE_IMAGE_MAX_BYTES) {
    return 'Image must be 15MB or smaller before compression.';
  }

  if (!IMAGE_UPLOAD_TYPES.has(file.type)) {
    return 'Use an AVIF, JPEG, PNG, or WebP image.';
  }

  return null;
}

function compressedFileName(file: File, mimeType: string): string {
  const extension = mimeType === 'image/webp' ? 'webp' : 'jpg';
  const baseName = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'event-image';

  return `${baseName}.${extension}`;
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not compress this image'));
    }, mimeType, quality);
  });
}

async function loadImageSource(file: File): Promise<HTMLImageElement | ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, { imageOrientation: 'from-image' });
  }

  const imageUrl = URL.createObjectURL(file);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error('Could not read this image'));
    };
    img.src = imageUrl;
  });
}

let supportsWebpEncodingPromise: Promise<boolean> | null = null;

async function browserSupportsWebpEncoding(): Promise<boolean> {
  if (!supportsWebpEncodingPromise) {
    supportsWebpEncodingPromise = (async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const blob = await canvasToBlob(canvas, 'image/webp', 0.8).catch(() => null);
      return blob?.type === 'image/webp';
    })();
  }

  return supportsWebpEncodingPromise;
}

export async function compressMeetupImageForUpload(file: File): Promise<File> {
  const image = await loadImageSource(file);
  const sourceWidth = 'naturalWidth' in image ? image.naturalWidth : image.width;
  const sourceHeight = 'naturalHeight' in image ? image.naturalHeight : image.height;
  const scale = Math.min(1, OUTPUT_IMAGE_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new Error('Could not prepare image compression');
  }

  context.drawImage(image, 0, 0, width, height);
  if ('close' in image) image.close();

  const mimeType = await browserSupportsWebpEncoding() ? 'image/webp' : 'image/jpeg';
  const qualities = [0.82, 0.74, 0.66, 0.58];
  let bestBlob: Blob | null = null;

  for (const quality of qualities) {
    const blob = await canvasToBlob(canvas, mimeType, quality);
    bestBlob = blob;
    if (blob.size <= TARGET_IMAGE_MAX_BYTES) {
      break;
    }
  }

  if (!bestBlob) {
    throw new Error('Could not compress this image');
  }

  if (bestBlob.size > 5 * 1024 * 1024) {
    throw new Error('Compressed image is still over 5MB. Try a smaller image.');
  }

  return new File([bestBlob], compressedFileName(file, mimeType), {
    type: mimeType,
    lastModified: Date.now(),
  });
}

export function compressionSavingsPercent(originalFile: File, compressedFile: File): number {
  return originalFile.size > 0
    ? Math.max(0, Math.round((1 - compressedFile.size / originalFile.size) * 100))
    : 0;
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export async function uploadEventMedia(
  eventId: string,
  file: File,
  purpose: 'cover' | 'photo',
  onProgress?: (percent: number) => void,
): Promise<{ event: CommunityEvent | null; media: { url: string; type: 'cover' | 'photo' } | null }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('purpose', purpose);

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `/api/events/${eventId}/media`);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.upload.onload = () => onProgress?.(100);
    request.onerror = () => reject(new Error('Network error while uploading image'));
    request.onload = () => {
      let payload: unknown = {};
      try {
        payload = request.responseText ? JSON.parse(request.responseText) : {};
      } catch {
        reject(new Error('Unable to read image upload response'));
        return;
      }

      if (request.status >= 200 && request.status < 300) {
        resolve(payload as { event: CommunityEvent | null; media: { url: string; type: 'cover' | 'photo' } | null });
        return;
      }

      const message = typeof payload === 'object' && payload !== null && 'error' in payload
        && typeof payload.error === 'string'
        ? payload.error
        : 'Failed to upload image';
      reject(new Error(message));
    };
    request.send(formData);
  });
}
