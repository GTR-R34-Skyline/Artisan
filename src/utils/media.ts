/**
 * Client-side image compression utility using HTML5 Canvas.
 * Resizes the image to a maximum dimension while maintaining aspect ratio,
 * and outputs a compressed JPEG File object.
 */
export const compressImage = (
  file: File,
  maxDimension: number = 1200,
  quality: number = 0.8
): Promise<File> => {
  return new Promise((resolve) => {
    // If the file is already small (e.g., under 100KB), don't compress
    if (file.size < 100 * 1024) {
      resolve(file);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    img.onload = () => {
      try {
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions keeping aspect ratio
        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          resolve(file); // fallback to original file if canvas context is unavailable
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
              const safeName = (file.name || 'uploaded_image').replace(/\.[^/.]+$/, "");
              const compressedFile = new File([blob], safeName + ".jpg", {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              console.log(
                `Image compression: ${(file.size / 1024).toFixed(1)}KB -> ${(compressedFile.size / 1024).toFixed(1)}KB`
              );
              resolve(compressedFile);
            } catch (blobErr) {
              console.error("Error creating compressed file in toBlob:", blobErr);
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      } catch (loadErr) {
        console.error("Error in image onload compression:", loadErr);
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
