// The small picture a document row shows: a ~96px WebP data URL drawn from an
// image the browser already holds (an object URL of the picked file). The
// evidence bucket has no read policy, so this is made at upload time rather
// than fetched later — see components/intake/document-thumbnail.tsx.
export const createPreviewThumbnail = (sourceUrl: string): Promise<string | null> =>
  new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () => {
      const maxSize = 96;
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(null);
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/webp", 0.72));
    };
    image.onerror = () => resolve(null);
    image.src = sourceUrl;
  });
