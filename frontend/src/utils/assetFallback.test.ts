import { describe, expect, it } from "vitest";
import { getFallbackAssetPath } from "./assetFallback";

describe("asset fallback paths", () => {
  it("maps card AVIFs to the mirrored PNG fallback tree", () => {
    expect(getFallbackAssetPath("/assets/cards/umamusume/nishino-flower/basic.avif"))
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
});
