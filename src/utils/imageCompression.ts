export interface CompressedImageResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  sizeKb: number;
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Error leyendo imagen'));
      }
    };
    reader.onerror = () => reject(new Error('Error leyendo archivo'));
    reader.readAsDataURL(blob);
  });
}

export async function compressImageToWebP(
  file: File,
  maxWidth = 1280,
  quality = 0.8
): Promise<CompressedImageResult> {
  const originalDataUrl = await readBlobAsDataUrl(file);

  if (typeof document === 'undefined') {
    return {
      blob: file,
      dataUrl: originalDataUrl,
      width: 0,
      height: 0,
      sizeKb: Math.max(1, Math.round(file.size / 1024)),
    };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
      const targetWidth = Math.max(1, Math.round(img.width * ratio));
      const targetHeight = Math.max(1, Math.round(img.height * ratio));

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve({
          blob: file,
          dataUrl: originalDataUrl,
          width: img.width,
          height: img.height,
          sizeKb: Math.max(1, Math.round(file.size / 1024)),
        });
        return;
      }

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            resolve({
              blob: file,
              dataUrl: originalDataUrl,
              width: targetWidth,
              height: targetHeight,
              sizeKb: Math.max(1, Math.round(file.size / 1024)),
            });
            return;
          }
          try {
            const webpDataUrl = await readBlobAsDataUrl(blob);
            resolve({
              blob,
              dataUrl: webpDataUrl,
              width: targetWidth,
              height: targetHeight,
              sizeKb: Math.max(1, Math.round(blob.size / 1024)),
            });
          } catch {
            resolve({
              blob,
              dataUrl: originalDataUrl,
              width: targetWidth,
              height: targetHeight,
              sizeKb: Math.max(1, Math.round(blob.size / 1024)),
            });
          }
        },
        'image/webp',
        quality
      );
    };

    img.onerror = () => {
      resolve({
        blob: file,
        dataUrl: originalDataUrl,
        width: 0,
        height: 0,
        sizeKb: Math.max(1, Math.round(file.size / 1024)),
      });
    };

    img.src = originalDataUrl;
  });
}
