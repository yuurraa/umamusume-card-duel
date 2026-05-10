import { MAX_HAND } from "../../../../../../shared/src/gameData";
import type { AiDifficulty, GameState, SideId, SideState, UmamusumeInstance } from "../../../../../../shared/src/types";
import { cloneGame } from "../../core/stateClone";
import { getPrimaryAttack, getUmamusumeCard } from "../../core/catalog";
import { actorName, energyLabel, formatUmamusumeCardName, formatUmamusumeInstanceName, pluralize } from "../../core/labels";
import { getAbilityMoveEnergyTypes, hasEnoughEnergy } from "../energy";
import { canAttack } from "../eligibility";
import { attachedEnergyCount, getAllUmamusume } from "../../core/umamusume";
import { log } from "../../core/log";
import { knockOutUmamusume, performAttack } from "../combat";
import { drawCards } from "../turn";
import type { AiCombatDeps } from "./types";
import { canImmediateOpponentKo, getDamageDealt } from "./combatUtils";

type AbilityHeuristicDeps = {
  estimateAttackDamageOutput: (
    state: GameState,
    attackingSideId: SideId,
    attacker: UmamusumeInstance,
    originalAttacker: UmamusumeInstance,
  ) => number;
  withEnergyShift: (
    umamusume: UmamusumeInstance,
    energyType: keyof UmamusumeInstance["energies"],
    delta: number,
  ) => UmamusumeInstance;
  markAbilityUsed: (side: SideState, umamusume: UmamusumeInstance, abilityName: string) => void;
};

export function aiUseMoveBenchedEnergyAbility(
  state: GameState,
  side: SideState,
  abilityUmamusume: UmamusumeInstance,
  aiDifficulty: AiDifficulty,
  heuristicDeps: AbilityHeuristicDeps,
): boolean {
  const abilityCard = getUmamusumeCard(abilityUmamusume);
  const ability = abilityCard.ability;
  if (!ability?.moveBenchedEnergyToActive || !side.active) return false;
  const active = side.active;
  const activeAttack = getPrimaryAttack(getUmamusumeCard(active));
  const opponent = state.sides[side.id === "player" ? "opponent" : "player"];
  const beforeActiveDamage = heuristicDeps.estimateAttackDamageOutput(state, side.id, active, active);
  const beforeCanAttack = hasEnoughEnergy(active, activeAttack.cost);
  const wantedEnergyTypes = getAbilityMoveEnergyTypes(ability);
  const candidates = side.bench.flatMap((source) => wantedEnergyTypes
    .filter((energyType) => source.energies[energyType] > 0)
    .map((energyType) => {
      const simulatedActive = heuristicDeps.withEnergyShift(active, energyType, +1);
      const simulatedSource = heuristicDeps.withEnergyShift(source, energyType, -1);
      const afterActiveDamage = heuristicDeps.estimateAttackDamageOutput(state, side.id, simulatedActive, active);
      const afterCanAttack = hasEnoughEnergy(simulatedActive, activeAttack.cost);
      const sourceBeforeDamage = heuristicDeps.estimateAttackDamageOutput(state, side.id, source, source);
      const sourceAfterDamage = heuristicDeps.estimateAttackDamageOutput(state, side.id, simulatedSource, source);
      let score = 0;
      if (afterCanAttack && !beforeCanAttack) score += 220;
      const activeDamageGain = Math.max(0, afterActiveDamage - beforeActiveDamage);
      score += activeDamageGain * 5;
      if (activeAttack.damagePerAttachedEnergy?.types.includes(energyType)) score += 18;
      const threshold = getUmamusumeCard(active).ability?.attackDamageBonusIfAttachedEnergy;
      if (threshold && threshold.type === energyType && active.energies[energyType] < threshold.min && simulatedActive.energies[energyType] >= threshold.min) {
        score += 60;
      }
      if (sourceBeforeDamage > sourceAfterDamage) {
        score -= (sourceBeforeDamage - sourceAfterDamage) * 0.8;
      }
      if (hasEnoughEnergy(source, getPrimaryAttack(getUmamusumeCard(source)).cost) && !hasEnoughEnergy(simulatedSource, getPrimaryAttack(getUmamusumeCard(source)).cost)) {
        score -= activeDamageGain > 0 ? 10 : 40;
      }
      if (!opponent.active) score -= 20;
      return { source, energyType, score };
    }));
  if (candidates.length === 0) return false;
  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0];
  if (!best) return false;
  if (aiDifficulty === "hard" && best.score <= 20) return false;
  if (aiDifficulty !== "easy" && best.score <= 0) return false;

  best.source.energies[best.energyType] -= 1;
  active.energies[best.energyType] += 1;
  heuristicDeps.markAbilityUsed(side, abilityUmamusume, ability.name);
  log(state, `${formatUmamusumeCardName(abilityCard)}'s ${ability.name} moved 1 ${energyLabel(best.energyType)} to the active spot.`);
  return true;
}

export function aiUseDamageAbility(
  state: GameState,
  side: SideState,
  abilityUmamusume: UmamusumeInstance,
  deps: AiCombatDeps,
): boolean {
  const abilityCard = getUmamusumeCard(abilityUmamusume);
  const ability = abilityCard.ability;
  if (!ability?.damageOpponent) return false;
  if (ability.discardEnergy) {
    const canPay = Object.entries(ability.discardEnergy).every(([type, amount]) => abilityUmamusume.energies[type as keyof UmamusumeInstance["energies"]] >= (amount ?? 0));
    if (!canPay) return false;
  }

  const opponentId: SideId = side.id === "player" ? "opponent" : "player";
  const opponent = state.sides[opponentId];
  const potentialTargets = ability.damageOpponentTarget === "any" ? getAllUmamusume(opponent) : opponent.active ? [opponent.active] : [];
  if (potentialTargets.length === 0) return false;
  const bestAttackDamageWithoutAbility = estimateBestAttackTotalDamage(state, side.id, deps);

  const target = [...potentialTargets].sort((left, right) => {
    const leftLethal = left.hp <= ability.damageOpponent! ? 1 : 0;
    const rightLethal = right.hp <= ability.damageOpponent! ? 1 : 0;
    if (rightLethal !== leftLethal) return rightLethal - leftLethal;
    const leftValue = getPrimaryAttack(getUmamusumeCard(left)).damage + attachedEnergyCount(left) * 12 + left.stage * 18;
    const rightValue = getPrimaryAttack(getUmamusumeCard(right)).damage + attachedEnergyCount(right) * 12 + right.stage * 18;
    return rightValue - leftValue;
  })[0];
  if (!target) return false;
  const directAbilityDamage = Math.min(target.hp, ability.damageOpponent);
  const withAbilityState = cloneGame(state);
  const simulatedSide = withAbilityState.sides[side.id];
  const simulatedAbilityOwner = getAllUmamusume(simulatedSide).find((umamusume) => umamusume.uid === abilityUmamusume.uid);
  if (!simulatedAbilityOwner) return false;
  if (ability.discardEnergy) {
    Object.entries(ability.discardEnergy).forEach(([type, amount]) => {
      const energyType = type as keyof UmamusumeInstance["energies"];
      simulatedAbilityOwner.energies[energyType] = Math.max(0, simulatedAbilityOwner.energies[energyType] - (amount ?? 0));
    });
  }
  const bestAttackDamageAfterAbilityCost = estimateBestAttackTotalDamage(withAbilityState, side.id, deps);
  const totalDamageWithAbility = directAbilityDamage + bestAttackDamageAfterAbilityCost;
  const totalDamageWithoutAbility = bestAttackDamageWithoutAbility;
  if (totalDamageWithAbility < totalDamageWithoutAbility) return false;

  if (ability.discardEnergy) {
    Object.entries(ability.discardEnergy).forEach(([type, amount]) => {
      const energyType = type as keyof UmamusumeInstance["energies"];
      abilityUmamusume.energies[energyType] = Math.max(0, abilityUmamusume.energies[energyType] - (amount ?? 0));
      if (amount) log(state, `${actorName(side)} discarded ${amount} ${energyLabel(energyType)}.`);
    });
  }

  target.hp = Math.max(0, target.hp - ability.damageOpponent);
  target.tookDamageThisTurn = ability.damageOpponent > 0;
  heuristicMarkAbilityUsed(side, abilityUmamusume, ability.name);
  log(state, `${formatUmamusumeCardName(abilityCard)}'s ${ability.name} did ${ability.damageOpponent} damage to ${formatUmamusumeInstanceName(target)}.`);
  if (target.hp <= 0) {
    if (knockOutUmamusume(state, side.id, opponentId, target, deps.choosePreferredActiveIndex, `${formatUmamusumeCardName(abilityCard)}'s ${ability.name}`)) {
      if (!state.gameOver) deps.refreshContinuousEffects(state);
    }
  }
  return true;
}

export function aiUseCoinFlipDrawAbility(
  state: GameState,
  side: SideState,
  abilityUmamusume: UmamusumeInstance,
  random: () => number,
  deps: AiCombatDeps,
  aiDifficulty: AiDifficulty,
): boolean {
  const abilityCard = getUmamusumeCard(abilityUmamusume);
  const ability = abilityCard.ability?.coinFlipDrawOrActiveDamageCounter;
  const ownerAbility = getUmamusumeCard(abilityUmamusume).ability;
  if (!ability || !ownerAbility || !side.active) return false;
  if (side.hand.length >= MAX_HAND) return false;
  const simulatedAfterTails = cloneGame(state);
  const simulatedSide = simulatedAfterTails.sides[side.id];
  if (simulatedSide.active) {
    simulatedSide.active.hp = Math.max(0, simulatedSide.active.hp - ability.damageOnTails);
  }
  const newlyKoThreatenedByTails = canImmediateOpponentKo(simulatedAfterTails, side.id) && !canImmediateOpponentKo(state, side.id);
  if (aiDifficulty === "hard" && newlyKoThreatenedByTails) return false;
  if (aiDifficulty === "hard" && side.hand.length >= 6) return false;

  const heads = flipCoin(side, random) === "heads";
  heuristicMarkAbilityUsed(side, abilityUmamusume, ownerAbility.name);
  log(state, `${actorName(side)} used ${formatUmamusumeCardName(abilityCard)}'s ${ownerAbility.name}.`);
  log(state, `Flip a coin and got 1x ${heads ? "heads" : "tails"}.`);
  if (heads) {
    const drawn = drawCards(state, side, ability.draw);
    if (drawn.length > 0) log(state, `${actorName(side)} drew ${drawn.length} ${pluralize(drawn.length, "card")}.`);
    return true;
  }

  side.active.hp = Math.max(0, side.active.hp - ability.damageOnTails);
  side.active.tookDamageThisTurn = true;
  log(state, `${formatUmamusumeCardName(abilityCard)}'s ${ownerAbility.name} put ${ability.damageOnTails} damage on ${actorName(side)} active.`);
  if (side.active.hp <= 0) {
    const scoringSideId: SideId = side.id === "player" ? "opponent" : "player";
    if (knockOutUmamusume(state, scoringSideId, side.id, side.active, deps.choosePreferredActiveIndex, `${formatUmamusumeCardName(abilityCard)}'s ${ownerAbility.name}`)) {
      if (!state.gameOver) deps.refreshContinuousEffects(state);
    }
  }
  return true;
}

function flipCoin(side: SideState, random: () => number): "heads" | "tails" {
  if ((side.guaranteedCoinFlipHeads ?? 0) > 0) {
    side.guaranteedCoinFlipHeads -= 1;
    return "heads";
  }
  return random() >= 0.5 ? "heads" : "tails";
}

function estimateBestAttackTotalDamage(state: GameState, actingSideId: SideId, deps: AiCombatDeps): number {
  const side = state.sides[actingSideId];
  if (!canAttack(state, side)) return 0;
  const active = side.active;
  if (!active) return 0;
  const attack = getPrimaryAttack(getUmamusumeCard(active));
  const defendingId: SideId = actingSideId === "player" ? "opponent" : "player";
  const defender = state.sides[defendingId];
  const attackTargets = attack.targetOpponent === "any" ? getAllUmamusume(defender).map((umamusume) => umamusume.uid) : [undefined];
  const resolvedAttackTargets = attackTargets.length > 0 ? attackTargets : [undefined];
  const healTargets = attack.heal && attack.healTarget === "any"
    ? getAllUmamusume(side).filter((umamusume) => umamusume.hp < umamusume.maxHp).map((umamusume) => umamusume.uid)
    : [undefined];
  const resolvedHealTargets = healTargets.length > 0 ? healTargets : [undefined];
  let bestDamage = 0;

  resolvedAttackTargets.forEach((attackTargetUid) => {
    resolvedHealTargets.forEach((healTargetUid) => {
      if (attack.coinBonus || attack.drawOnHeads) {
        const headsState = cloneGame(state);
        const tailsState = cloneGame(state);
        const headsBefore = cloneGame(state).sides[defendingId];
        const tailsBefore = cloneGame(state).sides[defendingId];
        performAttack(headsState, actingSideId, deps, attackTargetUid, healTargetUid, "heads");
        performAttack(tailsState, actingSideId, deps, attackTargetUid, healTargetUid, "tails");
        const headsDamage = getDamageDealt(headsBefore, headsState.sides[defendingId]);
        const tailsDamage = getDamageDealt(tailsBefore, tailsState.sides[defendingId]);
        const expected = (headsDamage + tailsDamage) / 2;
        if (expected > bestDamage) bestDamage = expected;
        return;
      }

      const simulated = cloneGame(state);
      const beforeDefender = cloneGame(state).sides[defendingId];
      performAttack(simulated, actingSideId, deps, attackTargetUid, healTargetUid);
      const dealt = getDamageDealt(beforeDefender, simulated.sides[defendingId]);
      if (dealt > bestDamage) bestDamage = dealt;
    });
  });

  return bestDamage;
}

function heuristicMarkAbilityUsed(side: SideState, umamusume: UmamusumeInstance, abilityName: string): void {
  umamusume.usedAbilityThisTurn = true;
  if (!side.usedAbilityNamesThisTurn.includes(abilityName)) side.usedAbilityNamesThisTurn.push(abilityName);
}
