import { MAX_BENCH, MAX_HAND } from "../../../../../../shared/src/gameData";
import type { AiDeckStyle, AiDifficulty, Card, EnergyType, GameState, PendingPlayerChoice, SideId, SideState, UmamusumeCard, UmamusumeInstance } from "../../../../../../shared/src/types";
import { cloneGame } from "../../core/stateClone";
import { getCard, getPrimaryAttack, getUmamusumeCard } from "../../core/catalog";
import { actorName, energyLabel, formatUmamusumeCardName, formatUmamusumeInstanceName, pluralize } from "../../core/labels";
import { attachEnergy, getAbilityMoveEnergyTypes, hasEnoughEnergy } from "../energy";
import { evolveUmamusume, findEvolutionTarget } from "../evolution";
import { canAttack, canAttachEnergy, canRetreat, canUseUmamusumeAbility } from "../eligibility";
import { applyTrainer, hasDamagedHealingTarget, playStadium, SwitchAfterGustResume } from "../trainers";
import { getPlayableAction, getRainbowUncapEvolutionHandOptions, getRainbowUncapTargets, getToolTargets, useRainbowUncapCrystal } from "../playRules";
import { choosePreferredActiveIndex, getOpposingSide } from "../board";
import { effectiveRetreatCost, payRetreatCost } from "../retreat";
import { attachedEnergyCount, getAllUmamusume } from "../../core/umamusume";
import { createUmamusume } from "../setup";
import { log, logPrimaryFirst } from "../../core/log";
import { knockOutUmamusume, performAttack } from "../combat";
import { drawCards } from "../turn";
import type { PlayChoices } from "../../core/playTypes";

type AiTrainerDeps = {
  refreshContinuousEffects: (state: GameState) => void;
  switchOutOpponentActive: (state: GameState, actingSideId: SideId, pendingChoiceResume?: SwitchAfterGustResume) => void;
};

type AiCombatDeps = {
  refreshContinuousEffects: (state: GameState) => void;
  choosePreferredActiveIndex: (side: SideState) => number;
};

type AiCombatDecision =
  | { kind: "endTurn" }
  | { kind: "attack"; retreatTargetUid?: number; attackTargetUid?: number; healTargetUid?: number; usesCoinFlip: boolean };

type AiCombatDecisionResult = {
  resolved: boolean;
  usedAttack: boolean;
};

type CombatCandidate = {
  id: string;
  decision: AiCombatDecision;
  score: number;
  keepsSafe: boolean;
  lethalTarget: boolean;
  targetValue: number;
  targetIsActive: boolean;
};

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
  pendingChoiceResume: Extract<PendingPlayerChoice, { kind: "switchAfterGust" }>["resume"],
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
    if (ability.moveBenchedEnergyToActive && aiUseMoveBenchedEnergyAbility(state, side, abilityUmamusume, state.aiDifficulty)) return true;
    if (ability.coinFlipDrawOrActiveDamageCounter && aiUseCoinFlipDrawAbility(state, side, abilityUmamusume, random, deps, state.aiDifficulty)) return true;
  }

  return false;
}

function shouldAiPlayTrainer(state: GameState, side: SideState, card: Card, handIndex: number): boolean {
  if (card.kind !== "trainer") return false;
  if (!getPlayableAction(state, side, card.id).canPlay) return false;
  if (card.trainerType === "tool") return getToolTargets(side).length > 0;
  if (card.effect.gustOpponent) return getYayoiAkikawaValue(state, side) > 0;
  if (card.effect.activeAttackDamageBonus) return getAoiKiryuinBonusValue(state, side) > 0;
  if (card.effect.attachEnergyFromZoneToBench) return side.bench.length > 0;
  if (card.effect.extraEnergyAttach) return true;
  if (card.effect.retreatCostReduction) {
    const active = side.active;
    if (!active) return false;
    return side.bench.length > 0 && attachedEnergyCount(active) + card.effect.retreatCostReduction >= effectiveRetreatCost(state, side) && !canRetreat(state, side);
  }
  if (card.effect.heal && !hasDamagedHealingTarget(side, card)) return Boolean(card.effect.draw && side.hand.length < MAX_HAND);
  if (card.effect.draw && side.hand.length >= MAX_HAND) return false;
  if (card.effect.searchUmamusume || card.effect.searchRandomBasicUmamusume) {
    if (side.hand.length >= MAX_HAND) return false;
    if (card.effect.discardOtherCard) {
      const discardIndex = chooseAiDiscardHandIndex(state, side, handIndex);
      const searchIndex = chooseAiSearchDeckIndex(state, side);
      if (discardIndex === undefined || searchIndex === undefined) return false;
      const discardedCardId = side.hand[discardIndex];
      const searchedCardId = side.deck[searchIndex];
      if (!discardedCardId || !searchedCardId) return false;
      const upgradeGain = scoreCardFutureValue(state, side, searchedCardId) - scoreCardFutureValue(state, side, discardedCardId);
      return upgradeGain >= 10;
    }
    return true;
  }
  if (card.effect.rainbowUncapCrystal) return Boolean(getAiRainbowUncapChoice(state, side));
  return true;
}

function getAiBenchEnergyAttachTarget(side: SideState): UmamusumeInstance | undefined {
  const undercharged = [...side.bench]
    .sort((left, right) => scoreBenchAttachTarget(right) - scoreBenchAttachTarget(left))
    .find((umamusume) => !hasEnoughEnergy(umamusume, getPrimaryAttack(getUmamusumeCard(umamusume)).cost));
  return undercharged ?? side.bench[0];
}

function scoreBenchAttachTarget(umamusume: UmamusumeInstance): number {
  const attack = getPrimaryAttack(getUmamusumeCard(umamusume));
  return umamusume.stage * 24 + attack.damage + attachedEnergyCount(umamusume) * 12;
}

function getAiTrainerChoices(state: GameState, side: SideState, card: Extract<Card, { kind: "trainer" }>, handIndex: number): PlayChoices {
  const choices: PlayChoices = {};
  if (card.effect.attachEnergyFromZoneToBench) {
    const target = getAiBenchEnergyAttachTarget(side);
    if (target) choices.umamusumeTargetUid = target.uid;
  }
  if (card.effect.discardOtherCard) {
    const discardIndex = chooseAiDiscardHandIndex(state, side, handIndex);
    if (discardIndex !== undefined) choices.discardHandIndex = discardIndex;
  }
  if (card.effect.searchUmamusume) {
    const deckCardIndex = chooseAiSearchDeckIndex(state, side);
    if (deckCardIndex !== undefined) choices.deckCardIndex = deckCardIndex;
  }
  if (card.trainerType === "tool") {
    const toolTarget = chooseAiToolTarget(side);
    if (toolTarget) choices.umamusumeTargetUid = toolTarget.uid;
  }
  return choices;
}

function chooseAiToolTarget(side: SideState): UmamusumeInstance | undefined {
  const targets = getToolTargets(side);
  return [...targets].sort((left, right) => {
    const leftActive = left.uid === side.active?.uid ? 1 : 0;
    const rightActive = right.uid === side.active?.uid ? 1 : 0;
    if (rightActive !== leftActive) return rightActive - leftActive;
    if (right.stage !== left.stage) return right.stage - left.stage;
    return attachedEnergyCount(right) - attachedEnergyCount(left);
  })[0];
}

function chooseAiDiscardHandIndex(state: GameState, side: SideState, excludingHandIndex: number): number | undefined {
  const options = side.hand
    .map((cardId, handIndex) => ({ cardId, handIndex }))
    .filter(({ handIndex }) => handIndex !== excludingHandIndex);
  if (options.length === 0) return undefined;
  const sorted = [...options].sort((left, right) => scoreCardFutureValue(state, side, left.cardId) - scoreCardFutureValue(state, side, right.cardId));
  return sorted[0]?.handIndex;
}

function chooseAiSearchDeckIndex(state: GameState, side: SideState): number | undefined {
  const options = side.deck
    .map((cardId, deckCardIndex) => ({ cardId, deckCardIndex }))
    .filter(({ cardId }) => getCard(cardId).kind === "umamusume");
  if (options.length === 0) return undefined;
  const sorted = [...options].sort((left, right) => scoreCardFutureValue(state, side, right.cardId) - scoreCardFutureValue(state, side, left.cardId));
  return sorted[0]?.deckCardIndex;
}

function scoreCardFutureValue(state: GameState, side: SideState, cardId: string): number {
  const deckStyle = state.aiDeckStyleBySide[side.id] ?? "balanced";
  const card = getCard(cardId);
  if (card.kind === "trainer") {
    let value = card.trainerType === "supporter" ? 36 : 24;
    if (card.effect.draw) value += 24;
    if (card.effect.activeAttackDamageBonus) value += getAoiKiryuinBonusValue(state, side);
    if (card.effect.gustOpponent) value += getYayoiAkikawaValue(state, side);
    if (card.effect.rainbowUncapCrystal) value += getAiRainbowUncapChoice(state, side) ? 42 : 0;
    return value;
  }

  let value = 30 + card.stage * 18 + getPrimaryAttack(card).damage * 0.7;
  const evolutionTargets = getAllUmamusume(side).filter((umamusume) => umamusume.species === card.evolvesFrom && umamusume.stage === card.stage - 1);
  if (card.stage > 0 && evolutionTargets.length > 0) value += 70;
  if (side.active && card.evolvesFrom === side.active.species && card.stage === side.active.stage + 1) value += 45;
  if (card.stage === 0 && side.bench.length < MAX_BENCH) value += 26;
  if (deckStyle === "scaleBench" && card.species === "Agnes Digital") value += 85;
  if (deckStyle === "scaleBench" && card.stage === 0) value += 24;
  return value;
}

function scoreEvolutionTarget(state: GameState, side: SideState, target: UmamusumeInstance, evolutionCard: UmamusumeCard): number {
  const active = side.active;
  const targetCard = getUmamusumeCard(target);
  const beforeAttack = getPrimaryAttack(targetCard);
  const afterAttack = getPrimaryAttack(evolutionCard);
  const beforeCanAttack = hasEnoughEnergy(target, beforeAttack.cost);
  const afterCanAttack = hasEnoughEnergy(target, afterAttack.cost);
  const hpGain = Math.max(0, evolutionCard.hp - targetCard.hp);
  let score = 0;
  if (target.uid === active?.uid) score += 80;
  score += hpGain * 1.1;
  score += Math.max(0, afterAttack.damage - beforeAttack.damage) * 1.8;
  if (!beforeCanAttack && afterCanAttack) score += 90;
  score += attachedEnergyCount(target) * 12;
  score += evolutionCard.stage * 20;
  if (state.aiDeckStyleBySide[side.id] === "stall") score += hpGain * 0.5;
  return score;
}

function getAoiKiryuinBonusValue(state: GameState, side: SideState): number {
  if (!side.active || !canAttack(state, side)) return 0;
  const opponent = getOpposingSide(state, side.id);
  const target = opponent.active;
  if (!target) return 0;
  const ownInPlayCount = 1 + side.bench.length;
  const allInPlayCount = ownInPlayCount + 1 + opponent.bench.length;
  const withoutBonus = predictAttackDamage(side.active, target, side.activeAttackDamageBonus, ownInPlayCount, allInPlayCount);
  const withBonus = predictAttackDamage(side.active, target, side.activeAttackDamageBonus + 10, ownInPlayCount, allInPlayCount);
  const delta = Math.max(0, withBonus - withoutBonus);
  const koSwing = withoutBonus < target.hp && withBonus >= target.hp ? 90 : 0;
  return delta * 2 + koSwing;
}

function getYayoiAkikawaValue(state: GameState, side: SideState): number {
  if (!side.active || !canAttack(state, side)) return 0;
  const opponent = getOpposingSide(state, side.id);
  if (!opponent.active || opponent.bench.length === 0) return 0;
  const ownInPlayCount = 1 + side.bench.length;
  const allInPlayCount = ownInPlayCount + 1 + opponent.bench.length;
  const damageNow = predictAttackDamage(side.active, opponent.active, side.activeAttackDamageBonus, ownInPlayCount, allInPlayCount);

  const preferredBenchIndex = choosePreferredActiveIndex(opponent);
  const fallbackTarget = preferredBenchIndex >= 0 ? opponent.bench[preferredBenchIndex] : opponent.bench[0];
  if (!fallbackTarget) return 0;
  const damageAfterGust = predictAttackDamage(side.active, fallbackTarget, side.activeAttackDamageBonus, ownInPlayCount, allInPlayCount);
  const koNow = damageNow >= opponent.active.hp;
  const koAfter = damageAfterGust >= fallbackTarget.hp;
  if (!koNow && koAfter) return 120;
  return Math.max(0, damageAfterGust - damageNow);
}

function getAiRainbowUncapChoice(
  state: GameState,
  side: SideState,
): { targetUid: number; evolutionHandIndex: number } | null {
  const targets = getRainbowUncapTargets(state, side)
    .map((target) => ({ target, options: getRainbowUncapEvolutionHandOptions(side, target) }))
    .filter((entry) => entry.options.length > 0)
    .sort((left, right) => {
      if (right.target.maxHp !== left.target.maxHp) return right.target.maxHp - left.target.maxHp;
      return right.options.length - left.options.length;
    });
  const best = targets[0];
  if (!best) return null;
  const option = best.options[0];
  if (!option) return null;
  return { targetUid: best.target.uid, evolutionHandIndex: option.handIndex };
}

function shouldAttachForDamageScaling(umamusume: UmamusumeInstance, nextEnergyType: keyof UmamusumeInstance["energies"]): boolean {
  const card = getUmamusumeCard(umamusume);
  const attack = getPrimaryAttack(card);
  if (attack.damagePerAttachedEnergy?.types.includes(nextEnergyType)) return true;
  const threshold = card.ability?.attackDamageBonusIfAttachedEnergy;
  if (threshold && threshold.type === nextEnergyType && umamusume.energies[nextEnergyType] < threshold.min) return true;
  return false;
}

function aiUseMoveBenchedEnergyAbility(
  state: GameState,
  side: SideState,
  abilityUmamusume: UmamusumeInstance,
  aiDifficulty: AiDifficulty,
): boolean {
  const abilityCard = getUmamusumeCard(abilityUmamusume);
  const ability = abilityCard.ability;
  if (!ability?.moveBenchedEnergyToActive || !side.active) return false;
  const active = side.active;
  const activeAttack = getPrimaryAttack(getUmamusumeCard(active));
  const opponent = state.sides[side.id === "player" ? "opponent" : "player"];
  const beforeActiveDamage = estimateAttackDamageOutput(state, side.id, active, active);
  const beforeCanAttack = hasEnoughEnergy(active, activeAttack.cost);
  const wantedEnergyTypes = getAbilityMoveEnergyTypes(ability);
  const candidates = side.bench.flatMap((source) => wantedEnergyTypes
    .filter((energyType) => source.energies[energyType] > 0)
    .map((energyType) => {
      const simulatedActive = withEnergyShift(active, energyType, +1);
      const simulatedSource = withEnergyShift(source, energyType, -1);
      const afterActiveDamage = estimateAttackDamageOutput(state, side.id, simulatedActive, active);
      const afterCanAttack = hasEnoughEnergy(simulatedActive, activeAttack.cost);
      const sourceBeforeDamage = estimateAttackDamageOutput(state, side.id, source, source);
      const sourceAfterDamage = estimateAttackDamageOutput(state, side.id, simulatedSource, source);
      let score = 0;
      if (afterCanAttack && !beforeCanAttack) score += 220;
      score += Math.max(0, afterActiveDamage - beforeActiveDamage) * 3;
      if (activeAttack.damagePerAttachedEnergy?.types.includes(energyType)) score += 18;
      const threshold = getUmamusumeCard(active).ability?.attackDamageBonusIfAttachedEnergy;
      if (threshold && threshold.type === energyType && active.energies[energyType] < threshold.min && simulatedActive.energies[energyType] >= threshold.min) {
        score += 60;
      }
      if (sourceBeforeDamage > sourceAfterDamage) {
        score -= (sourceBeforeDamage - sourceAfterDamage) * 2.2;
      }
      if (hasEnoughEnergy(source, getPrimaryAttack(getUmamusumeCard(source)).cost) && !hasEnoughEnergy(simulatedSource, getPrimaryAttack(getUmamusumeCard(source)).cost)) {
        score -= 120;
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
  markAbilityUsed(side, abilityUmamusume, ability.name);
  log(state, `${formatUmamusumeCardName(abilityCard)}'s ${ability.name} moved 1 ${energyLabel(best.energyType)} to the active spot.`);
  return true;
}

function aiUseDamageAbility(state: GameState, side: SideState, abilityUmamusume: UmamusumeInstance, deps: AiCombatDeps): boolean {
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
  markAbilityUsed(side, abilityUmamusume, ability.name);
  log(state, `${formatUmamusumeCardName(abilityCard)}'s ${ability.name} did ${ability.damageOpponent} damage to ${formatUmamusumeInstanceName(target)}.`);
  if (target.hp <= 0) {
    if (knockOutUmamusume(state, side.id, opponentId, target, deps.choosePreferredActiveIndex, `${formatUmamusumeCardName(abilityCard)}'s ${ability.name}`)) {
      if (!state.gameOver) deps.refreshContinuousEffects(state);
    }
  }
  return true;
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

function aiUseCoinFlipDrawAbility(
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

  const heads = random() >= 0.5;
  markAbilityUsed(side, abilityUmamusume, ownerAbility.name);
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

function getHealingGained(beforeSide: SideState, afterSide: SideState): number {
  const beforeByUid = new Map(getAllUmamusume(beforeSide).map((umamusume) => [umamusume.uid, umamusume.hp]));
  return getAllUmamusume(afterSide).reduce((sum, umamusume) => {
    const beforeHp = beforeByUid.get(umamusume.uid);
    if (beforeHp === undefined) return sum;
    return sum + Math.max(0, umamusume.hp - beforeHp);
  }, 0);
}

function pickCandidateByDifficulty(
  candidates: CombatCandidate[],
  aiDifficulty: AiDifficulty,
  random: () => number,
  immediateKoThreat: boolean,
): CombatCandidate | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort(compareCandidates);
  if (aiDifficulty === "hard") return sorted[0] ?? null;

  if (aiDifficulty === "easy") {
    const easyPool = immediateKoThreat ? sorted : sorted.filter((candidate) => !(candidate.decision.kind === "attack" && candidate.decision.retreatTargetUid !== undefined));
    if (easyPool.length > 0 && random() < 0.35) {
      return easyPool[Math.floor(random() * easyPool.length)] ?? easyPool[0] ?? null;
    }
    return pickNormal(sorted, random);
  }

  return pickNormal(sorted, random);
}

function pickNormal(sortedCandidates: CombatCandidate[], random: () => number): CombatCandidate | null {
  const first = sortedCandidates[0];
  if (!first) return null;
  const second = sortedCandidates[1];
  if (!second) return first;
  return random() < 0.85 ? first : second;
}

function compareCandidates(a: CombatCandidate, b: CombatCandidate): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.lethalTarget !== b.lethalTarget) return a.lethalTarget ? -1 : 1;
  if (b.targetValue !== a.targetValue) return b.targetValue - a.targetValue;
  if (a.targetIsActive !== b.targetIsActive) return a.targetIsActive ? -1 : 1;
  if (a.decision.kind === "endTurn" && b.decision.kind !== "endTurn") return 1;
  if (b.decision.kind === "endTurn" && a.decision.kind !== "endTurn") return -1;
  return a.id.localeCompare(b.id);
}

function getDamageDealt(beforeSide: SideState, afterSide: SideState): number {
  const beforeByUid = new Map(getAllUmamusume(beforeSide).map((umamusume) => [umamusume.uid, umamusume]));
  return getAllUmamusume(afterSide).reduce((sum, umamusume) => {
    const before = beforeByUid.get(umamusume.uid);
    if (!before) return sum;
    return sum + Math.max(0, before.hp - umamusume.hp);
  }, 0) + getAllUmamusume(beforeSide).reduce((sum, umamusume) => {
    const stillExists = getAllUmamusume(afterSide).some((entry) => entry.uid === umamusume.uid);
    return stillExists ? sum : sum + Math.max(0, umamusume.hp);
  }, 0);
}

function getTargetValue(defender: SideState, targetUid?: number): number {
  const target = targetUid !== undefined
    ? getAllUmamusume(defender).find((umamusume) => umamusume.uid === targetUid)
    : defender.active;
  if (!target) return 0;
  const attackDamagePotential = getPrimaryAttack(getUmamusumeCard(target)).damage;
  return attackDamagePotential + attachedEnergyCount(target) * 12 + target.stage * 18;
}

function didCandidateKoTarget(beforeDefender: SideState, afterDefender: SideState, targetUid?: number): boolean {
  const effectiveUid = targetUid ?? beforeDefender.active?.uid;
  if (effectiveUid === undefined) return false;
  const alive = getAllUmamusume(afterDefender).some((umamusume) => umamusume.uid === effectiveUid && umamusume.hp > 0);
  return !alive;
}

function canImmediateOpponentKo(state: GameState, sideId: SideId): boolean {
  const side = state.sides[sideId];
  const opponent = state.sides[sideId === "player" ? "opponent" : "player"];
  const active = side.active;
  const attacker = opponent.active;
  if (!active || !attacker) return false;
  if (!hasEnoughEnergy(attacker, getPrimaryAttack(getUmamusumeCard(attacker)).cost)) return false;
  const ownInPlayCount = 1 + opponent.bench.length;
  const allInPlayCount = ownInPlayCount + 1 + side.bench.length;
  const predicted = predictAttackDamage(attacker, active, opponent.activeAttackDamageBonus, ownInPlayCount, allInPlayCount);
  return predicted >= active.hp;
}

function predictAttackDamage(
  attacker: UmamusumeInstance,
  defender: UmamusumeInstance,
  bonusDamage: number,
  ownInPlayCount: number,
  allInPlayCount: number,
): number {
  const attack = getPrimaryAttack(getUmamusumeCard(attacker));
  let damage = attack.damage + bonusDamage;
  if (attack.bonusIfTookDamageLastTurn && attacker.tookDamageLastTurn) damage += attack.bonusIfTookDamageLastTurn;
  if (attack.damagePerAttachedEnergy) {
    const bonusEnergyCount = attack.damagePerAttachedEnergy.types.reduce((sum, type) => sum + attacker.energies[type], 0);
    damage += bonusEnergyCount * attack.damagePerAttachedEnergy.amount;
  }
  if (attack.damagePerUmamusumeInPlay) {
    damage += (attack.damagePerUmamusumeInPlay.side === "all" ? allInPlayCount : ownInPlayCount) * attack.damagePerUmamusumeInPlay.amount;
  }
  const attackerCard = getUmamusumeCard(attacker);
  const defenderCard = getUmamusumeCard(defender);
  const conditionalBonus = attackerCard.ability?.attackDamageBonusIfAttachedEnergy;
  if (conditionalBonus && attacker.energies[conditionalBonus.type] >= conditionalBonus.min) damage += conditionalBonus.amount;
  if (attack.coinBonus) damage += Math.floor(attack.coinBonus / 2);
  if (defenderCard.weakness.type === attackerCard.type) damage += defenderCard.weakness.amount;
  return Math.max(0, damage);
}

function countDiscardedUmamusume(cardIds: string[]): number {
  return cardIds.reduce((count, cardId) => (getCard(cardId).kind === "umamusume" ? count + 1 : count), 0);
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

function buildAttackDecision(
  retreatTargetUid: number | undefined,
  attackTargetUid: number | undefined,
  healTargetUid: number | undefined,
  usesCoinFlip: boolean,
): Extract<AiCombatDecision, { kind: "attack" }> {
  const decision: Extract<AiCombatDecision, { kind: "attack" }> = { kind: "attack", usesCoinFlip };
  if (retreatTargetUid !== undefined) decision.retreatTargetUid = retreatTargetUid;
  if (attackTargetUid !== undefined) decision.attackTargetUid = attackTargetUid;
  if (healTargetUid !== undefined) decision.healTargetUid = healTargetUid;
  return decision;
}
