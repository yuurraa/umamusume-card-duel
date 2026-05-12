import { MAX_HAND } from "../../../../../shared/src/gameData";
import type { GameState, SideId, SideState } from "../../../../../shared/src/types";
import { actorName, actorPossessive, formatUmamusumeCardName, formatUmamusumeInstanceName } from "../core/labels";
import { log } from "../core/log";
import { getAllUmamusume } from "../core/umamusume";
import { getCard, getUmamusumeCard } from "../core/catalog";
import { rollEnergyFromPool } from "../core/random";
import { getUmamusumeAbility } from "./abilityRules";
import { clearSpecialConditions } from "./specialConditions";

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
  const ability = getUmamusumeAbility(state, side.id, side.active);
  if (!ability?.heal) return;
  const before = side.active.hp;
  side.active.hp = Math.min(side.active.maxHp, side.active.hp + ability.heal);
  const healed = side.active.hp - before;
  if (healed > 0) log(state, `${actorPossessive(side)} ${formatUmamusumeCardName(card)} healed ${healed} HP with ${ability.name}.`);
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

export function endTurn(
  state: GameState,
  startTurnImpl: (state: GameState, sideId: SideId) => void,
  refreshContinuousEffects: (state: GameState) => void,
): void {
  if (state.gameOver || state.currentSide === "done") return;
  processEndTurnStatusConditions(state);
  applyEndTurnToolTriggers(state, state.currentSide);
  refreshContinuousEffects(state);
  if (
    state.pendingPlayerChoice
    && state.pendingPlayerChoice.kind === "promoteAfterKnockout"
    && state.pendingPlayerChoice.sideId === state.currentSide
  ) {
    state.pendingPlayerChoice.resume = "finishOpponentTurn";
  }
  if (state.gameOver || state.pendingPlayerChoice) return;
  const nextSide: SideId = state.currentSide === "player" ? "opponent" : "player";
  if (nextSide === state.firstPlayer) state.turnNumber += 1;
  startTurnImpl(state, nextSide);
}

function applyEndTurnToolTriggers(state: GameState, sideId: SideId): void {
  if (areToolsDisabled(state)) return;
  const ownerSide = state.sides[sideId];
  getAllUmamusume(ownerSide).forEach((umamusume) => {
    if (!umamusume.toolCardId) return;
    const toolCardId = umamusume.toolCardId;
    const tool = getCard(toolCardId);
    if (tool.kind !== "trainer") return;
    const heal = tool.effect.toolEndTurnHealActive ?? 0;
    const isActive = ownerSide.active?.uid === umamusume.uid;
    if (heal > 0 && isActive) {
      const before = umamusume.hp;
      umamusume.hp = Math.min(umamusume.maxHp, umamusume.hp + heal);
      const healed = umamusume.hp - before;
      if (healed > 0) log(state, `${tool.name} healed ${formatUmamusumeInstanceName(umamusume)} for ${healed} HP.`);
    }
    if (tool.effect.toolEndTurnRecoverSpecialConditionsDiscardSelf && umamusume.specialConditions.length > 0) {
      clearSpecialConditions(umamusume);
      ownerSide.discard.push(toolCardId);
      umamusume.toolCardId = null;
      log(state, `${tool.name} cleared all Special Conditions from ${formatUmamusumeInstanceName(umamusume)} and was discarded.`);
    }
  });
}

function areToolsDisabled(state: GameState): boolean {
  if (!state.stadium) return false;
  const stadium = getCard(state.stadium.cardId);
  return stadium.kind === "trainer" && Boolean(stadium.effect.disableTools);
}

function processEndTurnStatusConditions(state: GameState): void {
  (["player", "opponent"] as SideId[]).forEach((sideId) => {
    const side = state.sides[sideId];
    getAllUmamusume(side).forEach((umamusume) => {
      if (umamusume.specialConditions.includes("poisoned")) {
        umamusume.hp = Math.max(0, umamusume.hp - 10);
        umamusume.tookDamageThisTurn = true;
        log(state, `${formatUmamusumeInstanceName(umamusume)} took 10 damage from Poison.`);
      }
      if (!umamusume.specialConditions.includes("paralysed")) return;
      const recoveryTurn = umamusume.paralysedUntilOwnTurn;
      if (recoveryTurn === null) return;
      const turnsTaken = state.turnsTakenBySide[sideId] ?? 0;
      if (turnsTaken < recoveryTurn) return;
      umamusume.specialConditions = umamusume.specialConditions.filter((condition) => condition !== "paralysed");
      umamusume.paralysedUntilOwnTurn = null;
      log(state, `${formatUmamusumeInstanceName(umamusume)} recovered from Paralysed.`);
    });
  });
}
