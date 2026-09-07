import { describe, expect, it } from "vitest";
import { getMatchLayoutMetrics } from "./matchViewport";

describe("getMatchLayoutMetrics", () => {
  const design = { width: 1760, height: 1000 };

  it("preserves the baseline design at its intended size", () => {
    expect(getMatchLayoutMetrics(design, design)).toEqual({
      scale: 1,
      content: design,
      inset: { horizontal: 0, vertical: 0 },
    });
  });

  it("scales uniformly for a larger 16:9 display", () => {
    expect(getMatchLayoutMetrics({ width: 3520, height: 2000 }, design)).toEqual({
      scale: 2,
      content: { width: 3520, height: 2000 },
      inset: { horizontal: 0, vertical: 0 },
    });
  });

  it("centers rather than stretches the board on an ultrawide display", () => {
    expect(getMatchLayoutMetrics({ width: 3440, height: 1000 }, design)).toEqual({
      scale: 1,
      content: { width: 1760, height: 1000 },
      inset: { horizontal: 840, vertical: 0 },
    });
  });

  it("uses the limiting axis on a smaller display", () => {
    expect(getMatchLayoutMetrics({ width: 880, height: 800 }, design)).toEqual({
      scale: 0.5,
      content: { width: 880, height: 500 },
      inset: { horizontal: 0, vertical: 150 },
    });
  });

  it("returns an inert layout until both rectangles have valid measurements", () => {
    expect(getMatchLayoutMetrics({ width: 0, height: 800 }, design)).toEqual({
      scale: 0,
      content: { width: 0, height: 0 },
      inset: { horizontal: 0, vertical: 0 },
    });
  });
});
