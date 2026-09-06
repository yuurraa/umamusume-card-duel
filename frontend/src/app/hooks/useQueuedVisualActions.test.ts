import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useQueuedVisualActions } from "./useQueuedVisualActions";

describe("queued visual actions", () => {
  it("flushes queued actions once when the visual boundary opens", () => {
    const action = vi.fn();
    const view = renderHook(({ blocked }) => useQueuedVisualActions(blocked), { initialProps: { blocked: true } });

    act(() => view.result.current.queueVisualAction(action));
    expect(action).not.toHaveBeenCalled();

    view.rerender({ blocked: false });
    expect(action).toHaveBeenCalledTimes(1);

    act(() => view.result.current.queueVisualAction(action));
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("clears actions before a rematch can flush them", () => {
    const action = vi.fn();
    const view = renderHook(({ blocked }) => useQueuedVisualActions(blocked), { initialProps: { blocked: true } });

    act(() => {
      view.result.current.queueVisualAction(action);
      view.result.current.clearQueuedVisualActions();
    });
    view.rerender({ blocked: false });

    expect(action).not.toHaveBeenCalled();
  });
});
