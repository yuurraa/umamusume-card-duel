import type { GameState, SideId, SideState } from "../../../shared/src/types";

export function toPerspectiveGame(game: GameState, perspective: SideId): GameState {
  if (perspective === "player") {
    return {
      ...game,
      sides: {
        player: toDisplaySide(game.sides.player, "player", "You"),
        opponent: toDisplaySide(game.sides.opponent, "opponent", "Opponent"),
      },
    };
  }

  return {
    ...game,
    currentSide: swapSideId(game.currentSide),
    firstPlayer: swapSideId(game.firstPlayer) as SideId,
    winner: game.winner ? swapSideId(game.winner) as SideId : null,
    pendingPlayerChoice: game.pendingPlayerChoice
      ? { ...game.pendingPlayerChoice, sideId: swapSideId(game.pendingPlayerChoice.sideId) as SideId }
      : null,
    stadium: game.stadium ? { ...game.stadium, owner: swapSideId(game.stadium.owner) as SideId } : null,
    setup: game.setup
      ? {
          ...game.setup,
          openingHands: {
            player: game.setup.openingHands.opponent,
            opponent: game.setup.openingHands.player,
          },
          readyBySide: {
            player: game.setup.readyBySide.opponent,
            opponent: game.setup.readyBySide.player,
          },
        }
      : null,
    turnsTakenBySide: {
      player: game.turnsTakenBySide.opponent,
      opponent: game.turnsTakenBySide.player,
    },
    sides: {
      player: toDisplaySide(game.sides.opponent, "player", "You"),
      opponent: toDisplaySide(game.sides.player, "opponent", "Opponent"),
    },
  };
}

function toDisplaySide(side: SideState, id: SideId, title: string): SideState {
  return { ...side, id, title };
}

function swapSideId(sideId: SideId | "done"): SideId | "done" {
  if (sideId === "player") return "opponent";
  if (sideId === "opponent") return "player";
  return sideId;
}

export function swapBattlePerspectiveText(text: string): string {
  const replacements: Array<[string, string]> = [
    ["Opponent is", "§YOU_CAP§ are"],
    ["opponent is", "§YOU_LOW§ are"],
    ["Opponent was", "§YOU_CAP§ were"],
    ["opponent was", "§YOU_LOW§ were"],
    ["Opponent has", "§YOU_CAP§ have"],
    ["opponent has", "§YOU_LOW§ have"],
    ["Opponent's", "§YOU_POS_CAP§"],
    ["opponent's", "§YOU_POS_LOW§"],
    ["Your", "§OPP_POS_CAP§"],
    ["your", "§OPP_POS_LOW§"],
    ["Opponent", "§YOU_CAP§"],
    ["opponent", "§YOU_LOW§"],
    ["You are", "§OPP_CAP§ is"],
    ["you are", "§OPP_LOW§ is"],
    ["You were", "§OPP_CAP§ was"],
    ["you were", "§OPP_LOW§ was"],
    ["You have", "§OPP_CAP§ has"],
    ["you have", "§OPP_LOW§ has"],
    ["You ", "§OPP_CAP§ "],
    ["you ", "§OPP_LOW§ "],
  ];

  let formatted = text;
  replacements.forEach(([search, replacement]) => {
    formatted = formatted.split(search).join(replacement);
  });

  return formatted
    .split("§YOU_POS_CAP§").join("Your")
    .split("§YOU_POS_LOW§").join("your")
    .split("§OPP_POS_CAP§").join("Opponent's")
    .split("§OPP_POS_LOW§").join("opponent's")
    .split("§YOU_CAP§").join("You")
    .split("§YOU_LOW§").join("you")
    .split("§OPP_CAP§").join("Opponent")
    .split("§OPP_LOW§").join("opponent");
}

export function redactHiddenSidePrivateInfo(entry: string): string {
  if (!entry.startsWith("Opponent")) return entry;
  if (/^Opponent added .+ from .*deck to .*hand\.?$/.test(entry)) return "Opponent added 1 card from their deck to their hand.";
  if (/^Opponent put .+ from .*discard into .*hand\.?$/.test(entry)) return "Opponent put 1 card from discard into their hand.";
  if (/^Opponent revealed .+ and added it to .*hand\.?$/.test(entry)) return "Opponent revealed a card and added it to their hand.";
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
