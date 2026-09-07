import { useLayoutEffect, useState, type RefObject } from "react";
import type { MatchViewportSize } from "./matchViewport";

const EMPTY_SIZE: MatchViewportSize = { width: 0, height: 0 };

/**
 * Measures the actual available element instead of assuming browser-window
 * dimensions. This matters because app padding, browser UI, and side panels
 * can all change the room available to the match.
 */
export function useElementSize<TElement extends Element>(ref: RefObject<TElement | null>): MatchViewportSize {
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

    update(element.getBoundingClientRect());
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) update(entry.contentRect);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
