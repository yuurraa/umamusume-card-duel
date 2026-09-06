import { describe, expect, it } from "vitest";
import { BoundedOutbox } from "./outbox";

describe("bounded outbound outbox", () => {
  it("keeps FIFO ordering while coalescing superseded snapshots", () => {
    const outbox = new BoundedOutbox<{ type: "intent" | "sync"; sequence: number }>(3, (entry) => (
      entry.type === "sync" ? "sync" : undefined
    ));
    const intent = { type: "intent" as const, sequence: 1 };
    const firstSync = { type: "sync" as const, sequence: 2 };
    const latestSync = { type: "sync" as const, sequence: 3 };
    outbox.enqueue(intent);
    outbox.enqueue(firstSync);
    outbox.enqueue(latestSync);

    expect(outbox.peek()).toBe(intent);
    expect(outbox.remove(intent)).toBe(true);
    expect(outbox.peek()).toBe(latestSync);
    expect(outbox.size).toBe(1);
  });

  it("bounds retained work and only removes the confirmed head", () => {
    const outbox = new BoundedOutbox<number>(2);
    outbox.enqueue(1);
    outbox.enqueue(2);
    outbox.enqueue(3);

    expect(outbox.peek()).toBe(2);
    expect(outbox.remove(3)).toBe(false);
    expect(outbox.remove(2)).toBe(true);
    expect(outbox.peek()).toBe(3);
    outbox.clear();
    expect(outbox.size).toBe(0);
  });
});
