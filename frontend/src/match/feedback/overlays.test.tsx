import { StrictMode } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BattleEffectOverlay, type BattleEffectEvent } from "./BattleEffectOverlay";
import { CardFlowOverlay } from "./CardFlowOverlay";
import { useModalFocus } from "../useModalFocus";

const battleEvent: BattleEffectEvent = {
  id: 1,
  kind: "damage",
  side: "opponent",
  label: "Damage",
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("battle effect completion", () => {
  it("does not restart timing when a parent supplies a fresh callback", () => {
    vi.useFakeTimers();
    const firstCallback = vi.fn();
    const currentCallback = vi.fn();
    const view = render(<BattleEffectOverlay event={battleEvent} durationMs={100} onDone={firstCallback} />);

    act(() => vi.advanceTimersByTime(50));
    view.rerender(<BattleEffectOverlay event={battleEvent} durationMs={100} onDone={currentCallback} />);
    act(() => vi.advanceTimersByTime(50));

    expect(firstCallback).not.toHaveBeenCalled();
    expect(currentCallback).toHaveBeenCalledTimes(1);
  });

  it("cancels a previous event when event identity changes", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const view = render(<BattleEffectOverlay event={battleEvent} durationMs={100} onDone={onDone} />);

    act(() => vi.advanceTimersByTime(50));
    view.rerender(<BattleEffectOverlay event={{ ...battleEvent, id: 2 }} durationMs={100} onDone={onDone} />);
    act(() => vi.advanceTimersByTime(50));
    expect(onDone).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(50));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does not leave a completion callback behind after unmount", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const view = render(<BattleEffectOverlay event={battleEvent} durationMs={100} onDone={onDone} />);

    act(() => vi.advanceTimersByTime(50));
    view.unmount();
    act(() => vi.advanceTimersByTime(100));

    expect(onDone).not.toHaveBeenCalled();
  });

  it("completes only once in StrictMode", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(
      <StrictMode>
        <BattleEffectOverlay event={battleEvent} durationMs={100} onDone={onDone} />
      </StrictMode>,
    );

    act(() => vi.advanceTimersByTime(100));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("uses supplied snapshot geometry without a synchronous card lookup", () => {
    const querySelector = vi.spyOn(document, "querySelector");
    render(
      <BattleEffectOverlay
        durationMs={100}
        onDone={vi.fn()}
        event={{
          ...battleEvent,
          sourceUid: 11,
          targetUid: 22,
          sourceRect: { x: 10, y: 10, width: 80, height: 112 },
          targetRect: { x: 100, y: 100, width: 80, height: 112 },
        }}
      />,
    );

    expect(querySelector).not.toHaveBeenCalled();
  });
});

describe("card flow completion", () => {
  it("supports an empty-to-nonempty transition and completes the batch once", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const view = render(<CardFlowOverlay items={[]} durationMs={10} onDone={onDone} />);

    view.rerender(
      <CardFlowOverlay
        durationMs={10}
        onDone={onDone}
        items={[{
          cardId: "hidden-card",
          faceDownImage: "",
          enterFrom: "leftDeck",
          exitTo: "bottomCenter",
        }]}
      />,
    );
    act(() => vi.advanceTimersByTime(500));

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(0);
  });
});

describe("modal keyboard focus", () => {
  it("traps Tab, closes on Escape, and restores the invoking control", () => {
    const opener = document.createElement("button");
    opener.type = "button";
    opener.textContent = "Open";
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();

    function FocusHarness({ open }: { open: boolean }) {
      const modalRef = useModalFocus<HTMLDivElement>({ active: open, onClose });
      if (!open) return null;
      return (
        <div ref={modalRef} role="dialog">
          <button type="button">First</button>
          <button type="button">Last</button>
        </div>
      );
    }

    const view = render(<FocusHarness open />);
    const first = view.getByRole("button", { name: "First" });
    const last = view.getByRole("button", { name: "Last" });
    expect(document.activeElement).toBe(first);

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    view.rerender(<FocusHarness open={false} />);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
