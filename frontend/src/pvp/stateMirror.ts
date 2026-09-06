import type { GameEvent, GameState, SideId } from "../../../shared/src/types";

const HIDDEN_CARD_ID = "";

function swapSideId(sideId: SideId): SideId {
  return sideId === "player" ? "opponent" : "player";
}

function swapCurrentSide(current: GameState["currentSide"]): GameState["currentSide"] {
  if (current === "done") return "done";
  return swapSideId(current);
}

export function mirrorGameState(state: GameState): GameState {
  const mirrored = structuredClone(state);

  const player = mirrored.sides.player;
  const opponent = mirrored.sides.opponent;
  mirrored.sides.player = opponent;
  mirrored.sides.opponent = player;

  mirrored.sides.player.id = "player";
  mirrored.sides.opponent.id = "opponent";

  mirrored.currentSide = swapCurrentSide(state.currentSide);
  mirrored.firstPlayer = swapSideId(state.firstPlayer);
  const playerTurns = mirrored.turnsTakenBySide.player;
  const opponentTurns = mirrored.turnsTakenBySide.opponent;
  mirrored.turnsTakenBySide.player = opponentTurns;
  mirrored.turnsTakenBySide.opponent = playerTurns;
  const playerHuman = mirrored.humanBySide.player;
  mirrored.humanBySide.player = mirrored.humanBySide.opponent;
  mirrored.humanBySide.opponent = playerHuman;
  const playerDeckStyle = mirrored.aiDeckStyleBySide.player;
  mirrored.aiDeckStyleBySide.player = mirrored.aiDeckStyleBySide.opponent;
  mirrored.aiDeckStyleBySide.opponent = playerDeckStyle;
  mirrored.winner = state.winner ? swapSideId(state.winner) : null;

  if (mirrored.stadium) {
    mirrored.stadium.owner = swapSideId(mirrored.stadium.owner);
  }

  if (mirrored.pendingPlayerChoice) {
    mirrored.pendingPlayerChoice.sideId = swapSideId(mirrored.pendingPlayerChoice.sideId);
  }

  if (mirrored.setup) {
    const playerReady = mirrored.setup.readyBySide.player;
    const opponentReady = mirrored.setup.readyBySide.opponent;
    mirrored.setup.readyBySide.player = opponentReady;
    mirrored.setup.readyBySide.opponent = playerReady;
    const playerOpeningHand = mirrored.setup.openingHands.player;
    mirrored.setup.openingHands.player = mirrored.setup.openingHands.opponent;
    mirrored.setup.openingHands.opponent = playerOpeningHand;
  }

  mirrored.log = mirrored.log.map((entry) => swapPerspectiveText(entry));
  if (state.events) mirrored.events = state.events.map(mirrorGameEvent);

  return mirrored;
}

export function mirrorGameStateForGuest(state: GameState): GameState {
  const mirrored = mirrorGameState(state);
  mirrored.log = mirrored.log.map((entry) => redactOpponentPrivateInfo(entry));
  return mirrored;
}

export function createGuestSyncState(state: GameState): GameState {
  const guestState = structuredClone(state);
  const hostSide = guestState.sides.player;
  hostSide.hand = createHiddenCardList(hostSide.hand.length);
  hostSide.deck = createHiddenCardList(hostSide.deck.length);
  hostSide.energyPool = [];
  if (guestState.setup) {
    guestState.setup.openingHands.player = createHiddenCardList(guestState.setup.openingHands.player.length);
  }
  // Event history is sent separately through projectGameEventsForSide. It is
  // deliberately omitted from the redacted state snapshot so future event
  // fields cannot accidentally reveal the host's private zones.
  delete guestState.events;
  delete guestState.nextEventId;
  delete guestState.nextTransitionId;
  delete guestState.activeTransitionId;
  // The guest receives this object before perspective mirroring. Redact private
  // host-zone actions here as well as in the guest display projection.
  guestState.log = guestState.log.map((entry) => redactHostPrivateInfo(entry));
  return guestState;
}

/**
 * Projects canonical events for a recipient before they cross the PvP wire.
 * Event IDs remain canonical so a reconnect can request/deliver only the
 * events after its cursor; private events never become part of the payload.
 */
export function projectGameEventsForSide(state: GameState, recipientSide: SideId, afterEventId = 0): GameEvent[] {
  return (state.events ?? [])
    .filter((event) => event.id > afterEventId && isGameEventVisibleToSide(event, recipientSide))
    .map((event) => projectGameEvent(event, recipientSide));
}

function isGameEventVisibleToSide(event: GameEvent, recipientSide: SideId): boolean {
  if (event.visibility === "public") return true;
  if (event.visibility === "private") return false;
  switch (event.kind) {
    case "attack": return event.actorSide === recipientSide;
    case "damage":
    case "heal": return (event.actorSide ?? event.targetSide) === recipientSide;
    case "knockout": return event.scoringSide === recipientSide;
    case "score":
    case "promotion":
    case "coin":
    case "turn":
    case "energy":
    case "evolution":
    case "status": return event.side === recipientSide;
    case "cardMovement": return event.side === recipientSide || event.to === "play" || event.to === "discard";
    case "gameEnd": return event.winner === recipientSide;
    case "message": return false;
  }
}

function projectGameEvent(event: GameEvent, recipientSide: SideId): GameEvent {
  if (
    event.kind !== "cardMovement"
    || !event.cardIds
    || event.side === recipientSide
    // Cards are public once they enter play or a discard pile. Keep those
    // identities available for opponent-facing animation and inspection,
    // while continuing to redact deck/hand identities.
    || event.to === "play"
    || event.to === "discard"
  ) return event;
  const { cardIds: _cardIds, ...withoutCardIds } = event;
  return withoutCardIds;
}

export function mirrorGameEvent(event: GameEvent): GameEvent {
  switch (event.kind) {
    case "attack":
      return { ...event, actorSide: swapSideId(event.actorSide), targetSide: swapSideId(event.targetSide) };
    case "damage":
    case "heal":
      return {
        ...event,
        ...(event.actorSide ? { actorSide: swapSideId(event.actorSide) } : {}),
        targetSide: swapSideId(event.targetSide),
      };
    case "knockout":
      return { ...event, scoringSide: swapSideId(event.scoringSide), knockedSide: swapSideId(event.knockedSide) };
    case "score":
    case "promotion":
    case "coin":
    case "turn":
    case "cardMovement":
    case "energy":
    case "evolution":
    case "status":
      return { ...event, side: swapSideId(event.side) };
    case "gameEnd":
      return { ...event, winner: swapSideId(event.winner) };
    case "message":
      return event;
  }
}

export function redactOpponentLogPrivateInfo(state: GameState): GameState {
  return {
    ...state,
    log: state.log.map((entry) => redactOpponentPrivateInfo(entry)),
  };
}

function swapPerspectiveText(entry: string): string {
  const youToken = "§0§";
  const youLowerToken = "§1§";
  const opponentToken = "§2§";
  const opponentLowerToken = "§3§";
  const yourToken = "§4§";
  const yourLowerToken = "§5§";
  const opponentPossessiveToken = "§6§";
  const opponentPossessiveLowerToken = "§7§";

  let swapped = entry;
  swapped = replaceAllLiteral(swapped, "Opponent's", opponentPossessiveToken);
  swapped = replaceAllLiteral(swapped, "opponent's", opponentPossessiveLowerToken);
  swapped = replaceAllLiteral(swapped, "Your", yourToken);
  swapped = replaceAllLiteral(swapped, "your", yourLowerToken);
  swapped = replaceAllLiteral(swapped, "Opponent", opponentToken);
  swapped = replaceAllLiteral(swapped, "opponent", opponentLowerToken);
  swapped = replaceAllLiteral(swapped, "You", youToken);
  swapped = replaceAllLiteral(swapped, "you", youLowerToken);

  swapped = replaceAllLiteral(swapped, opponentPossessiveToken, "Your");
  swapped = replaceAllLiteral(swapped, opponentPossessiveLowerToken, "your");
  swapped = replaceAllLiteral(swapped, yourToken, "Opponent's");
  swapped = replaceAllLiteral(swapped, yourLowerToken, "opponent's");
  swapped = replaceAllLiteral(swapped, opponentToken, "You");
  swapped = replaceAllLiteral(swapped, opponentLowerToken, "you");
  swapped = replaceAllLiteral(swapped, youToken, "Opponent");
  swapped = replaceAllLiteral(swapped, youLowerToken, "opponent");

  return swapped;
}

function redactOpponentPrivateInfo(entry: string): string {
  if (entry.startsWith("Opponent ")) {
    entry = entry
      .replace(" from your deck to your hand.", " from opponent's deck to opponent's hand.")
      .replace(" from your discard into your hand.", " from opponent's discard into opponent's hand.");
  }

  if (!entry.startsWith("Opponent")) return entry;

  if (/^Opponent added .+ from .*deck to .*hand\.?$/.test(entry)) {
    return "Opponent added 1 card from their deck to their hand.";
  }

  if (/^Opponent put .+ from .*discard into .*hand\.?$/.test(entry)) {
    return "Opponent put 1 card from discard into their hand.";
  }

  if (/^Opponent revealed .+ and added it to .*hand\.?$/.test(entry)) {
    return "Opponent revealed a card and added it to their hand.";
  }

  const drawnCountMatch = entry.match(/^Opponent drew (\d+) cards?\./);
  if (drawnCountMatch?.[1]) {
    const count = Number(drawnCountMatch[1]);
    return `Opponent drew ${count} ${count === 1 ? "card" : "cards"}.`;
  }
  if (entry.startsWith("Opponent drew ")) return "Opponent drew cards.";

  if (entry.includes(" discarded ") && entry.includes(" and drew ")) {
    const drawCount = entry.match(/ and drew (\d+) cards?\./);
    if (drawCount?.[1]) {
      const count = Number(drawCount[1]);
      return `Opponent discarded a card and drew ${count} ${count === 1 ? "card" : "cards"}.`;
    }
    return "Opponent discarded a card and drew cards.";
  }

  if (entry.startsWith("Opponent discarded ")) return "Opponent discarded a card.";

  return entry;
}

function redactHostPrivateInfo(entry: string): string {
  if (!entry.startsWith("You") && !entry.startsWith("Your")) return entry;

  if (/^You added .+ from .*deck to .*hand\.?$/.test(entry)) return "You added 1 card from your deck to your hand.";
  if (/^You put .+ from .*discard into .*hand\.?$/.test(entry)) return "You put 1 card from discard into your hand.";
  if (/^You revealed .+ and added it to .*hand\.?$/.test(entry)) return "You revealed a card and added it to your hand.";
  const drawnCountMatch = entry.match(/^You drew (\d+) cards?\./);
  if (drawnCountMatch?.[1]) {
    const count = Number(drawnCountMatch[1]);
    return `You drew ${count} ${count === 1 ? "card" : "cards"}.`;
  }
  if (entry.startsWith("You drew ")) return "You drew cards.";
  if (entry.includes(" discarded ") && entry.includes(" and drew ")) {
    const drawCount = entry.match(/ and drew (\d+) cards?\./);
    if (drawCount?.[1]) {
      const count = Number(drawCount[1]);
      return `You discarded a card and drew ${count} ${count === 1 ? "card" : "cards"}.`;
    }
    return "You discarded a card and drew cards.";
  }
  if (entry.startsWith("You discarded ")) return "You discarded a card.";
  return entry;
}

function replaceAllLiteral(input: string, search: string, replacement: string): string {
  return input.split(search).join(replacement);
}

function createHiddenCardList(count: number): string[] {
  return Array.from({ length: count }, () => HIDDEN_CARD_ID);
}
