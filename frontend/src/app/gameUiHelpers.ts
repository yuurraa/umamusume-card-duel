import { MAX_BENCH } from "../../../shared/src/gameData";
import type { EnergyType, GameState, SideId, UmamusumeInstance } from "../../../shared/src/types";
import { canAttack, getAllUmamusume, getCard, getPrimaryAttack, getUmamusumeCard } from "../game/engine";

export type CoinFlipEvent = {
  id: number;
  result: "heads" | "tails";
  message: string;
};

export const RETREAT_ENERGY_ORDER: EnergyType[] = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "steel", "colorless", "dragon"];

export function chooseAiSetupSelection(game: GameState): { activeIndex: number; benchIndexes: number[] } | null {
  const player = game.sides.player;
  const basics = player.hand
    .map((cardId, handIndex) => ({ cardId, handIndex }))
    .flatMap(({ cardId, handIndex }) => {
      const card = getCard(cardId);
      if (card.kind !== "umamusume" || card.stage !== 0) return [];
      const attack = getPrimaryAttack(card);
      const score = card.hp + attack.damage * 1.8;
      return [{ handIndex, score }];
    })
    .sort((left, right) => right.score - left.score);
  const active = basics[0];
  if (!active) return null;
  const benchIndexes = basics
    .slice(1, MAX_BENCH + 1)
    .map((entry) => entry.handIndex);
  return { activeIndex: active.handIndex, benchIndexes };
}

export function choosePreferredBenchUid(side: GameState["sides"]["player"]): number | undefined {
  const best = [...side.bench]
    .sort((left, right) => scoreReplacementTarget(right) - scoreReplacementTarget(left))[0];
  return best?.uid;
}

function scoreReplacementTarget(umamusume: UmamusumeInstance): number {
  const attack = getPrimaryAttack(getUmamusumeCard(umamusume));
  const energies = Object.values(umamusume.energies).reduce((sum, amount) => sum + amount, 0);
  return umamusume.hp + energies * 20 + attack.damage + umamusume.stage * 16;
}

export function getNewLogEntries(currentLog: string[], previousLog: string[]): string[] {
  if (previousLog.length === 0) return currentLog;

  for (let startIndex = 0; startIndex < currentLog.length; startIndex += 1) {
    if (currentLog[startIndex] !== previousLog[0]) continue;
    const overlap = Math.min(currentLog.length - startIndex, previousLog.length);
    let matches = true;
    for (let index = 0; index < overlap; index += 1) {
      if (currentLog[startIndex + index] !== previousLog[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return currentLog.slice(0, startIndex);
  }

  return currentLog;
}

export function getKoCauseFromEntries(newEntries: string[], koEntry: string): string | null {
  if (koEntry.includes(" by ")) return null;

  const maxHpCause = newEntries.find((entry) => entry.includes("max HP was reduced"));
  if (maxHpCause) return "max HP reduction";
  return null;
}

export function formatKoActionNotice(koEntry: string, koCause: string | null): string {
  const normalizedEntry = koEntry.endsWith(".") ? koEntry.slice(0, -1) : koEntry;
  return koCause
    ? `KO | ${normalizedEntry} | Cause: ${koCause}`
    : `KO | ${normalizedEntry}`;
}

export function getTopActionBanner(game: GameState): { title: string; message: string; paused: boolean } | null {
  if (game.phase !== "play" || game.gameOver) return null;

  if (game.pendingPlayerChoice && game.currentSide === "opponent") {
    return {
      title: "Opponent is waiting",
      message: game.log[0] ?? "Choose your next active Umamusume.",
      paused: true,
    };
  }

  const latest = game.log[0];
  if (game.currentSide === "player") {
    return {
      title: "Your turn",
      message: latest?.startsWith("You ") ? latest : "Your turn.",
      paused: false,
    };
  }

  return {
    title: "Opponent turn",
    message: latest && (latest.includes("Opponent") || latest.includes("coin flip")) ? latest : "Opponent planned their turn.",
    paused: false,
  };
}

export function isBottomActionNotice(notice: string): boolean {
  return notice.startsWith("KO |");
}

export function getActionNoticeTone(notice: string): "default" | "danger" | "info" {
  if (notice.startsWith("KO | Opponent's")) return "info";
  if (notice.startsWith("KO |")) return "danger";
  return "default";
}

export function getPendingAttackCoinFlip(state: GameState, attackerId: SideId, id: number): CoinFlipEvent | null {
  if (state.phase !== "play") return null;
  if (attackerId === "opponent" && (state.currentSide !== "opponent" || state.opponentTurnStep !== "attack")) return null;
  if (attackerId === "player" && state.currentSide !== "player") return null;

  const attacker = state.sides[attackerId];
  if (!attacker.active) return null;
  if (!canAttack(state, attacker)) return null;
  const attack = getPrimaryAttack(getUmamusumeCard(attacker.active));
  if (!attack.coinBonus && !attack.drawOnHeads) return null;

  const result = Math.random() >= 0.5 ? "heads" : "tails";
  const actor = attackerId === "player" ? "You" : "Opponent";
  return { id, result, message: `${actor} flipped a coin and got 1x ${result}.` };
}

export function toCoinFlipEvent(entry: string, id: number): CoinFlipEvent | null {
  const lowered = entry.toLowerCase();
  if (!lowered.includes("coin flip was") && !lowered.includes("flipped a coin and got") && !lowered.includes("flip a coin and got")) return null;
  const resultMatch = entry.match(/\b(heads|tails)\b/i);
  if (!resultMatch) return null;
  const result = resultMatch[1]?.toLowerCase() === "tails" ? "tails" : "heads";
  return { id, result, message: entry };
}
