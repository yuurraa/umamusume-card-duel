import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createGame } from "../../game/engine";
import { useMatchCommandController } from "./useMatchCommandController";

describe("useMatchCommandController", () => {
  it("does not let a joining peer resolve the host-owned opening coin", () => {
    const setGame = vi.fn();
    const setOpeningCoinChoicePending = vi.fn();
    const syncToGuest = vi.fn();
    const view = renderHook(() => useMatchCommandController({
      game: createGame(),
      pendingSelection: null,
      isNetworkMatch: true,
      isPvpHost: false,
      setGame,
      setOpeningCoinChoicePending,
      setPendingSelection: vi.fn(),
      setPreviewTarget: vi.fn(),
      submitPlayerIntent: vi.fn(),
      syncToGuest,
    }));

    act(() => view.result.current.handleChooseOpeningCoin("heads"));

    expect(setOpeningCoinChoicePending).not.toHaveBeenCalled();
    expect(setGame).not.toHaveBeenCalled();
    expect(syncToGuest).not.toHaveBeenCalled();
  });
});
