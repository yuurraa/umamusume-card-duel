/**
 * Current maximum desktop geometry, captured from the existing match styles.
 *
 * These are reference values only at this stage. They intentionally do not
 * replace the live CSS clamps until each affected region is migrated and
 * checked in a browser. Keeping the values here gives later responsive work a
 * single, auditable 1080p-width baseline instead of scattering new magic
 * numbers across board components.
 */
export const MATCH_LAYOUT_BASELINE = Object.freeze({
  contentWidth: 1760,
  duel: {
    centerColumnWidth: 192,
    columnGap: 16,
  },
  sideBoard: {
    activeWidth: 464,
    activeHeight: 617,
    benchWidth: 178,
    benchCardHeight: 202,
    columnGap: 28,
    rowGap: 28,
    healthHeight: 48,
  },
  hand: {
    height: 326,
    cardWidth: 184,
    cardHeight: 258,
  },
});

/** The two-card board footprint before its surrounding grid-column space. */
export const MATCH_LAYOUT_BASELINE_SIDE_BOARD_WIDTH =
  MATCH_LAYOUT_BASELINE.sideBoard.activeWidth
  + MATCH_LAYOUT_BASELINE.sideBoard.benchWidth
  + MATCH_LAYOUT_BASELINE.sideBoard.columnGap;

/** The remaining width in the 1760px shell is intentional centering space. */
export const MATCH_LAYOUT_BASELINE_SIDE_COLUMN_WIDTH =
  (MATCH_LAYOUT_BASELINE.contentWidth
    - MATCH_LAYOUT_BASELINE.duel.centerColumnWidth
    - MATCH_LAYOUT_BASELINE.duel.columnGap * 2) / 2;
