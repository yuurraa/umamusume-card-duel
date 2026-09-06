import { getNewGameEvents } from "../../game/engine";
import type { CardFlowItem } from "../../match/feedback/CardFlowOverlay";
import type { GameEvent, GameState, SideId, SideState } from "../../../../shared/src/types";

export type PlayerZoneSnapshot = {
  hand: string[];
  deck: string[];
  discard: string[];
  inPlay: string[];
};

export type PlayerZonesSnapshot = {
  player: PlayerZoneSnapshot;
  opponent: PlayerZoneSnapshot;
  currentSide: GameState["currentSide"];
  turnNumber: number;
  phase: GameState["phase"];
  events: GameEvent[];
};

export function createPlayerZonesSnapshot(game: GameState): PlayerZonesSnapshot {
  return {
    player: {
      hand: [...game.sides.player.hand],
      deck: [...game.sides.player.deck],
      discard: [...game.sides.player.discard],
      inPlay: getInPlayCardIds(game.sides.player),
    },
    opponent: {
      hand: [...game.sides.opponent.hand],
      deck: [...game.sides.opponent.deck],
      discard: [...game.sides.opponent.discard],
      inPlay: getInPlayCardIds(game.sides.opponent),
    },
    currentSide: game.currentSide,
    turnNumber: game.turnNumber,
    phase: game.phase,
    events: [...(game.events ?? [])],
  };
}

export function buildCardFlowItems({
  previous,
  current,
  povSideId,
  sleeveBySide,
}: {
  previous: PlayerZonesSnapshot;
  current: PlayerZonesSnapshot;
  povSideId: SideId;
  sleeveBySide: Record<SideId, string | null>;
}): CardFlowItem[] {
  const nextFlow: CardFlowItem[] = [];
  const newEvents = getNewGameEvents(previous.events, current.events);
  const sideIds: SideId[] = ["player", "opponent"];
  for (const sideId of sideIds) {
    const previousSide = previous[sideId];
    const currentSide = current[sideId];
    const isPovSide = sideId === povSideId;
    const actor = isPovSide ? "You" : "Opponent";
    const fadeOutInPlace = !isPovSide;
    const sideOnRight = sideId === "player";
    const playedFromHandCards = allCardsMoved(
      previousSide.hand,
      currentSide.hand,
      previousSide.inPlay,
      currentSide.inPlay,
    );
    const discardedFromHandCards = allCardsMoved(
      previousSide.hand,
      currentSide.hand,
      previousSide.discard,
      currentSide.discard,
    );
    const structuredPlayedCards = getStructuredCardMovementCounts(newEvents, sideId, "play");
    const structuredDiscardedCards = getStructuredCardMovementCounts(newEvents, sideId, "discard");
    const deckToHandEvents = getStructuredCardMovements(newEvents, sideId, "deck", "hand");
    const retrievedIntoDeckCards = allCardsMoved(
      previousSide.inPlay,
      currentSide.inPlay,
      previousSide.deck,
      currentSide.deck,
    );
    let obtainedFromDeckCards = subtractCardLists(currentSide.hand, previousSide.hand);
    const structuredDrawnCards = resolveStructuredCardIds(deckToHandEvents, obtainedFromDeckCards, isPovSide, sleeveBySide[sideId]);
    if (structuredDrawnCards.length > 0) {
      const label = `${actor} Drew`;
      structuredDrawnCards.slice(0, 5).forEach((cardId) => {
        nextFlow.push({
          cardId,
          label,
          group: "drawn",
          enterFrom: sideOnRight ? "leftDeck" : "bottomLeft",
          exitTo: "bottomCenter",
          faceDownImage: isPovSide ? undefined : sleeveBySide[sideId],
          fadeOutInPlace,
        });
      });
    }
    if (retrievedIntoDeckCards.length > 0) {
      retrievedIntoDeckCards.slice(0, 8).forEach((cardId) => {
        nextFlow.push({
          cardId,
          label: `${actor} Retrieved`,
          group: "retrieved",
          enterFrom: sideOnRight ? "bottomRight" : "bottomLeft",
          exitTo: "leftDeck",
          faceDownImage: isPovSide ? undefined : sleeveBySide[sideId],
          fadeOutInPlace,
        });
      });
    }

    [...playedFromHandCards, ...discardedFromHandCards].slice(0, 5).forEach((discardedFromHand) => {
      const played = consumeCardMovement(structuredPlayedCards, discardedFromHand)
        || false;
      const discarded = consumeCardMovement(structuredDiscardedCards, discardedFromHand)
        || false;
      if (!played && !discarded) return;

      nextFlow.push({
        cardId: discardedFromHand,
        label: played ? `${actor} Played` : `${actor} Discarded`,
        group: played ? "played" : "discarded",
        enterFrom: sideOnRight ? "rightHand" : "leftHand",
        exitTo: isPovSide ? "rightDiscard" : sideOnRight ? "rightHand" : "leftHand",
        faceDownImage: !played && !isPovSide ? sleeveBySide[sideId] : undefined,
        fadeOutInPlace,
      });
    });
  }

  return nextFlow;
}

function getStructuredCardMovementCounts(
  events: GameEvent[],
  sideId: SideId,
  destination: "play" | "discard",
): Map<string, number> {
  const counts = new Map<string, number>();
  events.forEach((event) => {
    if (event.kind !== "cardMovement" || event.side !== sideId || event.from !== "hand" || event.to !== destination) return;
    (event.cardIds ?? []).forEach((cardId) => counts.set(cardId, (counts.get(cardId) ?? 0) + 1));
  });
  return counts;
}

function getStructuredCardMovements(
  events: GameEvent[],
  sideId: SideId,
  from: Extract<GameEvent, { kind: "cardMovement" }>['from'],
  to: Extract<GameEvent, { kind: "cardMovement" }>['to'],
): Extract<GameEvent, { kind: "cardMovement" }>[] {
  return events.filter((event): event is Extract<GameEvent, { kind: "cardMovement" }> => (
    event.kind === "cardMovement" && event.side === sideId && event.from === from && event.to === to
  ));
}

function resolveStructuredCardIds(
  movements: Extract<GameEvent, { kind: "cardMovement" }>[],
  stateDiffIds: string[],
  isPovSide: boolean,
  sleeveImage: string | null,
): string[] {
  if (movements.length === 0) return [];
  const knownIds = movements.flatMap((event) => event.cardIds ?? []);
  const expectedCount = movements.reduce((sum, event) => sum + event.count, 0);
  const fallbackIds = stateDiffIds.slice(0, Math.max(0, expectedCount - knownIds.length));
  const resolved = [...knownIds, ...fallbackIds];
  if (resolved.length >= expectedCount) return resolved.slice(0, expectedCount);
  // A recipient may know only the movement count for an opponent's hidden draw.
  // The overlay can still render a sleeve-backed card without inventing its ID.
  if (!isPovSide && sleeveImage) {
    return [...resolved, ...Array.from({ length: expectedCount - resolved.length }, () => "")];
  }
  return resolved;
}

function consumeCardMovement(counts: Map<string, number>, cardId: string): boolean {
  const remaining = counts.get(cardId) ?? 0;
  if (remaining <= 0) return false;
  if (remaining === 1) counts.delete(cardId);
  else counts.set(cardId, remaining - 1);
  return true;
}

export function splitCardFlowIntoBatches(items: CardFlowItem[]): CardFlowItem[][] {
  return [items];
}

export function cardFlowBatchKey(items: CardFlowItem[]): string {
  return items
    .map((item) => [
      item.group ?? "unknown",
      item.label ?? "",
      item.cardId,
      item.enterFrom,
      item.exitTo,
      item.faceDownImage ? "face-down" : "face-up",
    ].join(":"))
    .join("|");
}

function subtractCardLists(source: string[], minus: string[]): string[] {
  const minusCounts = new Map<string, number>();
  for (const cardId of minus) minusCounts.set(cardId, (minusCounts.get(cardId) ?? 0) + 1);
  const result: string[] = [];
  for (const cardId of source) {
    const remaining = minusCounts.get(cardId) ?? 0;
    if (remaining > 0) {
      minusCounts.set(cardId, remaining - 1);
      continue;
    }
    result.push(cardId);
  }
  return result;
}

function allCardsMoved(fromBefore: string[], fromAfter: string[], toBefore: string[], toAfter: string[]): string[] {
  const removed = subtractCardLists(fromBefore, fromAfter);
  if (removed.length === 0) return [];
  const added = subtractCardLists(toAfter, toBefore);
  if (added.length === 0) return [];
  const addedCounts = new Map<string, number>();
  for (const cardId of added) addedCounts.set(cardId, (addedCounts.get(cardId) ?? 0) + 1);
  const moved: string[] = [];
  for (const cardId of removed) {
    const remaining = addedCounts.get(cardId) ?? 0;
    if (remaining <= 0) continue;
    moved.push(cardId);
    addedCounts.set(cardId, remaining - 1);
  }
  return moved;
}

function getInPlayCardIds(side: SideState): string[] {
  const collectFromUmamusume = (umamusume: SideState["active"]): string[] => {
    if (!umamusume) return [];
    return [...(umamusume.evolutionCardIds ?? []), umamusume.cardId, ...(umamusume.toolCardId ? [umamusume.toolCardId] : [])];
  };
  return [
    ...collectFromUmamusume(side.active),
    ...side.bench.flatMap((umamusume) => collectFromUmamusume(umamusume)),
  ];
}
