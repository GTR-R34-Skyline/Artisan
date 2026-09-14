/**
 * Client-side image preparation for marketplace uploads.
 * - prepareOriginalImage: high-fidelity source for Gemini enhancement (minimal processing)
 * - compressImage: optimized display derivative for normal marketplace UI
 */

const ORIGINAL_MAX_DIMENSION = 3072;
const ORIGINAL_JPEG_QUALITY = 0.92;
const DISPLAY_MAX_DIMENSION = 1200;
const DISPLAY_JPEG_QUALITY = 0.8;
const SKIP_PROCESS_UNDER_BYTES = 100 * 1024;

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read the image file.'));
    };
    img.src = objectUrl;
  });

const scaleDimensions = (
  width: number,
  height: number,
  maxDimension: number
): { width: number; height: number; resized: boolean } => {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height, resized: false };
  }
  if (width > height) {
    return {
      width: maxDimension,
      height: Math.round((height * maxDimension) / width),
      resized: true,
    };
  }
  return {
    width: Math.round((width * maxDimension) / height),
    height: maxDimension,
    resized: true,
  };
};

const canvasToFile = (
  canvas: HTMLCanvasElement,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
  quality: number,
  fileName: string
): Promise<File> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Image encoding failed.'));
          return;
        }
        const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
        const safeName = (fileName || 'uploaded_image').replace(/\.[^/.]+$/, '');
        resolve(
          new File([blob], `${safeName}.${extension}`, {
            type: mimeType,
            lastModified: Date.now(),
          })
        );
      },
      mimeType,
      mimeType === 'image/png' ? undefined : quality
    );
  });

/**
 * High-quality upload preparation for the enhancement source.
 * Preserves the original bytes when already within size/dimension limits.
 * Only resizes or re-encodes when necessary for reliability.
 */
export const prepareOriginalImage = async (
  file: File,
  maxDimension: number = ORIGINAL_MAX_DIMENSION
): Promise<File> => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.type)) {
    return file;
  }

  try {
    const img = await loadImage(file);
    const { width, height, resized } = scaleDimensions(img.width, img.height, maxDimension);

    // Keep original bytes when format is already suitable and no resize is needed.
    // GIFs are normalized to a still JPEG so enhancement gets a stable frame.
    if (!resized && file.type !== 'image/gif' && file.size <= 5 * 1024 * 1024) {
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return file;
    }
    ctx.drawImage(img, 0, 0, width, height);

    // Preserve PNG when the source is PNG (including transparency).
    if (file.type === 'image/png') {
      return canvasToFile(canvas, 'image/png', 1, file.name);
    }

    // Preserve WebP when no better reason to convert.
    if (file.type === 'image/webp') {
      try {
        return await canvasToFile(canvas, 'image/webp', ORIGINAL_JPEG_QUALITY, file.name);
      } catch {
        // Fall through to JPEG if the browser rejects WebP encoding.
      }
    }

    return canvasToFile(canvas, 'image/jpeg', ORIGINAL_JPEG_QUALITY, file.name);
  } catch {
    return file;
  }
};

/**
 * Display-oriented compression for marketplace UI (not for Gemini input).
 */
export const compressImage = (
  file: File,
  maxDimension: number = DISPLAY_MAX_DIMENSION,
  quality: number = DISPLAY_JPEG_QUALITY
): Promise<File> => {
  return new Promise((resolve) => {
    if (file.size < SKIP_PROCESS_UNDER_BYTES) {
      resolve(file);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    img.onload = () => {
      try {
        const { width, height } = scaleDimensions(img.width, img.height, maxDimension);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            try {
              URL.revokeObjectURL(objectUrl);
              if (!blob) {
                resolve(file);
                return;
              }
              const safeName = (file.name || 'uploaded_image').replace(/\.[^/.]+$/, '');
              const compressedFile = new File([blob], `${safeName}.jpg`, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } catch {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      } catch {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
  });
};
