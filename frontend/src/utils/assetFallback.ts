import type { SyntheticEvent } from "react";

const customisationFallbacks: Record<string, string> = {
  "/assets/customisation/playmat/agnes-tachyon-playmat.avif": "/fallback/customisation/playmat/agnes-tachyon-playmat.png",
  "/assets/customisation/playmat/manhattan-cafe-playmat.avif": "/fallback/customisation/playmat/manhattan-cafe-playmat.jpg",
  "/assets/customisation/playmat/rice-shower-playmat.avif": "/fallback/customisation/playmat/rice-shower-playmat.jpg",
  "/assets/customisation/playmat/tokai-teio-playmat.avif": "/fallback/customisation/playmat/tokai-teio-playmat.jpg",
  "/assets/customisation/sleeve/agnes-tachyon-sleeve.avif": "/fallback/customisation/sleeve/agnes-tachyon-sleeve.png",
  "/assets/customisation/sleeve/manhattan-cafe-sleeve.avif": "/fallback/customisation/sleeve/manhattan-cafe-sleeve.jpg",
  "/assets/customisation/sleeve/rice-shower-sleeve.avif": "/fallback/customisation/sleeve/rice-shower-sleeve.jpg",
  "/assets/customisation/sleeve/tokai-teio-sleeve.avif": "/fallback/customisation/sleeve/tokai-teio-sleeve.jpg",
};

export function getFallbackAssetPath(assetPath: string): string | undefined {
  const normalizedPath = normalizeAssetPath(assetPath);
  const customisationFallback = customisationFallbacks[normalizedPath];
  if (customisationFallback) return customisationFallback;
  if (!normalizedPath.startsWith("/assets/cards/") || !normalizedPath.endsWith(".avif")) return undefined;
  return `/fallback/${normalizedPath.slice("/assets/".length, -5)}.png`;
}

function normalizeAssetPath(assetPath: string): string {
  const withoutQuery = assetPath.split(/[?#]/, 1)[0] ?? assetPath;
  try {
    const pathname = new URL(withoutQuery, "http://asset-fallback.invalid").pathname;
    return decodeURIComponent(pathname);
  } catch {
    return withoutQuery;
  }
}

export function handleAssetError(event: SyntheticEvent<HTMLImageElement>): void {
  const image = event.currentTarget;
  const fallbackPath = getFallbackAssetPath(image.currentSrc || image.src);
  if (!fallbackPath || image.src.endsWith(fallbackPath)) return;
  image.onerror = null;
  image.src = fallbackPath;
}
