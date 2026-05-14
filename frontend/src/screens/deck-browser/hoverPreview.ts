const HOVER_PREVIEW_MAX_WIDTH = 440;
const HOVER_PREVIEW_VIEWPORT_WIDTH_PADDING = 36;
const HOVER_PREVIEW_GAP = 12;
const HOVER_PREVIEW_VIEWPORT_PAD = 10;
const HOVER_PREVIEW_HEIGHT_PER_WIDTH = 1040 / 745;

export const HOVER_PREVIEW_ACTION_HEIGHT = 56;

export function getHoverPreviewPosition(rect: DOMRect, extraHeight = 0): { left: number; top: number; width: number } {
  const viewportWidth = Math.max(120, window.innerWidth - HOVER_PREVIEW_VIEWPORT_WIDTH_PADDING);
  const viewportHeight = Math.max(120, window.innerHeight - (HOVER_PREVIEW_VIEWPORT_PAD * 2) - extraHeight);
  const heightConstrainedWidth = viewportHeight / HOVER_PREVIEW_HEIGHT_PER_WIDTH;
  const popupWidth = Math.min(HOVER_PREVIEW_MAX_WIDTH, viewportWidth, Math.max(120, heightConstrainedWidth));
  const popupHeight = (popupWidth * HOVER_PREVIEW_HEIGHT_PER_WIDTH) + extraHeight;
  const rightCandidate = rect.right + HOVER_PREVIEW_GAP;
  const leftCandidate = rect.left - HOVER_PREVIEW_GAP - popupWidth;
  const prefersRight = rightCandidate + popupWidth + HOVER_PREVIEW_VIEWPORT_PAD <= window.innerWidth;
  const unclampedLeft = prefersRight ? rightCandidate : leftCandidate;
  const maxLeft = Math.max(HOVER_PREVIEW_VIEWPORT_PAD, window.innerWidth - HOVER_PREVIEW_VIEWPORT_PAD - popupWidth);
  const left = Math.max(HOVER_PREVIEW_VIEWPORT_PAD, Math.min(maxLeft, unclampedLeft));
  const preferredCenterY = rect.top + rect.height / 2;
  const halfHeight = popupHeight / 2;
  const minCenterY = HOVER_PREVIEW_VIEWPORT_PAD + halfHeight;
  const maxCenterY = window.innerHeight - HOVER_PREVIEW_VIEWPORT_PAD - halfHeight;
  const top = minCenterY <= maxCenterY
    ? Math.max(minCenterY, Math.min(maxCenterY, preferredCenterY))
    : window.innerHeight / 2;
  return { left, top, width: popupWidth };
}
