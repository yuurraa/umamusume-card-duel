import { MAX_BENCH } from "../../../../../shared/src/gameData";
import type { GameState, PendingPlayerChoice, SideId, SideState, UmamusumeInstance } from "../../../../../shared/src/types";
import { getCard, getPrimaryAttack, getUmamusumeCard } from "../core/catalog";
import { actorName, actorPossessive, formatUmamusumeInstanceName } from "../core/labels";
import { log } from "../core/log";
import { attachedEnergyCount, getAllUmamusume } from "../core/umamusume";
import { retreatCost } from "./retreat";

export type SwitchAfterGustResume = Extract<PendingPlayerChoice, { kind: "switchAfterGust" }>["resume"];

export function getOpposingSide(state: GameState, sideId: SideId): SideState {
  return state.sides[sideId === "player" ? "opponent" : "player"];
}

export function refreshContinuousHp(state: GameState): void {
  normalizeBoardState(state);
  const basicHpBonus = getStadiumBasicHpBonus(state);
  refreshSideContinuousEffects(state, state.sides.player, basicHpBonus);
  refreshSideContinuousEffects(state, state.sides.opponent, basicHpBonus);
}

export function normalizeBoardState(state: GameState): void {
  normalizeSideBoard(state.sides.player);
  normalizeSideBoard(state.sides.opponent);
}

export function switchOutOpponentActive(
  state: GameState,
  actingSideId: SideId,
  pendingChoiceResume: SwitchAfterGustResume = "none",
): void {
  const opponent = getOpposingSide(state, actingSideId);
  if (!opponent.active) return;
  if (state.humanBySide[opponent.id]) {
    if (opponent.bench.length === 0) return;
    state.pendingPlayerChoice = {
      kind: "switchAfterGust",
      sideId: opponent.id,
      resume: pendingChoiceResume,
    };
    log(state, `${actorName(opponent)} must choose the benched Umamusume to switch in.`);
    return;
  }
  const replacementIndex = choosePreferredActiveIndex(opponent);
  if (replacementIndex < 0) return;
  const replacement = opponent.bench.splice(replacementIndex, 1)[0];
  if (!replacement) return;
  const switchedOut = opponent.active;
  opponent.bench.push(switchedOut);
  opponent.active = replacement;
  log(state, `${actorName(opponent)} switched to ${formatUmamusumeInstanceName(replacement)}.`);
}

export function choosePreferredActiveIndex(side: SideState): number {
  let bestIndex = -1;
  let bestScore = Number.NEGATIVE_INFINITY;

  side.bench.forEach((umamusume, index) => {
    const card = getUmamusumeCard(umamusume);
    const attack = getPrimaryAttack(card);
    const score = umamusume.hp + attachedEnergyCount(umamusume) * 20 + attack.damage - retreatCost(card.retreat) * 6;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function normalizeSideBoard(side: SideState): void {
  const activeUid = side.active?.uid;
  const seen = new Set<number>();
  const cleanBench: UmamusumeInstance[] = [];
  const overflow: UmamusumeInstance[] = [];

  side.bench.forEach((umamusume) => {
    if (umamusume.uid === activeUid || seen.has(umamusume.uid)) return;
    seen.add(umamusume.uid);
    if (cleanBench.length < MAX_BENCH) {
      cleanBench.push(umamusume);
      return;
    }
    overflow.push(umamusume);
  });

  if (overflow.length > 0) {
    overflow.forEach((umamusume) => {
      side.discard.push(umamusume.cardId);
      if (umamusume.toolCardId) side.discard.push(umamusume.toolCardId);
    });
  }
  side.bench = cleanBench;
}

function getStadiumBasicHpBonus(state: GameState): number {
  if (!state.stadium) return 0;
  const stadium = getCard(state.stadium.cardId);
  if (stadium.kind !== "trainer") return 0;
  return stadium.effect.basicHpBonus ?? 0;
}

function refreshSideContinuousEffects(state: GameState, side: SideState, basicHpBonus: number): void {
  const activeHpBonus = getAllUmamusume(side).reduce((best, umamusume) => {
    const bonus = getUmamusumeCard(umamusume).ability?.activeHpBonus ?? 0;
    return Math.max(best, bonus);
  }, 0);

  getAllUmamusume(side).forEach((umamusume) => {
    const card = getUmamusumeCard(umamusume);
    const printedHp = card.hp;
    const previousMaxHp = umamusume.maxHp;
    const previousHp = umamusume.hp;
    const stadiumHpBonus = card.stage === 0 ? basicHpBonus : 0;
    const targetMaxHp = printedHp + stadiumHpBonus + (umamusume.uid === side.active?.uid ? activeHpBonus : 0);
    const damage = umamusume.maxHp - umamusume.hp;
    const nextHp = Math.max(0, Math.min(targetMaxHp, targetMaxHp - damage));
    umamusume.maxHp = targetMaxHp;
    umamusume.hp = nextHp;

    if (previousHp > 0 && nextHp <= 0 && targetMaxHp < previousMaxHp) {
      log(state, `${actorPossessive(side)} ${formatUmamusumeInstanceName(umamusume)} was knocked out by a max HP reduction effect.`);
    }
  });
}
