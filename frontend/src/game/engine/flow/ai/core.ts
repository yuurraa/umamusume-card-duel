import { MAX_BENCH } from "../../../../../../shared/src/gameData";
import type { AiDeckStyle, CoinFlipResult, GameState, SideState } from "../../../../../../shared/src/types";
import type { AiCombatDecisionResult, AiCombatDeps, AiTrainerDeps, PendingSwitchAfterGustResume } from "./types";
import { getCard, getPrimaryAttack, getUmamusumeCard } from "../../core/catalog";
import { actorName, formatUmamusumeCardName } from "../../core/labels";
import { canAttachEnergy, canUseUmamusumeAbility } from "../eligibility";
import { evolveUmamusume, findEvolutionTarget } from "../evolution";
import { applyTrainer, playStadium } from "../trainers";
import { getToolTargets, useRainbowUncapCrystal } from "../playRules";
import { getAllUmamusume } from "../../core/umamusume";
import { createUmamusume } from "../setup";
import { log, logPrimaryFirst } from "../../core/log";
import { performAttack } from "../combat";
import {
  canImmediateOpponentKo,
  pickCandidateByDifficulty,
} from "./combatUtils";
import { getAiRainbowUncapChoice, getAiTrainerChoices, scoreEvolutionTarget, shouldAiPlayTrainer } from "./trainerUtils";
import { aiUseCoinFlipDrawAbility, aiUseDamageAbility, aiUseMoveBenchedEnergyAbility } from "./abilityUtils";
import { aiAttachOneEnergy as executeAiAttachOneEnergy, estimateAttackDamageOutput, markAbilityUsed, withEnergyShift } from "./attachUtils";
import { aiRetreatToTarget, buildCombatCandidates } from "./combatPlanner";

const BASE_THREAT_PENALTY = 120;

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
  return executeAiAttachOneEnergy(state, side);
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
  forcedAttackCoinResult: CoinFlipResult | CoinFlipResult[] | undefined,
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
    undefined,
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
