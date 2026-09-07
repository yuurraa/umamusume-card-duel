import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMatchZoneModal } from "./useMatchZoneModal";

describe("useMatchZoneModal", () => {
  it("keeps pile and opponent-zone modals mutually exclusive", () => {
    const view = renderHook(() => useMatchZoneModal());

    act(() => view.result.current.openDiscard("player"));
    expect(view.result.current.pileModal).toEqual({ kind: "discard", side: "player" });
    expect(view.result.current.opponentZonesOpen).toBe(false);

    act(() => view.result.current.openRevealedOpponentHand(["card-1"]));
    expect(view.result.current.pileModal).toEqual({ kind: "revealedOpponentHand", cardIds: ["card-1"] });

    act(() => view.result.current.openOpponentZones());
    expect(view.result.current.pileModal).toBeNull();
    expect(view.result.current.opponentZonesOpen).toBe(true);
  });

  it("clears every zone modal during a transient match reset", () => {
    const view = renderHook(() => useMatchZoneModal());

    act(() => view.result.current.openRevealedOpponentHand(["card-1"]));
    act(() => view.result.current.resetZoneModals());

    expect(view.result.current.pileModal).toBeNull();
    expect(view.result.current.opponentZonesOpen).toBe(false);
  });
});
