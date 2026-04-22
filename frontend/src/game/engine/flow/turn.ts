import { MAX_HAND } from "../../../../../shared/src/gameData";
import type { GameState, SideId, SideState } from "../../../../../shared/src/types";
import { actorName, actorPossessive, formatUmamusumeCardName } from "../core/labels";
import { log } from "../core/log";
import { getAllUmamusume } from "../core/umamusume";
import { getUmamusumeCard } from "../core/catalog";
import { rollEnergyFromPool } from "../core/random";

export function prepareUmamusumeForTurn(side: SideState): void {
  getAllUmamusume(side).forEach((umamusume) => {
    umamusume.tookDamageLastTurn = umamusume.tookDamageThisTurn;
    umamusume.tookDamageThisTurn = false;
    umamusume.nextTurnDamageReduction = 0;
    umamusume.usedAbilityThisTurn = false;
  });
}

export function drawCards(state: GameState, side: SideState, amount: number): string[] {
  const drawnCardIds: string[] = [];
  for (let count = 0; count < amount; count += 1) {
    if (side.hand.length >= MAX_HAND) {
      log(state, `${actorPossessive(side)} hand was full.`);
      return drawnCardIds;
    }
    const card = side.deck.shift();
    if (!card) {
      log(state, `${actorName(side)} could not draw, but there was no deck-out loss.`);
      return drawnCardIds;
    }
    side.hand.push(card);
    drawnCardIds.push(card);
  }
  return drawnCardIds;
}

export function applyStartAbilities(state: GameState, side: SideState): void {
  if (!side.active) return;
  const card = getUmamusumeCard(side.active);
  if (!card.ability) return;
  if (!card.ability.heal) return;
  const before = side.active.hp;
  side.active.hp = Math.min(side.active.maxHp, side.active.hp + card.ability.heal);
  const healed = side.active.hp - before;
  if (healed > 0) log(state, `${actorPossessive(side)} ${formatUmamusumeCardName(card)} healed ${healed} HP with ${card.ability.name}.`);
}

export function startTurn(
  state: GameState,
  sideId: SideId,
  refreshContinuousEffects: (state: GameState) => void,
  skipDraw = false,
): void {
  const side = state.sides[sideId];
  const turnsTaken = state.turnsTakenBySide[sideId] ?? 0;
  const isSideFirstTurn = turnsTaken === 0;
  state.turnsTakenBySide[sideId] = turnsTaken + 1;
  state.currentSide = sideId;
  state.opponentTurnStep = sideId === "opponent" ? "bench" : null;
  side.energyAttachmentsThisTurn = 0;
  side.bonusEnergyAttachments = 0;
  side.retreatCostReduction = 0;
  side.activeAttackDamageBonus = 0;
  side.usedSupporterThisTurn = false;
  side.usedRetreatThisTurn = false;
  side.usedStadiumThisTurn = false;
  side.usedAbilityNamesThisTurn = [];
  prepareUmamusumeForTurn(side);
  side.energyZone = [];
  if (!(isSideFirstTurn && state.firstPlayer === sideId)) {
    side.energyZone.push(rollEnergyFromPool(side.energyPool));
  }
  refreshContinuousEffects(state);
  applyStartAbilities(state, side);
  if (!skipDraw) drawCards(state, side, 1);
}

export function endTurn(state: GameState, startTurnImpl: (state: GameState, sideId: SideId) => void): void {
  if (state.gameOver || state.currentSide === "done") return;
  const nextSide: SideId = state.currentSide === "player" ? "opponent" : "player";
  if (nextSide === state.firstPlayer) state.turnNumber += 1;
  startTurnImpl(state, nextSide);
}
