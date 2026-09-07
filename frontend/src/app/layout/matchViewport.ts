/**
 * Geometry contract for the match board's future responsive layout.
 *
 * This module deliberately has no React or DOM dependency. Keeping the
 * calculation pure makes the sizing policy testable before it is connected to
 * the live board, card animations, or input targets.
 */
export type MatchViewportSize = Readonly<{
  width: number;
  height: number;
}>;

export type MatchLayoutMetrics = Readonly<{
  /** A uniform scale that keeps the design rectangle wholly visible. */
  scale: number;
  /** The dimensions occupied by the scaled design rectangle. */
  content: MatchViewportSize;
  /** Space left around the centered design rectangle. */
  inset: Readonly<{
    horizontal: number;
    vertical: number;
  }>;
}>;

/**
 * Returns a uniform, contained layout for a design rectangle in an available
 * viewport. A contained layout preserves card aspect ratios on ultrawide and
 * tall displays instead of stretching either axis independently.
 *
 * Invalid or zero-sized measurements intentionally produce an inert layout.
 * That keeps initial ResizeObserver measurements from briefly creating NaN or
 * Infinity styles when this is later wired into the match board.
 */
export function getMatchLayoutMetrics(
  available: MatchViewportSize,
  design: MatchViewportSize,
): MatchLayoutMetrics {
  if (!isPositiveFiniteSize(available) || !isPositiveFiniteSize(design)) {
    return {
      scale: 0,
      content: { width: 0, height: 0 },
      inset: { horizontal: 0, vertical: 0 },
    };
  }

  const scale = Math.min(available.width / design.width, available.height / design.height);
  const content = {
    width: design.width * scale,
    height: design.height * scale,
  };

  return {
    scale,
    content,
    inset: {
      horizontal: (available.width - content.width) / 2,
      vertical: (available.height - content.height) / 2,
    },
  };
}

function isPositiveFiniteSize(size: MatchViewportSize): boolean {
  return Number.isFinite(size.width)
    && Number.isFinite(size.height)
    && size.width > 0
    && size.height > 0;
}
