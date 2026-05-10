import { MAX_BENCH, MAX_HAND } from "../../../../../../shared/src/gameData";
import type { Card, GameState, SideId, SideState, TrainerCard, UmamusumeCard, UmamusumeInstance } from "../../../../../../shared/src/types";
import { getCard, getPrimaryAttack, getUmamusumeCard } from "../../core/catalog";
import { hasEnoughEnergy } from "../energy";
import { canAttack, canRetreat } from "../eligibility";
import { hasDamagedHealingTarget } from "../trainers";
import { getPlayableAction, getRainbowUncapEvolutionHandOptions, getRainbowUncapTargets, getToolTargets } from "../playRules";
import { effectiveRetreatCost, retreatCost } from "../retreat";
import { attachedEnergyCount, getAllUmamusume } from "../../core/umamusume";
import type { PlayChoices } from "../../core/playTypes";
import { getPublicOpponentView } from "./publicInfo";
import {
  getAoiKiryuinBonusValueFromPublic,
  getOpponentActiveEnergyCountFromPublic,
  getYayoiAkikawaValueFromPublic,
} from "./opponentHeuristics";
import { countConsumedBasics, getKnownRemainingDeckCounts } from "./deckInference";
import { scoreAttackEnergyPoolFit } from "./energyAwareness";
import { canImmediateOpponentKoConservative } from "./combatUtils";
import type { AiTurnGoal } from "./types";
import type { EnergyType } from "../../../../../../shared/src/types";
import { hasConsecutiveNoAttackTurns } from "./turnPlan";

export function shouldAiPlayTrainer(state: GameState, side: SideState, card: Card, handIndex: number, turnGoal: AiTurnGoal = "maximize_progress"): boolean {
  if (card.kind !== "trainer") return false;
  if (!getPlayableAction(state, side, card.id).canPlay) return false;
  const recoveryMode = hasConsecutiveNoAttackTurns(state, side.title, 2);
  const benchFragile = side.bench.length <= 1;
  const underThreat = canImmediateOpponentKoConservative(state, side.id);
  if (card.trainerType === "stadium") return shouldAiPlayStadium(state, side, card, turnGoal, recoveryMode);
  if (recoveryMode) {
    if (card.effect.searchUmamusume || card.effect.searchRandomBasicUmamusume || card.effect.draw) {
      return side.hand.length < MAX_HAND;
    }
    if (card.effect.retreatCostReduction || card.effect.activeAttackDamageBonus || card.effect.gustOpponent) {
      return false;
    }
  }
  if (card.trainerType === "tool") return getToolTargets(side).length > 0;
  if (card.effect.gustOpponent) return getYayoiAkikawaValue(state, side) > 0;
  if (card.effect.activeAttackDamageBonus) return getAoiKiryuinBonusValue(state, side) > 0;
  if (benchFragile && underThreat && (card.effect.activeAttackDamageBonus || card.effect.gustOpponent)) return false;
  if (card.effect.discardRandomOpponentActiveEnergy) return getOpponentActiveEnergyCount(state, side) > 0;
  if (card.effect.attachEnergyFromZoneToBench) return side.bench.length > 0;
  if (card.effect.moveEnergyFromBenchToActive) return hasBenchedEnergyForSupporter(side);
  if (card.effect.shuffleOpponentHandIntoDeckDraw) return getShuffleOpponentHandValue(state, side, card.effect.shuffleOpponentHandIntoDeckDraw) > 10;
  if (card.effect.swapHandUmamusumeWithRandomDeckUmamusume) return getResetWhistleValue(state, side) > 8;
  if (card.effect.discardToolOrStadium) return Boolean(getBestDiscardToolOrStadiumChoice(state, side));
  if (card.effect.revealOpponentHand) return getRevealOpponentHandValue(state, side) > 0;
  if (card.effect.randomBasicUmamusumeFromDiscard) return side.hand.length < MAX_HAND && getRandomBasicFromDiscardValue(state, side) > 0;
  if (card.effect.extraEnergyAttach) return true;
  if (card.effect.retreatCostReduction) {
    const active = side.active;
    if (!active) return false;
    if (side.bench.length === 0) return false;
    const reduction = card.effect.retreatCostReduction;
    if (!reduction) return false;
    const retreatUnlocksNow = !canRetreat(state, side) && attachedEnergyCount(active) + reduction >= effectiveRetreatCost(state, side);
    if (!retreatUnlocksNow) return false;
    if (turnGoal === "deny_opponent_lethal") {
      if (!canImmediateOpponentKoConservative(state, side.id)) return false;
      return isRetreatLikelyBeneficial(state, side);
    }
    return isRetreatLikelyBeneficial(state, side);
  }
  if (card.effect.heal && !hasDamagedHealingTarget(side, card)) return Boolean(card.effect.draw && side.hand.length < MAX_HAND);
  if (card.effect.draw && side.hand.length >= MAX_HAND) return false;
  if (card.effect.searchUmamusume || card.effect.searchEvolutionUmamusume || card.effect.searchRandomBasicUmamusume) {
    if (side.hand.length >= MAX_HAND) return false;
    if (turnGoal === "stabilize_board" && card.effect.searchUmamusume) return true;
    if (card.effect.discardOtherCard) {
      if (turnGoal === "deny_opponent_lethal" && side.hand.length <= 2) return false;
      const discardIndex = chooseAiDiscardHandIndex(state, side, handIndex);
      const searchIndex = chooseAiSearchDeckIndex(state, side, false, turnGoal === "stabilize_board");
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

function hasBenchedEnergyForSupporter(side: SideState): boolean {
  if (!side.active) return false;
  return side.bench.some((umamusume) => (Object.values(umamusume.energies) as number[]).some((count) => count > 0));
}

function shouldAiPlayStadium(
  state: GameState,
  side: SideState,
  card: Extract<Card, { kind: "trainer" }>,
  turnGoal: AiTurnGoal,
  recoveryMode: boolean,
): boolean {
  if (card.trainerType !== "stadium") return false;
  if ((turnGoal === "stabilize_board" || recoveryMode) && card.effect.shuffleHandIntoDeckDraw) return true;
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
  let score = handSizeScore * attackPenalty * alreadyUsedPenalty;

  // Emergency mulligan heuristic:
  // if we have no bench and no Basic in hand, prioritize digging for one to avoid instant loss on active KO.
  const hasBench = side.bench.length > 0;
  const hasBasicInHand = side.hand.some((cardId) => {
    const card = getCard(cardId);
    return card.kind === "umamusume" && card.stage === 0;
  });
  if (!hasBench && !hasBasicInHand) {
    const deckCounts = getKnownRemainingDeckCounts(side);
    const basicsInDeck = deckCounts.basicUmamusume;
    const consumedBasics = countConsumedBasics(side);
    if (basicsInDeck > 0) {
      score += 44 + Math.min(22, consumedBasics * 1.5);
    }
  }

  return score;
}

export function getAiTrainerChoices(
  state: GameState,
  side: SideState,
  card: Extract<Card, { kind: "trainer" }>,
  handIndex: number,
  turnGoal: AiTurnGoal = "maximize_progress",
): PlayChoices {
  const choices: PlayChoices = {};
  if (card.effect.attachEnergyFromZoneToBench) {
    const target = getAiBenchEnergyAttachTarget(state, side);
    if (target) choices.umamusumeTargetUid = target.uid;
  }
  if (card.effect.discardOtherCard) {
    const discardIndex = chooseAiDiscardHandIndex(state, side, handIndex);
    if (discardIndex !== undefined) choices.discardHandIndex = discardIndex;
  }
  if (card.effect.searchUmamusume) {
    const deckCardIndex = chooseAiSearchDeckIndex(state, side, false, turnGoal === "stabilize_board");
    if (deckCardIndex !== undefined) choices.deckCardIndex = deckCardIndex;
  }
  if (card.effect.searchEvolutionUmamusume) {
    const deckCardIndex = chooseAiSearchDeckIndex(state, side, true);
    if (deckCardIndex !== undefined) choices.deckCardIndex = deckCardIndex;
  }
  if (card.trainerType === "tool") {
    const toolTarget = chooseAiToolTarget(state, side, card);
    if (toolTarget) choices.umamusumeTargetUid = toolTarget.uid;
  }
  if (card.effect.swapHandUmamusumeWithRandomDeckUmamusume) {
    const swapHandCardIndex = chooseResetWhistleHandIndex(state, side);
    if (swapHandCardIndex !== undefined) choices.swapHandCardIndex = swapHandCardIndex;
  }
  if (card.effect.discardToolOrStadium) {
    const discardChoice = getBestDiscardToolOrStadiumChoice(state, side);
    if (discardChoice?.discardStadiumInPlay) choices.discardStadiumInPlay = true;
    if (discardChoice?.discardToolHolderUmamusumeUid !== undefined) choices.discardToolHolderUmamusumeUid = discardChoice.discardToolHolderUmamusumeUid;
  }
  if (card.effect.heal && card.effect.healTarget === "any") {
    const target = getBestHealTrainerTarget(state, side, card);
    if (target) choices.umamusumeTargetUid = target.uid;
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
  score += scoreAttackEnergyPoolFit(side, afterAttack.cost);
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

function getAiBenchEnergyAttachTarget(state: GameState, side: SideState): UmamusumeInstance | undefined {
  const nextEnergyType = side.energyZone[0];
  const undercharged = [...side.bench]
    .sort((left, right) => scoreBenchAttachTarget(state, side, right, nextEnergyType) - scoreBenchAttachTarget(state, side, left, nextEnergyType))
    .find((umamusume) => !hasEnoughEnergy(umamusume, getPrimaryAttack(getUmamusumeCard(umamusume)).cost));
  return undercharged ?? side.bench[0];
}

function scoreBenchAttachTarget(
  state: GameState,
  side: SideState,
  umamusume: UmamusumeInstance,
  nextEnergyType?: EnergyType,
): number {
  const attack = getPrimaryAttack(getUmamusumeCard(umamusume));
  const beforeCanAttack = hasEnoughEnergy(umamusume, attack.cost);
  let afterCanAttack = beforeCanAttack;
  if (nextEnergyType) {
    const simulated = {
      ...umamusume,
      energies: { ...umamusume.energies, [nextEnergyType]: umamusume.energies[nextEnergyType] + 1 },
    };
    afterCanAttack = hasEnoughEnergy(simulated, attack.cost);
  }
  let score = umamusume.stage * 24 + attack.damage + attachedEnergyCount(umamusume) * 12;
  score += scoreAttackEnergyPoolFit(side, attack.cost);
  if (!beforeCanAttack && afterCanAttack) score += 120;
  if (side.active && !canAttack(state, side) && !beforeCanAttack && afterCanAttack) score += 80;
  return score;
}

function chooseAiToolTarget(state: GameState, side: SideState, tool: TrainerCard): UmamusumeInstance | undefined {
  const targets = getToolTargets(side);
  return [...targets].sort((left, right) => {
    const leftScore = scoreToolTarget(state, side, left, tool);
    const rightScore = scoreToolTarget(state, side, right, tool);
    if (rightScore !== leftScore) return rightScore - leftScore;
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

function chooseAiSearchDeckIndex(
  state: GameState,
  side: SideState,
  evolutionOnly = false,
  preferBasics = false,
): number | undefined {
  const options = side.deck
    .map((cardId, deckCardIndex) => ({ cardId, deckCardIndex }))
    .filter(({ cardId }) => {
      const card = getCard(cardId);
      return card.kind === "umamusume" && (!evolutionOnly || card.stage > 0);
    });
  if (options.length === 0) return undefined;
  if (preferBasics) {
    const basicOptions = options.filter(({ cardId }) => {
      const card = getCard(cardId);
      return card.kind === "umamusume" && card.stage === 0;
    });
    if (basicOptions.length > 0) {
      const bestBasic = [...basicOptions].sort((left, right) => scoreCardFutureValue(state, side, right.cardId) - scoreCardFutureValue(state, side, left.cardId))[0];
      return bestBasic?.deckCardIndex;
    }
  }
  const sorted = [...options].sort((left, right) => scoreCardFutureValue(state, side, right.cardId) - scoreCardFutureValue(state, side, left.cardId));
  return sorted[0]?.deckCardIndex;
}

export function scoreCardFutureValue(state: GameState, side: SideState, cardId: string): number {
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
  value += scoreAttackEnergyPoolFit(side, getPrimaryAttack(card).cost);
  const evolutionTargets = getAllUmamusume(side).filter((umamusume) => umamusume.species === card.evolvesFrom && umamusume.stage === card.stage - 1);
  if (card.stage > 0 && evolutionTargets.length > 0) value += 70;
  if (side.active && card.evolvesFrom === side.active.species && card.stage === side.active.stage + 1) value += 45;
  if (card.stage === 0 && side.bench.length < MAX_BENCH) value += 26;
  if (deckStyle === "scaleBench" && card.species === "Agnes Digital") value += 85;
  if (deckStyle === "scaleBench" && card.stage === 0) value += 24;
  return value;
}

function scoreToolTarget(state: GameState, side: SideState, target: UmamusumeInstance, tool: TrainerCard): number {
  const active = side.active;
  const isActive = target.uid === active?.uid;
  const card = getUmamusumeCard(target);
  const attack = getPrimaryAttack(card);
  const ready = hasEnoughEnergy(target, attack.cost);
  let score = target.stage * 16 + attachedEnergyCount(target) * 10 + attack.damage * 0.6;
  if (isActive) score += 38;
  if (ready) score += 18;
  if (tool.effect.toolDamageReduction) {
    score += target.maxHp >= 100 ? 22 : 8;
    if (isActive && canImmediateOpponentKoConservative(state, side.id)) score += 60;
    if (target.hp <= tool.effect.toolDamageReduction + 30) score += 18;
  }
  if (tool.effect.toolCounterDamage) {
    if (isActive) score += 54;
    if (target.hp >= 40) score += 16;
  }
  if (tool.effect.toolEndTurnHealActive) {
    if (isActive) score += Math.min(tool.effect.toolEndTurnHealActive, target.maxHp - target.hp) * 6 + 24;
    else score -= 20;
  }
  if (tool.effect.toolEndTurnRecoverSpecialConditionsDiscardSelf) {
    score += target.specialConditions.length * 70;
    if (isActive) score += 12;
  }
  return score;
}

function getShuffleOpponentHandValue(state: GameState, side: SideState, drawAmount: number): number {
  const opponent = state.sides[side.id === "player" ? "opponent" : "player"];
  const handDelta = opponent.hand.length - drawAmount;
  let score = handDelta * 18;
  if (opponent.hand.length >= 5) score += 24;
  if (opponent.hand.length <= drawAmount) score -= 30;
  if (canAttack(state, side)) score -= 10;
  return score;
}

function getRevealOpponentHandValue(state: GameState, side: SideState): number {
  const opponent = state.sides[side.id === "player" ? "opponent" : "player"];
  if (opponent.hand.length === 0) return 0;
  const tacticalFollowUp = side.hand.some((cardId) => {
    const card = getCard(cardId);
    return card.kind === "trainer" && (card.effect.gustOpponent || card.effect.discardRandomOpponentActiveEnergy || card.effect.shuffleOpponentHandIntoDeckDraw);
  });
  if (tacticalFollowUp) return 18 + opponent.hand.length * 3;
  return opponent.hand.length >= 4 ? 8 : 0;
}

function getRandomBasicFromDiscardValue(state: GameState, side: SideState): number {
  const basics = side.discard.filter((cardId) => {
    const card = getCard(cardId);
    return card.kind === "umamusume" && card.stage === 0;
  });
  if (basics.length === 0) return 0;
  if (side.bench.length === 0) return 80;
  if (side.bench.length < MAX_BENCH) return 28;
  return state.aiDeckStyleBySide[side.id] === "scaleBench" ? 18 : 4;
}

function getResetWhistleValue(state: GameState, side: SideState): number {
  const handIndex = chooseResetWhistleHandIndex(state, side);
  if (handIndex === undefined) return 0;
  const handCardId = side.hand[handIndex];
  if (!handCardId) return 0;
  const handValue = scoreCardFutureValue(state, side, handCardId);
  const deckValues = side.deck
    .filter((cardId) => getCard(cardId).kind === "umamusume")
    .map((cardId) => scoreCardFutureValue(state, side, cardId));
  if (deckValues.length === 0) return 0;
  const averageDeckValue = deckValues.reduce((sum, value) => sum + value, 0) / deckValues.length;
  return averageDeckValue - handValue;
}

function chooseResetWhistleHandIndex(state: GameState, side: SideState): number | undefined {
  const options = side.hand
    .map((cardId, handIndex) => ({ cardId, handIndex }))
    .filter(({ cardId }) => getCard(cardId).kind === "umamusume");
  if (options.length === 0) return undefined;
  return [...options].sort((left, right) => scoreCardFutureValue(state, side, left.cardId) - scoreCardFutureValue(state, side, right.cardId))[0]?.handIndex;
}

function getBestDiscardToolOrStadiumChoice(
  state: GameState,
  side: SideState,
): { discardStadiumInPlay?: boolean; discardToolHolderUmamusumeUid?: number; score: number } | null {
  const candidates: Array<{ discardStadiumInPlay?: boolean; discardToolHolderUmamusumeUid?: number; score: number }> = [];
  if (state.stadium) {
    const stadium = getCard(state.stadium.cardId);
    if (stadium.kind === "trainer" && stadium.trainerType === "stadium") {
      const value = evaluateStadiumNetValue(state, side.id, stadium);
      candidates.push({ discardStadiumInPlay: true, score: -value + (state.stadium.owner === side.id ? -12 : 10) });
    }
  }
  (["player", "opponent"] as SideId[]).forEach((sideId) => {
    const owner = state.sides[sideId];
    getAllUmamusume(owner).forEach((umamusume) => {
      if (!umamusume.toolCardId) return;
      const tool = getCard(umamusume.toolCardId);
      if (tool.kind !== "trainer") return;
      const ownTool = sideId === side.id;
      const toolValue = scoreAttachedToolValue(state, owner, umamusume, tool);
      candidates.push({
        discardToolHolderUmamusumeUid: umamusume.uid,
        score: ownTool ? -toolValue - 16 : toolValue + 12,
      });
    });
  });
  const best = candidates.sort((left, right) => right.score - left.score)[0];
  return best && best.score > 10 ? best : null;
}

function scoreAttachedToolValue(state: GameState, owner: SideState, holder: UmamusumeInstance, tool: TrainerCard): number {
  let score = 0;
  const isActive = owner.active?.uid === holder.uid;
  if (isActive) score += 18;
  if (tool.effect.toolDamageReduction) score += 24 + (isActive && canImmediateOpponentKoConservative(state, owner.id) ? 32 : 0);
  if (tool.effect.toolCounterDamage) score += isActive ? 42 : 12;
  if (tool.effect.toolEndTurnHealActive) score += isActive ? 22 + Math.max(0, holder.maxHp - holder.hp) * 0.5 : 4;
  if (tool.effect.toolEndTurnRecoverSpecialConditionsDiscardSelf) score += holder.specialConditions.length * 50 + 8;
  return score;
}

function getBestHealTrainerTarget(state: GameState, side: SideState, trainer: TrainerCard): UmamusumeInstance | undefined {
  if (!trainer.effect.heal) return undefined;
  return getAllUmamusume(side)
    .filter((umamusume) => umamusume.hp < umamusume.maxHp)
    .sort((left, right) => {
      const leftScore = scoreHealTarget(state, side, left, trainer.effect.heal ?? 0);
      const rightScore = scoreHealTarget(state, side, right, trainer.effect.heal ?? 0);
      return rightScore - leftScore;
    })[0];
}

function scoreHealTarget(state: GameState, side: SideState, target: UmamusumeInstance, heal: number): number {
  const missing = target.maxHp - target.hp;
  let score = Math.min(missing, heal) * 2;
  if (target.uid === side.active?.uid) score += 20;
  if (target.hp <= 30) score += 18;
  if (canImmediateOpponentKoConservative(state, side.id) && target.uid === side.active?.uid) score += 28;
  score += target.stage * 8 + attachedEnergyCount(target) * 4;
  return score;
}

function getOpponentActiveEnergyCount(state: GameState, side: SideState): number {
  const opponent = getPublicOpponentView(state, side.id);
  return getOpponentActiveEnergyCountFromPublic(opponent);
}

function getAoiKiryuinBonusValue(state: GameState, side: SideState): number {
  if (!side.active || !canAttack(state, side)) return 0;
  const opponent = getPublicOpponentView(state, side.id);
  return getAoiKiryuinBonusValueFromPublic(
    side.active,
    opponent,
    side.activeAttackDamageBonus,
    side.bench.length,
    state.turnNumber,
  );
}

function getYayoiAkikawaValue(state: GameState, side: SideState): number {
  if (!side.active || !canAttack(state, side)) return 0;
  const opponent = getPublicOpponentView(state, side.id);
  return getYayoiAkikawaValueFromPublic(
    side.active,
    opponent,
    side.activeAttackDamageBonus,
    side.bench.length,
    state.turnNumber,
  );
}

function isRetreatLikelyBeneficial(state: GameState, side: SideState): boolean {
  const active = side.active;
  if (!active) return false;
  const activeAttack = getPrimaryAttack(getUmamusumeCard(active));
  const activeCanAttack = hasEnoughEnergy(active, activeAttack.cost);
  return side.bench.some((bench) => {
    const benchAttack = getPrimaryAttack(getUmamusumeCard(bench));
    const benchCanAttack = hasEnoughEnergy(bench, benchAttack.cost);
    if (!activeCanAttack && benchCanAttack) return true;
    if (bench.maxHp - active.maxHp >= 20) return true;
    if (bench.hp - active.hp >= 20) return true;
    return bench.stage > active.stage && bench.hp >= active.hp;
  });
}
