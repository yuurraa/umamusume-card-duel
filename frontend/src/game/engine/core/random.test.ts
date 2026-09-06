import { describe, expect, it, vi } from "vitest";
import { createReplayableRandomUpdate } from "./random";

describe("createReplayableRandomUpdate", () => {
  it("replays the same draws when an updater is evaluated again", () => {
    const source = vi.fn()
      .mockReturnValueOnce(0.12)
      .mockReturnValueOnce(0.87)
      .mockReturnValueOnce(0.42);
    const update = createReplayableRandomUpdate(source);

    const first = update((random) => [random(), random(), random()]);
    const second = update((random) => [random(), random(), random()]);

    expect(second).toEqual(first);
    expect(source).toHaveBeenCalledTimes(3);
  });

  it("does not draw randomness when the updater exits before using it", () => {
    const source = vi.fn().mockReturnValue(0.5);
    const update = createReplayableRandomUpdate(source);

    expect(update(() => "unchanged")).toBe("unchanged");
    expect(source).not.toHaveBeenCalled();
  });
});
