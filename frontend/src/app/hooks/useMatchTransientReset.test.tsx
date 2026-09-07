import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMatchTransientReset, type UseMatchTransientResetOptions } from "./useMatchTransientReset";

function makeProps(): UseMatchTransientResetOptions {
  return {
    previousLogRef: { current: ["old log"] },
    previousEventsRef: { current: [{ id: 1, transitionId: 1, visibility: "public", kind: "message", message: "old event" }] },
    resetCardFlowTracking: vi.fn(),
    clearQueuedVisualActions: vi.fn(),
    setCoinFlipQueue: vi.fn(),
    setActiveCoinFlip: vi.fn(),
    setAcknowledgedCoinLogMessage: vi.fn(),
    setPendingCoinAttack: vi.fn(),
    setCardFlowQueue: vi.fn(),
    resetGameOverPresentation: vi.fn(),
    resetBattleVisuals: vi.fn(),
    skipNextCoinLogMessageRef: { current: ["heads"] },
    setSetupActiveIndex: vi.fn(),
    setSetupBenchIndexes: vi.fn(),
    setPendingSelection: vi.fn(),
    setEndTurnWarningActions: vi.fn(),
    setPreviewTarget: vi.fn(),
    setSuppressEndTurnWarningForGame: vi.fn(),
    setActionNotice: vi.fn(),
    resetZoneModals: vi.fn(),
    setMenuOpen: vi.fn(),
    setAiPerspective: vi.fn(),
    setPovSwitchAnimationToken: vi.fn(),
    openingHandAnimationKeyRef: { current: "opening" },
    shouldDealOpeningHandsAfterFlowRef: { current: true },
  };
}

describe("useMatchTransientReset", () => {
  it("clears every transient match owner and restores the default perspective", () => {
    const props = makeProps();
    const view = renderHook(() => useMatchTransientReset(props));

    act(() => view.result.current());

    expect(props.previousLogRef.current).toEqual([]);
    expect(props.previousEventsRef.current).toEqual([]);
    expect(props.skipNextCoinLogMessageRef.current).toBeNull();
    expect(props.openingHandAnimationKeyRef.current).toBeNull();
    expect(props.shouldDealOpeningHandsAfterFlowRef.current).toBe(false);
    expect(props.resetCardFlowTracking).toHaveBeenCalledTimes(1);
    expect(props.clearQueuedVisualActions).toHaveBeenCalledTimes(1);
    expect(props.resetGameOverPresentation).toHaveBeenCalledTimes(1);
    expect(props.resetBattleVisuals).toHaveBeenCalledTimes(1);
    expect(props.resetZoneModals).toHaveBeenCalledTimes(1);
    expect(props.setAiPerspective).toHaveBeenCalledWith("player");
    expect(props.setPovSwitchAnimationToken).toHaveBeenCalledWith(0);
  });
});
