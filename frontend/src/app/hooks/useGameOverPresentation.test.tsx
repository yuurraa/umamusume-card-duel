import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGameOverPresentation } from "./useGameOverPresentation";

function makeProps(overrides: Partial<Parameters<typeof useGameOverPresentation>[0]> = {}) {
  return {
    gameOver: false,
    battleEffectCount: 0,
    koCrumbleCount: 0,
    pointGainCount: 0,
    cardFlowCount: 0,
    activeCoinFlip: null,
    clearQueuedVisualActions: vi.fn(),
    setOpeningHandDeferredRevealCardIds: vi.fn(),
    openingHandDeferredRevealTimeoutRef: { current: null },
    openingHandAnimationKeyRef: { current: "opening" },
    shouldDealOpeningHandsAfterFlowRef: { current: true },
    ...overrides,
  };
}

describe("useGameOverPresentation", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for visual queues before revealing game over", () => {
    vi.useFakeTimers();
    const props = makeProps({ gameOver: true, battleEffectCount: 1 });
    const view = renderHook((currentProps) => useGameOverPresentation(currentProps), { initialProps: props });

    expect(view.result.current.gameOverModalVisible).toBe(false);
    expect(props.clearQueuedVisualActions).toHaveBeenCalledTimes(1);

    view.rerender({ ...props, battleEffectCount: 0 });
    act(() => vi.advanceTimersByTime(99));
    expect(view.result.current.gameOverModalVisible).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(view.result.current.gameOverModalVisible).toBe(true);
  });

  it("cancels a pending reveal when reset or a new game arrives", () => {
    vi.useFakeTimers();
    const props = makeProps({ gameOver: true });
    const view = renderHook((currentProps) => useGameOverPresentation(currentProps), { initialProps: props });

    act(() => view.result.current.resetGameOverPresentation());
    expect(view.result.current.gameOverModalVisible).toBe(false);
    expect(props.setOpeningHandDeferredRevealCardIds).toHaveBeenCalledWith([]);
    expect(props.openingHandAnimationKeyRef.current).toBeNull();
    expect(props.shouldDealOpeningHandsAfterFlowRef.current).toBe(false);

    act(() => vi.advanceTimersByTime(800));
    expect(view.result.current.gameOverModalVisible).toBe(false);

    view.rerender({ ...props, gameOver: false });
    expect(view.result.current.gameOverModalVisible).toBe(false);
  });
});
