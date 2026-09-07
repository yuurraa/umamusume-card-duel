import { describe, expect, it } from "vitest";
import {
  MATCH_LAYOUT_BASELINE,
  MATCH_LAYOUT_BASELINE_SIDE_BOARD_WIDTH,
  MATCH_LAYOUT_BASELINE_SIDE_COLUMN_WIDTH,
} from "./matchLayoutBaseline";

describe("match layout baseline", () => {
  it("matches the current 1760px desktop shell", () => {
    expect(MATCH_LAYOUT_BASELINE.contentWidth).toBe(1760);
    expect(MATCH_LAYOUT_BASELINE_SIDE_COLUMN_WIDTH * 2
      + MATCH_LAYOUT_BASELINE.duel.centerColumnWidth
      + MATCH_LAYOUT_BASELINE.duel.columnGap * 2).toBe(MATCH_LAYOUT_BASELINE.contentWidth);
  });

  it("keeps each board footprint inside its grid column", () => {
    expect(MATCH_LAYOUT_BASELINE_SIDE_BOARD_WIDTH).toBe(670);
    expect(MATCH_LAYOUT_BASELINE_SIDE_BOARD_WIDTH).toBeLessThan(MATCH_LAYOUT_BASELINE_SIDE_COLUMN_WIDTH);
  });

  it("records the current active-card and hand geometry independently", () => {
    expect(MATCH_LAYOUT_BASELINE.sideBoard).toMatchObject({
      activeWidth: 464,
      activeHeight: 617,
      benchWidth: 178,
    });
    expect(MATCH_LAYOUT_BASELINE.hand).toEqual({
      height: 326,
      cardWidth: 184,
      cardHeight: 258,
    });
  });
});
