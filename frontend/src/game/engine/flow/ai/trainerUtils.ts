import { MAX_BENCH, MAX_HAND } from "../../../../../../shared/src/gameData";
import type { Card, GameState, SideId, SideState, TrainerCard, UmamusumeCard, UmamusumeInstance } from "../../../../../../shared/src/types";
import { getCard, getPrimaryAttack, getUmamusumeCard } from "../../core/catalog";
import { hasEnoughEnergy } from "../energy";
import { canAttack, canRetreat } from "../eligibility";
import { hasDamagedHealingTarget } from "../trainers";
import { getPlayableAction, getRainbowUncapEvolutionHandOptions, getRainbowUncapTargets, getToolTargets } from "../playRules";
import { choosePreferredActiveIndex, getOpposingSide } from "../board";
import { effectiveRetreatCost, retreatCost } from "../retreat";
import { attachedEnergyCount, getAllUmamusume } from "../../core/umamusume";
import type { PlayChoices } from "../../core/playTypes";
import { predictAttackDamage } from "./combatUtils";

export function shouldAiPlayTrainer(state: GameState, side: SideState, card: Card, handIndex: number): boolean {
  if (card.kind !== "trainer") return false;
  if (!getPlayableAction(state, side, card.id).canPlay) return false;
  if (card.trainerType === "stadium") return shouldAiPlayStadium(state, side, card);
  if (card.trainerType === "tool") return getToolTargets(side).length > 0;
  if (card.effect.gustOpponent) return getYayoiAkikawaValue(state, side) > 0;
  if (card.effect.activeAttackDamageBonus) return getAoiKiryuinBonusValue(state, side) > 0;
  if (card.effect.discardRandomOpponentActiveEnergy) return getOpponentActiveEnergyCount(state, side) > 0;
  if (card.effect.attachEnergyFromZoneToBench) return side.bench.length > 0;
  if (card.effect.extraEnergyAttach) return true;
  if (card.effect.retreatCostReduction) {
    const active = side.active;
    if (!active) return false;
    return side.bench.length > 0 && attachedEnergyCount(active) + card.effect.retreatCostReduction >= effectiveRetreatCost(state, side) && !canRetreat(state, side);
  }
  if (card.effect.heal && !hasDamagedHealingTarget(side, card)) return Boolean(card.effect.draw && side.hand.length < MAX_HAND);
  if (card.effect.draw && side.hand.length >= MAX_HAND) return false;
  if (card.effect.searchUmamusume || card.effect.searchEvolutionUmamusume || card.effect.searchRandomBasicUmamusume) {
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
  if (card.effect.recoverActiveSpecialConditions) return Boolean(side.active && side.active.specialConditions.length > 0);
  return true;
}

function shouldAiPlayStadium(state: GameState, side: SideState, card: Extract<Card, { kind: "trainer" }>): boolean {
  if (card.trainerType !== "stadium") return false;
  const candidateValue = evaluateStadiumNetValue(state, side.id, card);

  if (!state.stadium) {
    return candidateValue >= 8;
  }

  const activeStadium = getCard(state.stadium.cardId);
  const currentValue = activeStadium.kind === "trainer" && activeStadium.trainerType === "stadium"
    ? evaluateStadiumNetValue(state, side.id, activeStadium)
    : 0;
  const improvement = candidateValue - currentValue;
  if (improvement <= 0) return false;

  if (state.stadium.owner === side.id) {
    return candidateValue >= 8 && improvement >= 12;
  }
  return candidateValue >= 6 && improvement >= 4;
}

function evaluateStadiumNetValue(state: GameState, perspectiveSideId: SideId, stadium: TrainerCard): number {
  const opponentSideId: SideId = perspectiveSideId === "player" ? "opponent" : "player";
  const ownValue = evaluateStadiumSideValue(state, perspectiveSideId, stadium);
  const opponentValue = evaluateStadiumSideValue(state, opponentSideId, stadium);
  return ownValue - opponentValue;
}

function evaluateStadiumSideValue(state: GameState, sideId: SideId, stadium: TrainerCard): number {
  const side = state.sides[sideId];
  const opponentSideId: SideId = sideId === "player" ? "opponent" : "player";
  const opponent = state.sides[opponentSideId];
  let score = 0;

  const retreatReduction = stadium.effect.globalRetreatCostReduction ?? 0;
  if (retreatReduction > 0 && side.active && side.bench.length > 0) {
    const activeRetreatCost = retreatCost(getUmamusumeCard(side.active).retreat);
    const retreatRelief = Math.min(retreatReduction, activeRetreatCost);
    score += retreatRelief * 14;
    if (!canRetreat(state, side) && attachedEnergyCount(side.active) + retreatReduction >= effectiveRetreatCost(state, side)) {
      score += 36;
    }
  }

  const basicHpBonus = stadium.effect.basicHpBonus ?? 0;
  if (basicHpBonus > 0) {
    score += countBasicsInPlay(side) * basicHpBonus * 0.7;
  }

  if (stadium.effect.shuffleHandIntoDeckDraw) {
    score += scoreShuffleHandIntoDeckDrawValue(state, side);
  }

  if (stadium.effect.disableTools) {
    score += countToolsInPlay(opponent) * 22;
    score -= countToolsInPlay(side) * 18;
  }

  return score;
}

function countBasicsInPlay(side: SideState): number {
  return getAllUmamusume(side).reduce((count, umamusume) => {
    const card = getUmamusumeCard(umamusume);
    return count + (card.stage === 0 ? 1 : 0);
  }, 0);
}

function countToolsInPlay(side: SideState): number {
  return getAllUmamusume(side).reduce((count, umamusume) => count + (umamusume.toolCardId ? 1 : 0), 0);
}

function scoreShuffleHandIntoDeckDrawValue(state: GameState, side: SideState): number {
  const handSizeScore = side.hand.length <= 1
    ? 34
    : side.hand.length <= 3
      ? 22
      : side.hand.length <= 5
        ? 12
        : 4;
  const attackPenalty = canAttack(state, side) ? 0.45 : 1;
  const alreadyUsedPenalty = side.usedStadiumThisTurn ? 0.35 : 1;
  return handSizeScore * attackPenalty * alreadyUsedPenalty;
}

export function getAiTrainerChoices(state: GameState, side: SideState, card: Extract<Card, { kind: "trainer" }>, handIndex: number): PlayChoices {
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
  if (card.effect.searchEvolutionUmamusume) {
    const deckCardIndex = chooseAiSearchDeckIndex(state, side, true);
    if (deckCardIndex !== undefined) choices.deckCardIndex = deckCardIndex;
  }
  if (card.trainerType === "tool") {
    const toolTarget = chooseAiToolTarget(side);
    if (toolTarget) choices.umamusumeTargetUid = toolTarget.uid;
  }
  return choices;
}

export function scoreEvolutionTarget(state: GameState, side: SideState, target: UmamusumeInstance, evolutionCard: UmamusumeCard): number {
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

export function getAiRainbowUncapChoice(
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

function chooseAiSearchDeckIndex(state: GameState, side: SideState, evolutionOnly = false): number | undefined {
  const options = side.deck
    .map((cardId, deckCardIndex) => ({ cardId, deckCardIndex }))
    .filter(({ cardId }) => {
      const card = getCard(cardId);
      return card.kind === "umamusume" && (!evolutionOnly || card.stage > 0);
    });
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
    if (card.effect.discardRandomOpponentActiveEnergy) value += getOpponentActiveEnergyCount(state, side) * 18;
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

function getOpponentActiveEnergyCount(state: GameState, side: SideState): number {
  const opponent = state.sides[side.id === "player" ? "opponent" : "player"];
  if (!opponent.active) return 0;
  return Object.values(opponent.active.energies).reduce((sum, count) => sum + count, 0);
}

function getAoiKiryuinBonusValue(state: GameState, side: SideState): number {
  if (!side.active || !canAttack(state, side)) return 0;
  const opponent = getOpposingSide(state, side.id);
  const target = opponent.active;
  if (!target) return 0;
  const ownInPlayCount = 1 + side.bench.length;
  const allInPlayCount = ownInPlayCount + 1 + opponent.bench.length;
  const withoutBonus = predictAttackDamage(side.active, target, side.activeAttackDamageBonus, ownInPlayCount, allInPlayCount, state.turnNumber);
  const withBonus = predictAttackDamage(side.active, target, side.activeAttackDamageBonus + 10, ownInPlayCount, allInPlayCount, state.turnNumber);
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
  const damageNow = predictAttackDamage(side.active, opponent.active, side.activeAttackDamageBonus, ownInPlayCount, allInPlayCount, state.turnNumber);

  const preferredBenchIndex = choosePreferredActiveIndex(opponent);
  const fallbackTarget = preferredBenchIndex >= 0 ? opponent.bench[preferredBenchIndex] : opponent.bench[0];
  if (!fallbackTarget) return 0;
  const damageAfterGust = predictAttackDamage(side.active, fallbackTarget, side.activeAttackDamageBonus, ownInPlayCount, allInPlayCount, state.turnNumber);
  const koNow = damageNow >= opponent.active.hp;
  const koAfter = damageAfterGust >= fallbackTarget.hp;
  if (!koNow && koAfter) return 120;
  return Math.max(0, damageAfterGust - damageNow);
}
