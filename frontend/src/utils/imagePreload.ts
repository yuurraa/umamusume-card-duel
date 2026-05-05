const loadedImages = new Set<string>();
const pendingBySrc = new Map<string, Promise<void>>();

export function preloadImage(src: string): Promise<void> {
  if (!src) return Promise.resolve();
  if (loadedImages.has(src)) return Promise.resolve();
  const pending = pendingBySrc.get(src);
  if (pending) return pending;

  const image = new Image();
  image.decoding = "async";
  image.loading = "eager";

  const promise = new Promise<void>((resolve) => {
    const finalize = () => {
      loadedImages.add(src);
      pendingBySrc.delete(src);
      resolve();
    };
    image.onload = finalize;
    image.onerror = finalize;
  });

  pendingBySrc.set(src, promise);
  image.src = src;

  // decode() can still reject on some browsers/formats. We ignore and resolve on load/error.
  void image.decode?.().catch(() => {});
  return promise;
}

export function isImagePreloaded(src: string): boolean {
  return loadedImages.has(src);
}
