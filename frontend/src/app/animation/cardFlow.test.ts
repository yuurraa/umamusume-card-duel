import { describe, expect, it } from "vitest";
import { buildCardFlowItems, type PlayerZonesSnapshot } from "./cardFlow";

function snapshot(overrides: Partial<PlayerZonesSnapshot> = {}): PlayerZonesSnapshot {
  return {
    player: { hand: ["tazunaHayakawa"], deck: [], discard: [], inPlay: [] },
    opponent: { hand: [], deck: [], discard: [], inPlay: [] },
    currentSide: "player",
    turnNumber: 1,
    phase: "play",
    events: [],
    ...overrides,
  };
}

describe("structured card-flow events", () => {
  it("labels a played card without parsing English log text", () => {
    const previous = snapshot();
    const current = snapshot({
      player: { hand: [], deck: [], discard: ["tazunaHayakawa"], inPlay: [] },
      events: [
        { id: 1, transitionId: 1, visibility: "actor", kind: "cardMovement", side: "player", from: "hand", to: "play", count: 1, cardIds: ["tazunaHayakawa"] },
        { id: 2, transitionId: 1, visibility: "actor", kind: "cardMovement", side: "player", from: "play", to: "discard", count: 1, cardIds: ["tazunaHayakawa"] },
      ],
    });

    expect(buildCardFlowItems({
      previous,
      current,
      povSideId: "player",
      sleeveBySide: { player: null, opponent: null },
    })).toEqual([expect.objectContaining({ cardId: "tazunaHayakawa", group: "played", label: "You Played" })]);
  });

  it("uses a public opponent hand-to-play event for the played-card identity", () => {
    const previous = snapshot({
      opponent: { hand: ["specialWeek"], deck: [], discard: [], inPlay: [] },
    });
    const current = snapshot({
      opponent: { hand: [], deck: [], discard: [], inPlay: ["specialWeek"] },
      events: [
        { id: 1, transitionId: 1, visibility: "actor", kind: "cardMovement", side: "opponent", from: "hand", to: "play", count: 1, cardIds: ["specialWeek"] },
      ],
    });

    expect(buildCardFlowItems({
      previous,
      current,
      povSideId: "player",
      sleeveBySide: { player: null, opponent: "opponent-sleeve" },
    })).toEqual([expect.objectContaining({ cardId: "specialWeek", group: "played", label: "Opponent Played", faceDownImage: undefined })]);
  });

  it("renders a hidden opponent draw from a public movement count without log text", () => {
    const previous = snapshot({
      opponent: { hand: [], deck: ["specialWeek"], discard: [], inPlay: [] },
    });
    const current = snapshot({
      opponent: { hand: [""], deck: [], discard: [], inPlay: [] },
      events: [
        { id: 1, transitionId: 1, visibility: "public", kind: "cardMovement", side: "opponent", from: "deck", to: "hand", count: 1 },
      ],
    });

    expect(buildCardFlowItems({
      previous,
      current,
      povSideId: "player",
      sleeveBySide: { player: null, opponent: "opponent-sleeve" },
    })).toEqual([expect.objectContaining({ cardId: "", group: "drawn", label: "Opponent Drew", faceDownImage: "opponent-sleeve" })]);
  });
});
