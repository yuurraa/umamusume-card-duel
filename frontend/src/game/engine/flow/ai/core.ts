import { MAX_BENCH, MAX_HAND } from "../../../../../../shared/src/gameData";
import type { AiDeckStyle, AiDifficulty, EnergyType, GameState, SideId, SideState, UmamusumeInstance } from "../../../../../../shared/src/types";
import type { AiCombatDecision, AiCombatDecisionResult, AiCombatDeps, AiTrainerDeps, CombatCandidate, PendingSwitchAfterGustResume } from "./types";
import { cloneGame } from "../../core/stateClone";
import { getCard, getPrimaryAttack, getUmamusumeCard } from "../../core/catalog";
import { actorName, formatUmamusumeCardName, formatUmamusumeInstanceName } from "../../core/labels";
import { attachEnergy, hasEnoughEnergy } from "../energy";
import { evolveUmamusume, findEvolutionTarget } from "../evolution";
import { canAttack, canAttachEnergy, canRetreat, canUseUmamusumeAbility } from "../eligibility";
import { applyTrainer, playStadium } from "../trainers";
import { getToolTargets, useRainbowUncapCrystal } from "../playRules";
import { effectiveRetreatCost, payRetreatCost } from "../retreat";
import { attachedEnergyCount, getAllUmamusume } from "../../core/umamusume";
import { createUmamusume } from "../setup";
import { log, logPrimaryFirst } from "../../core/log";
import { performAttack } from "../combat";
import {
  buildAttackDecision,
  canImmediateOpponentKo,
  countDiscardedUmamusume,
  didCandidateKoTarget,
  getDamageDealt,
  getHealingGained,
  getTargetValue,
  pickCandidateByDifficulty,
  predictAttackDamage,
} from "./combatUtils";
import { getAiRainbowUncapChoice, getAiTrainerChoices, scoreEvolutionTarget, shouldAiPlayTrainer } from "./trainerUtils";
import { aiUseCoinFlipDrawAbility, aiUseDamageAbility, aiUseMoveBenchedEnergyAbility } from "./abilityUtils";

const BASE_POINTS_WEIGHT = 1000;
const BASE_KO_WEIGHT = 260;
const BASE_DAMAGE_DEALT_WEIGHT = 1.2;
const BASE_DAMAGE_TAKEN_WEIGHT = 1;
const BASE_HEAL_GAINED_WEIGHT = 0.8;
const BASE_ACTIVE_KO_BONUS = 35;
const BASE_THREAT_PENALTY = 120;
const ENERGY_TYPES: EnergyType[] = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "steel", "colorless", "dragon"];

export function aiPlayOneBasic(state: GameState, side: SideState): boolean {
  if (side.bench.length >= MAX_BENCH) return false;
  const deckStyle = state.aiDeckStyleBySide[side.id] ?? "balanced";
  const candidates = side.hand
    .map((cardId, handIndex) => ({ cardId, handIndex }))
    .flatMap(({ cardId, handIndex }) => {
      const card = getCard(cardId);
      if (card.kind !== "umamusume" || card.stage !== 0) return [];
      return [{ cardId, handIndex, score: scoreBasicBenchCandidate(state, side, card.id, deckStyle) }];
    })
    .sort((left, right) => right.score - left.score);
  const best = candidates[0];
  if (!best) return false;
  const cardId = side.hand.splice(best.handIndex, 1)[0];
  if (!cardId) return false;
  const card = getCard(cardId);
  if (card.kind !== "umamusume") return false;
  side.bench.push(createUmamusume(card.id, state.turnNumber));
  log(state, `${actorName(side)} benched ${formatUmamusumeCardName(card)}.`);
  return true;
}

export function aiEvolveOne(state: GameState, side: SideState): boolean {
  const candidates = side.hand
    .map((cardId, handIndex) => ({ cardId, handIndex }))
    .flatMap(({ cardId, handIndex }) => {
      const card = getCard(cardId);
      if (card.kind !== "umamusume" || card.stage <= 0) return [];
      const target = findEvolutionTarget(state, side, card);
      if (!target) return [];
      return [{ card, target, handIndex, score: scoreEvolutionTarget(state, side, target, card) }];
    })
    .sort((left, right) => right.score - left.score);
  const best = candidates[0];
  if (!best) return false;
  const cardId = side.hand.splice(best.handIndex, 1)[0];
  if (!cardId) return false;
  const card = getCard(cardId);
  if (card.kind !== "umamusume") return false;
  evolveUmamusume(state, side, best.target, card);
  return true;
}

export function aiAttachOneEnergy(state: GameState, side: SideState): boolean {
  if (!side.active || !canAttachEnergy(state, side)) return false;
  const nextEnergyType = side.energyZone[0];
  if (!nextEnergyType) return false;
  const deckStyle = state.aiDeckStyleBySide[side.id] ?? "balanced";
  const futureDemand = buildFutureEnergyDemand(side);

  const candidates = side.energyAttachmentsThisTurn >= 1
    ? [side.active]
    : getAllUmamusume(side);
  const usefulCapByUid = new Map<number, number>();
  for (const umamusume of candidates) {
    usefulCapByUid.set(umamusume.uid, getUsefulEnergyCap(state, side, umamusume, nextEnergyType, deckStyle));
  }
  const hasUnderchargedAlternative = candidates.some((umamusume) => {
    const usefulCap = usefulCapByUid.get(umamusume.uid) ?? 1;
    return attachedEnergyCount(umamusume) < usefulCap;
  });

  const scored = candidates
    .map((umamusume) => ({
      umamusume,
      score: scoreAttachTarget(
        state,
        side,
        umamusume,
        nextEnergyType,
        deckStyle,
        futureDemand,
        usefulCapByUid.get(umamusume.uid) ?? 1,
        hasUnderchargedAlternative,
      ),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const leftActive = left.umamusume.uid === side.active?.uid ? 1 : 0;
      const rightActive = right.umamusume.uid === side.active?.uid ? 1 : 0;
      if (rightActive !== leftActive) return rightActive - leftActive;
      if (right.umamusume.stage !== left.umamusume.stage) return right.umamusume.stage - left.umamusume.stage;
      return attachedEnergyCount(left.umamusume) - attachedEnergyCount(right.umamusume);
    });

  const chosen = scored[0];
  if (!chosen) return false;
  attachEnergy(state, side, chosen.umamusume);
  return true;
}

export function aiPlayOneTrainer(
  state: GameState,
  side: SideState,
  pendingChoiceResume: PendingSwitchAfterGustResume,
  deps: AiTrainerDeps,
): boolean {
  const index = side.hand.findIndex((cardId, handIndex) => {
    const card = getCard(cardId);
    return shouldAiPlayTrainer(state, side, card, handIndex);
  });
  if (index === -1) return false;
  const cardId = side.hand[index];
  if (!cardId) return false;
  const card = getCard(cardId);
  if (card.kind !== "trainer") return false;
  const choices = getAiTrainerChoices(state, side, card, index);
  if (card.effect.rainbowUncapCrystal) {
    const rainbowChoice = getAiRainbowUncapChoice(state, side);
    if (!rainbowChoice) return false;
    side.hand.splice(index, 1);
    logPrimaryFirst(state, `${actorName(side)} played ${card.name}.`, () => {
      const shiftedEvolutionHandIndex = rainbowChoice.evolutionHandIndex > index
        ? rainbowChoice.evolutionHandIndex - 1
        : rainbowChoice.evolutionHandIndex;
      const resolved = useRainbowUncapCrystal(state, side, rainbowChoice.targetUid, shiftedEvolutionHandIndex)
        || useRainbowUncapCrystal(state, side, rainbowChoice.targetUid);
      if (resolved) {
        side.discard.push(card.id);
      }
    });
    return true;
  }
  side.hand.splice(index, 1);
  if (card.trainerType === "stadium") {
    playStadium(state, side, card);
    deps.refreshContinuousEffects(state);
    return true;
  }
  if (card.trainerType === "tool") {
    const target = choices.umamusumeTargetUid !== undefined
      ? getAllUmamusume(side).find((umamusume) => umamusume.uid === choices.umamusumeTargetUid)
      : getToolTargets(side)[0];
    if (!target) return false;
    target.toolCardId = card.id;
    log(state, `${actorName(side)} attached ${card.name} to ${formatUmamusumeCardName(getUmamusumeCard(target))}.`);
    return true;
  }
  logPrimaryFirst(state, `${actorName(side)} played ${card.name}.`, () => {
    applyTrainer(
      state,
      side,
      card,
      choices,
      deps.switchOutOpponentActive,
      pendingChoiceResume,
    );
    if (card.trainerType === "supporter") side.usedSupporterThisTurn = true;
    side.discard.push(card.id);
  });
  return true;
}

export function aiResolveCombatDecision(
  state: GameState,
  side: SideState,
  forcedAttackCoinResult: "heads" | "tails" | undefined,
  deps: AiCombatDeps,
  random: () => number = Math.random,
): AiCombatDecisionResult {
  if (!side.active) return { resolved: true, usedAttack: false };

  const candidates = buildCombatCandidates(state, side, deps, forcedAttackCoinResult);
  if (candidates.length === 0) return { resolved: true, usedAttack: false };
  const safeExists = candidates.some((candidate) => candidate.keepsSafe);
  if (safeExists) {
    candidates.forEach((candidate) => {
      if (!candidate.keepsSafe) candidate.score -= BASE_THREAT_PENALTY;
    });
  }

  const selected = pickCandidateByDifficulty(candidates, state.aiDifficulty, random, canImmediateOpponentKo(state, side.id));
  if (!selected || selected.decision.kind === "endTurn") return { resolved: true, usedAttack: false };

  if (selected.decision.retreatTargetUid !== undefined) {
    const retreated = aiRetreatToTarget(state, side, selected.decision.retreatTargetUid);
    if (!retreated) return { resolved: true, usedAttack: false };
  }

  if (selected.decision.usesCoinFlip && !forcedAttackCoinResult) {
    return { resolved: false, usedAttack: false };
  }

  performAttack(
    state,
    side.id,
    deps,
    selected.decision.attackTargetUid,
    selected.decision.healTargetUid,
    forcedAttackCoinResult,
  );
  return { resolved: true, usedAttack: true };
}

export function aiUseOneAbility(
  state: GameState,
  side: SideState,
  deps: AiCombatDeps,
  random: () => number = Math.random,
): boolean {
  const priorities = getAllUmamusume(side)
    .filter((umamusume) => canUseUmamusumeAbility(state, side, umamusume.uid))
    .sort((left, right) => right.stage - left.stage);

  for (const abilityUmamusume of priorities) {
    const abilityCard = getUmamusumeCard(abilityUmamusume);
    const ability = abilityCard.ability;
    if (!ability) continue;

    if (ability.damageOpponent && aiUseDamageAbility(state, side, abilityUmamusume, deps)) return true;
    if (ability.moveBenchedEnergyToActive && aiUseMoveBenchedEnergyAbility(state, side, abilityUmamusume, state.aiDifficulty, {
      estimateAttackDamageOutput,
      withEnergyShift,
      markAbilityUsed,
    })) return true;
    if (ability.coinFlipDrawOrActiveDamageCounter && aiUseCoinFlipDrawAbility(state, side, abilityUmamusume, random, deps, state.aiDifficulty)) return true;
  }

  return false;
}

function shouldAttachForDamageScaling(umamusume: UmamusumeInstance, nextEnergyType: keyof UmamusumeInstance["energies"]): boolean {
  const card = getUmamusumeCard(umamusume);
  const attack = getPrimaryAttack(card);
  if (attack.damagePerAttachedEnergy?.types.includes(nextEnergyType)) return true;
  const threshold = card.ability?.attackDamageBonusIfAttachedEnergy;
  if (threshold && threshold.type === nextEnergyType && umamusume.energies[nextEnergyType] < threshold.min) return true;
  return false;
}

function scoreBasicBenchCandidate(
  state: GameState,
  side: SideState,
  cardId: string,
  deckStyle: AiDeckStyle,
): number {
  const card = getCard(cardId);
  if (card.kind !== "umamusume" || card.stage !== 0) return Number.NEGATIVE_INFINITY;
  const attack = getPrimaryAttack(card);
  const evolutionInHand = side.hand.reduce((count, candidateId) => {
    const candidate = getCard(candidateId);
    return candidate.kind === "umamusume" && candidate.stage > 0 && candidate.evolvesFrom === card.species ? count + 1 : count;
  }, 0);
  const immediateEvolutionInHand = side.hand.some((candidateId) => {
    const candidate = getCard(candidateId);
    return candidate.kind === "umamusume" && candidate.stage === 1 && candidate.evolvesFrom === card.species;
  });
  const evolutionInDeck = side.deck.reduce((count, candidateId) => {
    const candidate = getCard(candidateId);
    return candidate.kind === "umamusume" && candidate.stage > 0 && candidate.evolvesFrom === card.species ? count + 1 : count;
  }, 0);
  const sameSpeciesAlreadyInPlay = getAllUmamusume(side).some((umamusume) => umamusume.species === card.species);
  let score = card.hp * 0.5 + attack.damage;
  score += Math.min(84, evolutionInHand * 36 + evolutionInDeck * 12);
  if (immediateEvolutionInHand) score += sameSpeciesAlreadyInPlay ? 22 : 64;
  if (side.bench.length < MAX_BENCH) score += 20;
  if (deckStyle === "scaleBench") score += 22;
  if (deckStyle === "scaleBench" && card.species === "Agnes Digital") score += 95;
  if (deckStyle === "blitz" && attack.damage >= 30) score += 18;
  if (deckStyle === "stall") score += card.hp * 0.25;
  return score;
}

function markAbilityUsed(side: SideState, umamusume: UmamusumeInstance, abilityName: string): void {
  umamusume.usedAbilityThisTurn = true;
  if (!side.usedAbilityNamesThisTurn.includes(abilityName)) side.usedAbilityNamesThisTurn.push(abilityName);
}

function scoreAttachTarget(
  state: GameState,
  side: SideState,
  target: UmamusumeInstance,
  energyType: keyof UmamusumeInstance["energies"],
  deckStyle: AiDeckStyle,
  futureDemand: Record<EnergyType, number>,
  usefulCap: number,
  hasUnderchargedAlternative: boolean,
): number {
  const active = side.active;
  const isActive = target.uid === active?.uid;
  const attack = getPrimaryAttack(getUmamusumeCard(target));
  const totalEnergyBefore = attachedEnergyCount(target);
  const totalEnergyAfter = totalEnergyBefore + 1;
  const beforeCanAttack = hasEnoughEnergy(target, attack.cost);
  const beforeDamage = estimateAttackDamageOutput(state, side.id, target, target);
  const simulated = withEnergyShift(target, energyType, +1);
  const afterCanAttack = hasEnoughEnergy(simulated, attack.cost);
  const afterDamage = estimateAttackDamageOutput(state, side.id, simulated, target);
  const typedDeficitBefore = getTypedEnergyDeficit(target, attack.cost);
  const typedDeficitAfter = getTypedEnergyDeficit(simulated, attack.cost);
  const targetNeedsThisType = (attack.cost[energyType] ?? 0) > target.energies[energyType];
  const targetTypeDemand = targetNeedsThisType ? 1 : 0;
  const futureDemandWeight = futureDemand[energyType] ?? 0;
  let score = 0;
  if (afterCanAttack && !beforeCanAttack) score += isActive ? 220 : 170;
  score += (typedDeficitBefore - typedDeficitAfter) * 30;
  score += Math.max(0, afterDamage - beforeDamage) * (isActive ? 2.5 : 1.8);
  score += targetTypeDemand * 24;
  score += Math.min(40, futureDemandWeight * 4);
  if (isActive) score += 20;
  if (target.stage > 0) score += target.stage * 8;
  if (beforeCanAttack && afterDamage <= beforeDamage && !shouldAttachForDamageScaling(target, energyType)) score -= 80;
  if (totalEnergyBefore < usefulCap) score += 28;
  if (totalEnergyAfter > usefulCap) score -= (totalEnergyAfter - usefulCap) * 140;
  if (hasUnderchargedAlternative && totalEnergyAfter > usefulCap) score -= 180;
  score += scoreDeckStyleAttachPreference(side, target, deckStyle, energyType, beforeCanAttack, afterCanAttack, beforeDamage, afterDamage);
  return score;
}

function getUsefulEnergyCap(
  state: GameState,
  side: SideState,
  target: UmamusumeInstance,
  nextEnergyType: EnergyType,
  deckStyle: AiDeckStyle,
): number {
  const card = getUmamusumeCard(target);
  const attack = getPrimaryAttack(card);
  const baseAttackCost = getTotalAttackCost(attack.cost);
  const attackDiscardCost = getTypedEnergyTotal(attack.discardEnergy);
  const abilityDiscardCost = getTypedEnergyTotal(card.ability?.discardEnergy);
  const totalDiscardCost = attackDiscardCost + abilityDiscardCost;
  const damageScalingTypes = attack.damagePerAttachedEnergy?.types ?? [];

  let cap = Math.max(1, baseAttackCost);
  if (totalDiscardCost > 0) cap += 1;
  if (damageScalingTypes.includes(nextEnergyType)) cap += 1;
  if (damageScalingTypes.length > 0 && target.uid === side.active?.uid) cap += 1;
  if (deckStyle === "stall" && target.uid === side.active?.uid) cap += 1;

  const threshold = card.ability?.attackDamageBonusIfAttachedEnergy;
  if (threshold) {
    const requiredInAttack = attack.cost[threshold.type] ?? 0;
    if (threshold.min > requiredInAttack) cap += 1;
  }

  if (target.uid === side.active?.uid) {
    const retreatCost = effectiveRetreatCost(state, side);
    if (retreatCost >= 2) cap += 1;
  }

  return Math.max(1, cap);
}

function getTotalAttackCost(cost: ReturnType<typeof getPrimaryAttack>["cost"]): number {
  return Object.values(cost).reduce((sum, amount) => sum + (amount ?? 0), 0);
}

function getTypedEnergyTotal(cost: Partial<Record<EnergyType, number>> | undefined): number {
  if (!cost) return 0;
  return Object.values(cost).reduce((sum, amount) => sum + (amount ?? 0), 0);
}

function scoreDeckStyleAttachPreference(
  side: SideState,
  target: UmamusumeInstance,
  deckStyle: AiDeckStyle,
  energyType: keyof UmamusumeInstance["energies"],
  beforeCanAttack: boolean,
  afterCanAttack: boolean,
  beforeDamage: number,
  afterDamage: number,
): number {
  const active = side.active;
  const isActive = target.uid === active?.uid;
  const card = getUmamusumeCard(target);
  const attack = getPrimaryAttack(card);
  const hasScalingByBoard = Boolean(attack.damagePerUmamusumeInPlay);
  const hasDamageReduction = Boolean(card.ability?.damageReduction);
  const highHp = target.maxHp >= 100 ? 1 : 0;
  const stageBonus = Math.max(0, target.stage);

  if (deckStyle === "blitz") {
    let score = isActive ? 80 : 10;
    if (!beforeCanAttack && afterCanAttack) score += isActive ? 120 : 55;
    if (afterDamage > beforeDamage) score += isActive ? 46 : 14;
    if (!isActive && active) {
      const activeAttack = getPrimaryAttack(getUmamusumeCard(active));
      if (!hasEnoughEnergy(active, activeAttack.cost)) score -= 65;
    }
    return score;
  }

  if (deckStyle === "scaleBench") {
    let score = 0;
    if (hasScalingByBoard) score += 48;
    if (!isActive) score += 28;
    if (side.bench.length < MAX_BENCH && !isActive) score += 12;
    if (!beforeCanAttack && afterCanAttack) score += isActive ? 60 : 42;
    if (attack.damagePerAttachedEnergy?.types.includes(energyType)) score += 18;
    score += stageBonus * 10;
    return score;
  }

  if (deckStyle === "stall") {
    let score = isActive ? 58 : 24;
    if (hasDamageReduction) score += 45;
    score += highHp * 20;
    if (!beforeCanAttack && afterCanAttack) score += isActive ? 70 : 36;
    if (afterDamage > beforeDamage) score += 10;
    return score;
  }

  let score = isActive ? 24 : 8;
  if (!beforeCanAttack && afterCanAttack) score += isActive ? 72 : 40;
  if (afterDamage > beforeDamage) score += isActive ? 16 : 9;
  score += stageBonus * 5;
  return score;
}

function buildFutureEnergyDemand(side: SideState): Record<EnergyType, number> {
  const demand = ENERGY_TYPES.reduce<Record<EnergyType, number>>((acc, energyType) => {
    acc[energyType] = 0;
    return acc;
  }, {} as Record<EnergyType, number>);

  const addCostDemand = (cardId: string, weight: number) => {
    const card = getCard(cardId);
    if (card.kind !== "umamusume") return;
    const attack = getPrimaryAttack(card);
    Object.entries(attack.cost).forEach(([type, amount]) => {
      if (type === "colorless") return;
      const required = amount ?? 0;
      if (required <= 0) return;
      const energyType = type as EnergyType;
      demand[energyType] += required * weight;
    });
    const threshold = card.ability?.attackDamageBonusIfAttachedEnergy;
    if (threshold) demand[threshold.type] += threshold.min * weight * 0.4;
    if (attack.damagePerAttachedEnergy) {
      attack.damagePerAttachedEnergy.types.forEach((energyType) => {
        demand[energyType] += weight * 0.9;
      });
    }
  };

  if (side.active) addCostDemand(side.active.cardId, 1.8);
  side.bench.forEach((umamusume) => addCostDemand(umamusume.cardId, 1.4));
  side.hand.forEach((cardId) => addCostDemand(cardId, 1.0));
  side.deck.forEach((cardId) => addCostDemand(cardId, 0.55));
  return demand;
}

function withEnergyShift(
  umamusume: UmamusumeInstance,
  energyType: keyof UmamusumeInstance["energies"],
  delta: number,
): UmamusumeInstance {
  return {
    ...umamusume,
    energies: {
      ...umamusume.energies,
      [energyType]: Math.max(0, umamusume.energies[energyType] + delta),
    },
  };
}

function getTypedEnergyDeficit(umamusume: UmamusumeInstance, cost: ReturnType<typeof getPrimaryAttack>["cost"]): number {
  return (Object.entries(cost) as [keyof ReturnType<typeof getPrimaryAttack>["cost"], number | undefined][])
    .filter(([type]) => type !== "colorless")
    .reduce((sum, [type, amount]) => {
      const required = amount ?? 0;
      return sum + Math.max(0, required - umamusume.energies[type as keyof UmamusumeInstance["energies"]]);
    }, 0);
}

function estimateAttackDamageOutput(
  state: GameState,
  attackingSideId: SideId,
  attacker: UmamusumeInstance,
  originalAttacker: UmamusumeInstance,
): number {
  const attack = getPrimaryAttack(getUmamusumeCard(originalAttacker));
  if (!hasEnoughEnergy(attacker, attack.cost)) return 0;
  const attackingSide = state.sides[attackingSideId];
  const defendingSide = state.sides[attackingSideId === "player" ? "opponent" : "player"];
  const ownInPlayCount = 1 + attackingSide.bench.length;
  const allInPlayCount = ownInPlayCount + 1 + defendingSide.bench.length;
  const targets = attack.targetOpponent === "any" ? getAllUmamusume(defendingSide) : defendingSide.active ? [defendingSide.active] : [];
  if (targets.length === 0) return 0;
  return Math.max(...targets.map((target) => predictAttackDamage(attacker, target, attackingSide.activeAttackDamageBonus, ownInPlayCount, allInPlayCount)));
}

function buildCombatCandidates(
  state: GameState,
  side: SideState,
  deps: AiCombatDeps,
  forcedAttackCoinResult?: "heads" | "tails",
): CombatCandidate[] {
  const candidates: CombatCandidate[] = [];

  if (canAttack(state, side)) {
    candidates.push(...buildAttackCandidates(state, side, deps, forcedAttackCoinResult));
  }

  if (canRetreat(state, side)) {
    for (const retreatTarget of side.bench) {
      const simulatedRetreat = cloneGame(state);
      const simulatedSide = simulatedRetreat.sides[side.id];
      if (!aiRetreatToTarget(simulatedRetreat, simulatedSide, retreatTarget.uid)) continue;
      if (!canAttack(simulatedRetreat, simulatedSide)) continue;
      candidates.push(...buildAttackCandidates(simulatedRetreat, simulatedSide, deps, forcedAttackCoinResult, retreatTarget.uid));
    }
  }

  candidates.push(scoreCandidate(state, side.id, deps, { kind: "endTurn" }, "end-turn"));
  return candidates;
}

function buildAttackCandidates(
  state: GameState,
  side: SideState,
  deps: AiCombatDeps,
  forcedAttackCoinResult?: "heads" | "tails",
  retreatTargetUid?: number,
): CombatCandidate[] {
  const active = side.active;
  if (!active) return [];
  const attack = getPrimaryAttack(getUmamusumeCard(active));
  const opponent = state.sides[side.id === "player" ? "opponent" : "player"];
  const attackTargetUids = attack.targetOpponent === "any"
    ? getAllUmamusume(opponent).map((umamusume) => umamusume.uid)
    : [undefined];
  const healTargetUids = attack.heal && attack.healTarget === "any"
    ? getAllUmamusume(side).filter((umamusume) => umamusume.hp < umamusume.maxHp).map((umamusume) => umamusume.uid)
    : [undefined];
  const resolvedAttackTargets = attackTargetUids.length > 0 ? attackTargetUids : [undefined];
  const resolvedHealTargets = healTargetUids.length > 0 ? healTargetUids : [undefined];
  const usesCoinFlip = Boolean(attack.coinBonus || attack.drawOnHeads);
  const candidates: CombatCandidate[] = [];

  resolvedAttackTargets.forEach((attackTargetUid) => {
    resolvedHealTargets.forEach((healTargetUid) => {
      if (!usesCoinFlip || forcedAttackCoinResult) {
        const decision = buildAttackDecision(retreatTargetUid, attackTargetUid, healTargetUid, usesCoinFlip);
        candidates.push(scoreCandidate(state, side.id, deps, decision, `${retreatTargetUid ?? "stay"}-${attackTargetUid ?? "active"}-${healTargetUid ?? "auto"}-${forcedAttackCoinResult ?? "none"}`));
        return;
      }

      const heads = scoreCandidate(
        state,
        side.id,
        deps,
        buildAttackDecision(retreatTargetUid, attackTargetUid, healTargetUid, true),
        `${retreatTargetUid ?? "stay"}-${attackTargetUid ?? "active"}-${healTargetUid ?? "auto"}-heads`,
        "heads",
      );
      const tails = scoreCandidate(
        state,
        side.id,
        deps,
        buildAttackDecision(retreatTargetUid, attackTargetUid, healTargetUid, true),
        `${retreatTargetUid ?? "stay"}-${attackTargetUid ?? "active"}-${healTargetUid ?? "auto"}-tails`,
        "tails",
      );
      candidates.push({
        ...heads,
        id: `${retreatTargetUid ?? "stay"}-${attackTargetUid ?? "active"}-${healTargetUid ?? "auto"}-expected`,
        score: (heads.score + tails.score) / 2,
      });
    });
  });

  return candidates;
}

function scoreCandidate(
  baseState: GameState,
  actingSideId: SideId,
  deps: AiCombatDeps,
  decision: AiCombatDecision,
  id: string,
  forcedCoinResult?: "heads" | "tails",
): CombatCandidate {
  const before = cloneGame(baseState);
  const simulated = cloneGame(baseState);
  const actingBefore = before.sides[actingSideId];
  const actingAfter = simulated.sides[actingSideId];
  const defendingId: SideId = actingSideId === "player" ? "opponent" : "player";
  const defendingBefore = before.sides[defendingId];

  if (decision.kind === "attack") {
    if (decision.retreatTargetUid !== undefined) {
      aiRetreatToTarget(simulated, actingAfter, decision.retreatTargetUid);
    }
    performAttack(simulated, actingSideId, deps, decision.attackTargetUid, decision.healTargetUid, forcedCoinResult);
  }

  const pointsGained = simulated.sides[actingSideId].points - actingBefore.points;
  const koCount = countDiscardedUmamusume(simulated.sides[defendingId].discard) - countDiscardedUmamusume(defendingBefore.discard);
  const damageDealt = getDamageDealt(before.sides[defendingId], simulated.sides[defendingId]);
  const healingGained = getHealingGained(before.sides[actingSideId], simulated.sides[actingSideId]);
  const startActiveUid = actingBefore.active?.uid;
  const startActiveHp = actingBefore.active?.hp ?? 0;
  const afterStartActive = startActiveUid !== undefined ? getAllUmamusume(actingAfter).find((umamusume) => umamusume.uid === startActiveUid) : undefined;
  const damageTakenByStartingActive = Math.max(0, startActiveHp - (afterStartActive?.hp ?? 0));
  const activeKoed = startActiveUid !== undefined && !afterStartActive;

  const attackTargetUid = decision.kind === "attack" ? decision.attackTargetUid : undefined;
  const targetValue = getTargetValue(before.sides[defendingId], attackTargetUid);
  const targetIsActive = attackTargetUid === undefined || attackTargetUid === defendingBefore.active?.uid;
  const lethalTarget = didCandidateKoTarget(before.sides[defendingId], simulated.sides[defendingId], attackTargetUid);

  const score = pointsGained * BASE_POINTS_WEIGHT
    + koCount * BASE_KO_WEIGHT
    + damageDealt * BASE_DAMAGE_DEALT_WEIGHT
    + healingGained * BASE_HEAL_GAINED_WEIGHT
    - damageTakenByStartingActive * BASE_DAMAGE_TAKEN_WEIGHT
    + (activeKoed ? BASE_ACTIVE_KO_BONUS : 0);

  return {
    id,
    decision,
    score,
    keepsSafe: !canImmediateOpponentKo(simulated, actingSideId),
    lethalTarget,
    targetValue,
    targetIsActive,
  };
}

function aiRetreatToTarget(state: GameState, side: SideState, targetUid: number): boolean {
  const active = side.active;
  if (!active) return false;
  const targetIndex = side.bench.findIndex((umamusume) => umamusume.uid === targetUid);
  const target = targetIndex >= 0 ? side.bench[targetIndex] : null;
  if (!target) return false;
  const retreatCost = effectiveRetreatCost(state, side);
  if (attachedEnergyCount(active) < retreatCost) return false;
  payRetreatCost(active, retreatCost);
  const promoted = side.bench.splice(targetIndex, 1)[0];
  if (!promoted) return false;
  side.bench.push(active);
  side.active = promoted;
  side.usedRetreatThisTurn = true;
  log(state, `${actorName(side)} retreated to ${formatUmamusumeInstanceName(promoted)}.`);
  return true;
}
