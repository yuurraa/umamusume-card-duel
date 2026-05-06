import type { EnergyType, GameState, SideState, UmamusumeInstance } from "../../../../../shared/src/types";
import { getPrimaryAttack, getUmamusumeCard } from "../core/catalog";
import { getAbilityMoveEnergyTypes, hasEnoughEnergy } from "./energy";
import { effectiveRetreatCost } from "./retreat";
import { attachedEnergyCount, findOwnUmamusumeByUid } from "../core/umamusume";

export function isPlayerTurn(state: GameState): boolean {
  return state.phase === "play" && !state.gameOver && state.currentSide === "player";
}

export function canAttachEnergy(state: GameState, side: SideState): boolean {
  return state.phase === "play"
    && !state.pendingPlayerChoice
    && !state.gameOver
    && state.currentSide === side.id
    && side.energyZone.length > 0
    && side.energyAttachmentsThisTurn < 1 + side.bonusEnergyAttachments;
}

export function canAttachEnergyToUmamusume(state: GameState, side: SideState, umamusume: UmamusumeInstance): boolean {
  if (!canAttachEnergy(state, side)) return false;
  return side.energyAttachmentsThisTurn < 1 || umamusume.uid === side.active?.uid;
}

export function canAttack(state: GameState, side: SideState): boolean {
  if (state.phase !== "play" || state.pendingPlayerChoice || state.gameOver || state.currentSide !== side.id || !side.active) return false;
  if (side.active.specialConditions.includes("paralysed")) return false;
  if (side.active.attackBlockedUntilOwnTurn === state.turnsTakenBySide[side.id]) return false;
  return hasEnoughEnergy(side.active, getPrimaryAttack(getUmamusumeCard(side.active)).cost);
}

export function canRetreat(state: GameState, side: SideState): boolean {
  if (state.phase !== "play" || state.pendingPlayerChoice || state.gameOver || state.currentSide !== side.id || side.usedRetreatThisTurn || !side.active) return false;
  if (side.active.specialConditions.includes("paralysed")) return false;
  if (side.bench.length === 0) return false;
  return attachedEnergyCount(side.active) >= effectiveRetreatCost(state, side);
}

export function canUseUmamusumeAbility(state: GameState, side: SideState, abilityUmamusumeUid: number): boolean {
  if (state.phase !== "play" || state.pendingPlayerChoice || state.gameOver || state.currentSide !== side.id) return false;
  const abilityUmamusume = findOwnUmamusumeByUid(side, abilityUmamusumeUid);
  if (!abilityUmamusume || abilityUmamusume.usedAbilityThisTurn) return false;
  const ability = getUmamusumeCard(abilityUmamusume).ability;
  if (!ability) return false;
  if (side.usedAbilityNamesThisTurn?.includes(ability.name)) return false;
  if (ability.moveBenchedEnergyToActive) {
    if (!side.active) return false;
    const energyTypes = getAbilityMoveEnergyTypes(ability);
    if (energyTypes.length === 0) return false;
    return side.bench.some((umamusume) => energyTypes.some((energyType) => umamusume.energies[energyType] > 0));
  }
  if (ability.discardToDraw) return side.hand.length >= ability.discardToDraw.discard;
  if (ability.coinFlipDrawOrActiveDamageCounter) return true;
  if (ability.damageOpponent) {
    if (ability.discardEnergy) {
      const canPayDiscard = Object.entries(ability.discardEnergy).every(([type, amount]) => abilityUmamusume.energies[type as EnergyType] >= (amount ?? 0));
      if (!canPayDiscard) return false;
    }
    const opponent = state.sides[side.id === "player" ? "opponent" : "player"];
    return Boolean(opponent.active || opponent.bench.length > 0);
  }
  return false;
}
