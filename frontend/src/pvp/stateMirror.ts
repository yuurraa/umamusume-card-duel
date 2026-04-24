import type { GameState, SideId } from "../../../shared/src/types";

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
  mirrored.winner = state.winner ? swapSideId(state.winner) : null;

  if (mirrored.stadium) {
    mirrored.stadium.owner = swapSideId(mirrored.stadium.owner);
  }

  if (mirrored.pendingPlayerChoice) {
    mirrored.pendingPlayerChoice.sideId = swapSideId(mirrored.pendingPlayerChoice.sideId);
  }

  if (mirrored.setup) {
    mirrored.setup.coinFlipResult = mirrored.setup.coinFlipResult === "heads" ? "tails" : "heads";
    const playerReady = mirrored.setup.readyBySide.player;
    const opponentReady = mirrored.setup.readyBySide.opponent;
    mirrored.setup.readyBySide.player = opponentReady;
    mirrored.setup.readyBySide.opponent = playerReady;
  }

  mirrored.log = mirrored.log.map((entry) => swapPerspectiveText(entry));

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
  return guestState;
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

function replaceAllLiteral(input: string, search: string, replacement: string): string {
  return input.split(search).join(replacement);
}

function createHiddenCardList(count: number): string[] {
  return Array.from({ length: count }, () => HIDDEN_CARD_ID);
}
