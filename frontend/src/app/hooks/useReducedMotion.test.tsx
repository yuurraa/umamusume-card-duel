import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReducedMotion } from "./useReducedMotion";

type MediaQueryChangeListener = (event: MediaQueryListEvent) => void;

function installMotionPreference(initialValue: boolean) {
  let matches = initialValue;
  const listeners = new Set<MediaQueryChangeListener>();
  const addEventListener = vi.fn((_type: string, listener: EventListenerOrEventListenerObject | null) => {
    if (typeof listener === "function") listeners.add(listener as MediaQueryChangeListener);
  });
  const removeEventListener = vi.fn((_type: string, listener: EventListenerOrEventListenerObject | null) => {
    if (typeof listener === "function") listeners.delete(listener as MediaQueryChangeListener);
  });
  const mediaQuery = {
    media: "(prefers-reduced-motion: reduce)",
    get matches() { return matches; },
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
  const matchMedia = vi.fn(() => mediaQuery);
  vi.stubGlobal("matchMedia", matchMedia);

  return {
    addEventListener,
    removeEventListener,
    setMatches(next: boolean) {
      matches = next;
      listeners.forEach((listener) => listener(new Event("change") as MediaQueryListEvent));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useReducedMotion", () => {
  it("uses the initial system preference", () => {
    installMotionPreference(true);

    const view = renderHook(() => useReducedMotion());

    expect(view.result.current).toBe(true);
  });

  it("updates for future visual sequences and removes its listener on unmount", () => {
    const preference = installMotionPreference(false);
    const view = renderHook(() => useReducedMotion());

    expect(view.result.current).toBe(false);
    expect(preference.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));

    act(() => preference.setMatches(true));
    expect(view.result.current).toBe(true);

    view.unmount();
    expect(preference.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));

    act(() => preference.setMatches(false));
    expect(view.result.current).toBe(true);
  });
});
