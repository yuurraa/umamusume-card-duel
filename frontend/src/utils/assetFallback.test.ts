import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getFallbackAssetPath } from "./assetFallback";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

describe("asset fallback paths", () => {
  it("maps card AVIFs to the mirrored PNG fallback tree", () => {
    expect(getFallbackAssetPath("/assets/cards/umamusume/nishino-flower/basic.avif"))
      .toBe("/fallback/cards/umamusume/nishino-flower/basic.png");
    expect(getFallbackAssetPath("https://example.test/assets/cards/umamusume/nishino-flower/basic.avif?v=1"))
      .toBe("/fallback/cards/umamusume/nishino-flower/basic.png");
  });

  it("keeps the original customisation extension", () => {
    expect(getFallbackAssetPath("/assets/customisation/playmat/manhattan-cafe-playmat.avif"))
      .toBe("/fallback/customisation/playmat/manhattan-cafe-playmat.jpg");
  });

  it("does not rewrite assets that have no generated AVIF fallback", () => {
    expect(getFallbackAssetPath("/assets/status/Poison.png")).toBeUndefined();
    expect(getFallbackAssetPath("/assets/cards/unknown/basic.png")).toBeUndefined();
  });

  it("keeps a fallback file for every runtime AVIF asset", () => {
    const runtimeAssetRoot = path.join(frontendRoot, "public", "assets");
    const fallbackRoot = path.join(frontendRoot, "public", "fallback");
    const avifFiles = listFiles(runtimeAssetRoot).filter((filePath) => filePath.endsWith(".avif"));

    expect(avifFiles.length).toBeGreaterThan(0);
    avifFiles.forEach((filePath) => {
      const assetPath = `/assets/${path.relative(runtimeAssetRoot, filePath).split(path.sep).join("/")}`;
      const fallbackPath = getFallbackAssetPath(assetPath);
      expect(fallbackPath, `missing fallback mapping for ${assetPath}`).toBeDefined();
      const fallbackFile = path.join(fallbackRoot, fallbackPath!.slice("/fallback/".length));
      expect(existsSync(fallbackFile), `missing fallback file for ${assetPath}: ${fallbackFile}`).toBe(true);
    });

    ["cards", "customisation"].forEach((runtimeDirectory) => {
      const legacyFiles = listFiles(path.join(runtimeAssetRoot, runtimeDirectory))
        .filter((filePath) => /\.(png|jpe?g)$/i.test(filePath));
      expect(legacyFiles, `legacy raster masters must stay under public/fallback, not assets/${runtimeDirectory}`).toEqual([]);
    });
  });
});
