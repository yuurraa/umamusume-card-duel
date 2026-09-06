import { describe, expect, it } from "vitest";
import type { GameEvent } from "../../../shared/src/types";
import { formatStructuredKoActionNotice, toCoinFlipEventFromGameEvent } from "./gameUiHelpers";

describe("structured coin presentation", () => {
  it("formats multi-coin results from event data without log text", () => {
    const event: Extract<GameEvent, { kind: "coin" }> = {
      id: 12,
      transitionId: 4,
      visibility: "public" as const,
      kind: "coin" as const,
      side: "opponent" as const,
      results: ["heads", "tails", "heads"],
    };

    expect(toCoinFlipEventFromGameEvent(event, 99)).toEqual({
      id: 99,
      result: "heads",
      results: ["heads", "tails", "heads"],
      message: "Opponent flipped 3 coins and got 2x heads, 1x tails.",
    });
  });
});

describe("structured knockout presentation", () => {
  it("formats the notice from the public knockout payload", () => {
    expect(formatStructuredKoActionNotice({
      id: 14,
      transitionId: 6,
      visibility: "public",
      kind: "knockout",
      scoringSide: "player",
      knockedSide: "opponent",
      targetUid: 22,
      cardId: "riceShowerBasic",
      points: 1,
      cause: "Team Rigil's Teamwork",
    })).toContain("Opponent's Rice Shower was knocked out by your Team Rigil's Teamwork.");
  });
});
