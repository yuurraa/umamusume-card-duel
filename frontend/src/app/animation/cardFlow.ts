import { getCard } from "../../game/engine";
import type { CardFlowItem } from "../../match/feedback/CardFlowOverlay";
import type { GameState, SideId, SideState } from "../../../../shared/src/types";
import { getNewLogHeadEntries } from "../matchLog";

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
  log: string[];
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
    log: [...game.log],
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
  const newLogEntries = getNewLogHeadEntries(previous.log, current.log);
  const sideIds: SideId[] = ["player", "opponent"];
  for (const sideId of sideIds) {
    const previousSide = previous[sideId];
    const currentSide = current[sideId];
    const isPovSide = sideId === povSideId;
    const actor = isPovSide ? "You" : "Opponent";
    const fadeOutInPlace = !isPovSide;
    const sideOnRight = sideId === "player";
    const discardedFromHandCards = allCardsMoved(
      previousSide.hand,
      currentSide.hand,
      previousSide.discard,
      currentSide.discard,
    );
    const retrievedIntoDeckCards = allCardsMoved(
      previousSide.inPlay,
      currentSide.inPlay,
      previousSide.deck,
      currentSide.deck,
    );
    let obtainedFromDeckCards = subtractCardLists(currentSide.hand, previousSide.hand);
    const shuffleDrawCount = getShuffleHandDrawCount(previous.log, current.log, sideId);
    if (shuffleDrawCount && obtainedFromDeckCards.length < shuffleDrawCount) {
      // For effects like Tracen Academy, a card may leave hand, shuffle into deck, then be redrawn.
      // Diff alone misses those redraws, so take the freshly rebuilt hand tail by drawn count.
      obtainedFromDeckCards = currentSide.hand.slice(-shuffleDrawCount);
    }
    const shouldShowHandGain = hasHandGainLogEntry(newLogEntries, sideId)
      || isAutomaticTurnDraw(previous, current, sideId, obtainedFromDeckCards);
    if (obtainedFromDeckCards.length > 0 && shouldShowHandGain) {
      const label = `${actor} Drew`;
      obtainedFromDeckCards.slice(0, 5).forEach((cardId) => {
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

    discardedFromHandCards.slice(0, 5).forEach((discardedFromHand) => {
      const cardName = tryGetCardName(discardedFromHand);
      const played = Boolean(cardName && hasPlayLogEntry(previous.log, current.log, cardName));
      const discarded = hasHandDiscardLogEntry(newLogEntries, sideId, cardName);
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

function hasPlayLogEntry(previousLog: string[], currentLog: string[], cardName: string): boolean {
  const newEntries = getNewLogHeadEntries(previousLog, currentLog);
  return newEntries.some((entry) => entry.includes(`played ${cardName}.`));
}

function hasHandGainLogEntry(newEntries: string[], sideId: SideId): boolean {
  const actor = sideId === "player" ? "You" : "Opponent";
  return newEntries.some((entry) => (
    entry.startsWith(`${actor} drew `)
    || (entry.startsWith(`${actor} added `) && entry.includes(" hand"))
    || (entry.startsWith(`${actor} revealed `) && entry.includes("added it to") && entry.includes(" hand"))
    || (entry.startsWith(`${actor} put `) && entry.includes(" into ") && entry.includes(" hand"))
  ));
}

function hasHandDiscardLogEntry(newEntries: string[], sideId: SideId, cardName: string | null): boolean {
  const actor = sideId === "player" ? "You" : "Opponent";
  return newEntries.some((entry) => {
    if (!entry.startsWith(`${actor} discarded `)) return false;
    return !cardName || entry.includes(cardName) || /\bdiscarded \d+ cards?\b/i.test(entry) || entry.includes("discarded 1 card");
  });
}

function isAutomaticTurnDraw(
  previous: { currentSide: GameState["currentSide"]; player: { deck: string[] }; opponent: { deck: string[] } },
  current: { currentSide: GameState["currentSide"]; player: { deck: string[] }; opponent: { deck: string[] } },
  sideId: SideId,
  gainedCards: string[],
): boolean {
  return gainedCards.length === 1
    && previous.currentSide !== current.currentSide
    && current.currentSide === sideId
    && current[sideId].deck.length === previous[sideId].deck.length - 1;
}

function getShuffleHandDrawCount(previousLog: string[], currentLog: string[], sideId: SideId): number | null {
  const actor = sideId === "player" ? "You" : "Opponent";
  const newEntries = getNewLogHeadEntries(previousLog, currentLog);
  const entry = newEntries.find((line) => line.startsWith(`${actor} used `) && line.includes(" shuffled ") && line.includes(" and drew "));
  if (!entry) return null;
  const match = entry.match(/ and drew (\d+) cards?\./);
  if (!match?.[1]) return null;
  const count = Number(match[1]);
  return Number.isFinite(count) && count > 0 ? count : null;
}

function tryGetCardName(cardId: string): string | null {
  try {
    return getCard(cardId).name;
  } catch {
    return null;
  }
}
