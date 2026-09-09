import { useLayoutEffect, useState, type RefObject } from "react";
import type { MatchViewportSize } from "./matchViewport";

const EMPTY_SIZE: MatchViewportSize = { width: 0, height: 0 };

/**
 * Measures the actual available element instead of assuming browser-window
 * dimensions. This matters because app padding, browser UI, and side panels
 * can all change the room available to the match.
 */
type UseElementSizeOptions = Readonly<{
  /**
   * False reads the element's layout box, excluding CSS transforms. This is
   * needed when an element is both measured and visually scaled by its parent.
   */
  includeTransforms?: boolean;
}>;

export function useElementSize<TElement extends Element>(
  ref: RefObject<TElement | null>,
  { includeTransforms = true }: UseElementSizeOptions = {},
): MatchViewportSize {
  const [size, setSize] = useState<MatchViewportSize>(EMPTY_SIZE);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = (next: MatchViewportSize) => {
      const width = Math.max(0, Math.round(next.width));
      const height = Math.max(0, Math.round(next.height));
      setSize((current) => current.width === width && current.height === height
        ? current
        : { width, height });
    };

    const initialSize = !includeTransforms && element instanceof HTMLElement
      ? { width: element.offsetWidth, height: element.offsetHeight }
      : element.getBoundingClientRect();
    update(initialSize);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) update(entry.contentRect);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
