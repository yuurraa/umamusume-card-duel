import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GameState } from "../../../../shared/src/types";
import { useOpeningHandFlow } from "./useOpeningHandFlow";

function makeGame(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: "setup",
    gameOver: false,
    setup: {
      coinChoice: "heads",
      coinFlipResult: "heads",
      openingHands: { player: ["card-a", "card-b"], opponent: [] },
      openingHandsDealt: false,
      readyBySide: { player: false, opponent: false },
      opponentRevealed: false,
      countdownSecondsRemaining: null,
    },
    sides: {} as GameState["sides"],
    currentSide: "player",
    log: [],
    events: [],
    pendingPlayerChoice: null,
    turnNumber: 0,
    ...overrides,
  } as GameState;
}

describe("useOpeningHandFlow", () => {
  it("queues the opening hand once after coin flow clears", () => {
    const setCardFlowQueue = vi.fn();
    const view = renderHook(() => useOpeningHandFlow({
      game: makeGame(),
      activeCoinFlip: null,
      isCoinFlipBlocking: false,
      cardFlowQueue: [],
      setCardFlowQueue,
      setActiveCoinFlip: vi.fn(),
      setCoinFlipQueue: vi.fn(),
    }));

    expect(setCardFlowQueue).toHaveBeenCalledTimes(1);
    const updater = setCardFlowQueue.mock.calls[0]?.[0] as (queue: never[][]) => unknown[][];
    expect(updater([])).toEqual([[
      { cardId: "card-a", group: "drawn", enterFrom: "leftDeck", exitTo: "bottomCenter" },
      { cardId: "card-b", group: "drawn", enterFrom: "leftDeck", exitTo: "bottomCenter" },
    ]]);
    expect(view.result.current.openingHandAnimationKeyRef.current).toBe("heads:card-a|card-b");
    expect(view.result.current.shouldDealOpeningHandsAfterFlowRef.current).toBe(true);
  });

  it("does not queue while coin flow is blocking and clears the pending coin choice after resolution", () => {
    const setCardFlowQueue = vi.fn();
    const blocked = renderHook(({ game, blocking }) => useOpeningHandFlow({
      game,
      activeCoinFlip: null,
      isCoinFlipBlocking: blocking,
      cardFlowQueue: [],
      setCardFlowQueue,
      setActiveCoinFlip: vi.fn(),
      setCoinFlipQueue: vi.fn(),
    }), { initialProps: { game: makeGame({ setup: { ...makeGame().setup!, coinFlipResult: null } }), blocking: true } });

    act(() => blocked.result.current.setOpeningCoinChoicePending(true));
    expect(blocked.result.current.openingCoinChoicePending).toBe(true);
    blocked.rerender({ game: makeGame(), blocking: false });
    expect(blocked.result.current.openingCoinChoicePending).toBe(false);
    expect(setCardFlowQueue).toHaveBeenCalledTimes(1);
  });

  it("uses the authoritative opening coin event for the shared animation", () => {
    const setActiveCoinFlip = vi.fn();
    renderHook(() => useOpeningHandFlow({
      game: makeGame({
        events: [{ id: 42, transitionId: 3, visibility: "public", kind: "coin", side: "player", results: ["heads"] }],
      }),
      activeCoinFlip: null,
      isCoinFlipBlocking: true,
      cardFlowQueue: [],
      setCardFlowQueue: vi.fn(),
      setActiveCoinFlip,
      setCoinFlipQueue: vi.fn(),
    }));

    expect(setActiveCoinFlip).toHaveBeenCalledWith(expect.objectContaining({ id: 42, result: "heads", results: ["heads"] }));
  });
});
