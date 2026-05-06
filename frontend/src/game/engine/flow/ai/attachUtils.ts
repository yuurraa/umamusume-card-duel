import { MAX_BENCH } from "../../../../../../shared/src/gameData";
import type { AiDeckStyle, EnergyType, GameState, SideId, SideState, UmamusumeInstance } from "../../../../../../shared/src/types";
import { getCard, getPrimaryAttack, getUmamusumeCard } from "../../core/catalog";
import { attachEnergy, hasEnoughEnergy } from "../energy";
import { effectiveRetreatCost } from "../retreat";
import { attachedEnergyCount, getAllUmamusume } from "../../core/umamusume";
import { predictAttackDamage } from "./combatUtils";
import type { AiTurnGoal } from "./types";

const ENERGY_TYPES: EnergyType[] = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "steel", "colorless", "dragon"];

export function aiAttachOneEnergy(state: GameState, side: SideState, turnGoal: AiTurnGoal = "maximize_progress"): boolean {
  if (!side.active) return false;
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
        turnGoal,
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

export function markAbilityUsed(side: SideState, umamusume: UmamusumeInstance, abilityName: string): void {
  umamusume.usedAbilityThisTurn = true;
  if (!side.usedAbilityNamesThisTurn.includes(abilityName)) side.usedAbilityNamesThisTurn.push(abilityName);
}

export function withEnergyShift(
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

export function estimateAttackDamageOutput(
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
  return Math.max(...targets.map((target) => predictAttackDamage(attacker, target, attackingSide.activeAttackDamageBonus, ownInPlayCount, allInPlayCount, state.turnNumber)));
}

function shouldAttachForDamageScaling(umamusume: UmamusumeInstance, nextEnergyType: keyof UmamusumeInstance["energies"]): boolean {
  const card = getUmamusumeCard(umamusume);
  const attack = getPrimaryAttack(card);
  if (attack.damagePerAttachedEnergy?.types.includes(nextEnergyType)) return true;
  const threshold = card.ability?.attackDamageBonusIfAttachedEnergy;
  if (threshold && threshold.type === nextEnergyType && umamusume.energies[nextEnergyType] < threshold.min) return true;
  return false;
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
  turnGoal: AiTurnGoal,
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
  const attackUsesThisType = (attack.cost[energyType] ?? 0) > 0;
  const supportsScaling = shouldAttachForDamageScaling(target, energyType);
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
  if (beforeCanAttack && afterDamage <= beforeDamage && !supportsScaling) score -= 80;
  // Strongly discourage dumping energy onto a target that cannot use that type
  // for attack progression in this deck plan (common offender: off-type bench units).
  if (!attackUsesThisType && !supportsScaling) {
    score -= isActive ? 42 : 120;
    if (beforeCanAttack && afterCanAttack && afterDamage <= beforeDamage) score -= 60;
  }
  if (totalEnergyBefore < usefulCap) score += 28;
  if (totalEnergyAfter > usefulCap) score -= (totalEnergyAfter - usefulCap) * 140;
  if (hasUnderchargedAlternative && totalEnergyAfter > usefulCap) score -= 180;
  score += scoreDeckStyleAttachPreference(side, target, deckStyle, energyType, beforeCanAttack, afterCanAttack, beforeDamage, afterDamage);
  score += scoreTurnGoalAttachPreference(side, target, beforeCanAttack, afterCanAttack, turnGoal);
  return score;
}

function scoreTurnGoalAttachPreference(
  side: SideState,
  target: UmamusumeInstance,
  beforeCanAttack: boolean,
  afterCanAttack: boolean,
  turnGoal: AiTurnGoal,
): number {
  const isActive = target.uid === side.active?.uid;
  if (turnGoal === "deny_opponent_lethal") {
    let score = isActive ? 30 : 10;
    if (!beforeCanAttack && afterCanAttack) score += isActive ? 120 : 28;
    if (target.maxHp >= 100 && isActive) score += 16;
    return score;
  }
  if (turnGoal === "stabilize_board") {
    let score = 0;
    if (!isActive) score += 22;
    if (!beforeCanAttack && afterCanAttack) score += 34;
    if (target.maxHp >= 90) score += 10;
    return score;
  }
  if (turnGoal === "secure_lethal_now") {
    let score = isActive ? 26 : -8;
    if (!beforeCanAttack && afterCanAttack && isActive) score += 84;
    return score;
  }
  if (turnGoal === "set_up_two_turn_lethal") {
    let score = isActive ? 34 : 6;
    if (!beforeCanAttack && afterCanAttack && isActive) score += 96;
    if (target.stage >= 1 && isActive) score += 12;
    return score;
  }
  return 0;
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
  const availableEnergyTypes = new Set(side.energyPool);
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
      const typedEnergy = type as EnergyType;
      if (!availableEnergyTypes.has(typedEnergy)) return;
      demand[typedEnergy] += required * weight;
    });
    const threshold = card.ability?.attackDamageBonusIfAttachedEnergy;
    if (threshold && availableEnergyTypes.has(threshold.type)) demand[threshold.type] += threshold.min * weight * 0.4;
    if (attack.damagePerAttachedEnergy) {
      attack.damagePerAttachedEnergy.types.forEach((typedEnergy) => {
        if (!availableEnergyTypes.has(typedEnergy)) return;
        demand[typedEnergy] += weight * 0.9;
      });
    }
  };

  // Confidence model:
  // - in play / hand / discard are high-confidence known zones
  // - deck composition is known only as a low-confidence prior for planning
  if (side.active) addCostDemand(side.active.cardId, 1.8);
  side.bench.forEach((umamusume) => addCostDemand(umamusume.cardId, 1.4));
  side.hand.forEach((cardId) => addCostDemand(cardId, 1.0));
  side.discard.forEach((cardId) => addCostDemand(cardId, 0.45));
  side.deck.forEach((cardId) => addCostDemand(cardId, 0.2));
  return demand;
}

function getTypedEnergyDeficit(umamusume: UmamusumeInstance, cost: ReturnType<typeof getPrimaryAttack>["cost"]): number {
  return (Object.entries(cost) as [keyof ReturnType<typeof getPrimaryAttack>["cost"], number | undefined][])
    .filter(([type]) => type !== "colorless")
    .reduce((sum, [type, amount]) => {
      const required = amount ?? 0;
      return sum + Math.max(0, required - umamusume.energies[type as keyof UmamusumeInstance["energies"]]);
    }, 0);
}
