import type { CoinFlipResult, GameState, SideId, SideState } from "../../../../../../shared/src/types";
import type { AiCombatDecision, AiCombatDeps, CombatCandidate } from "./types";
import { cloneGame } from "../../core/stateClone";
import { getPrimaryAttack, getUmamusumeCard } from "../../core/catalog";
import { actorName, formatUmamusumeInstanceName } from "../../core/labels";
import { canAttack, canRetreat } from "../eligibility";
import { effectiveRetreatCost, payRetreatCost } from "../retreat";
import { attachedEnergyCount, getAllUmamusume } from "../../core/umamusume";
import { log } from "../../core/log";
import { performAttack } from "../combat";
import {
  buildAttackDecision,
  canImmediateOpponentKo,
  canImmediateOpponentKoConservative,
  countDiscardedUmamusume,
  didCandidateKoTarget,
  getDamageDealt,
  getHealingGained,
  getTargetValue,
} from "./combatUtils";
import { scoreCardFutureValue } from "./trainerUtils";

const BASE_POINTS_WEIGHT = 1000;
const BASE_KO_WEIGHT = 260;
const BASE_DAMAGE_DEALT_WEIGHT = 1.2;
const BASE_DAMAGE_TAKEN_WEIGHT = 1;
const BASE_HEAL_GAINED_WEIGHT = 0.8;
const BASE_ACTIVE_KO_BONUS = 35;

export function buildCombatCandidates(
  state: GameState,
  side: SideState,
  deps: AiCombatDeps,
  forcedAttackCoinResult?: CoinFlipResult | CoinFlipResult[],
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

  if (candidates.length === 0) {
    candidates.push(scoreCandidate(state, side.id, deps, { kind: "endTurn" }, "end-turn"));
  }
  return candidates;
}

export function aiRetreatToTarget(state: GameState, side: SideState, targetUid: number): boolean {
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

function buildAttackCandidates(
  state: GameState,
  side: SideState,
  deps: AiCombatDeps,
  forcedAttackCoinResult?: CoinFlipResult | CoinFlipResult[],
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
  const usesCoinFlip = Boolean(attack.coinBonus || attack.drawOnHeads || attack.knockOutActiveIfAllCoinHeads);
  const shuffleOptions = attack.shuffleSelfIntoDeck ? [false, true] : [undefined];
  const discardOptions = buildDiscardOptions(state, side);
  const candidates: CombatCandidate[] = [];

  resolvedAttackTargets.forEach((attackTargetUid) => {
    resolvedHealTargets.forEach((healTargetUid) => {
      shuffleOptions.forEach((useShuffleSelfIntoDeck) => {
        discardOptions.forEach((discardOption) => {
          const shuffleTag = useShuffleSelfIntoDeck === undefined ? "auto" : (useShuffleSelfIntoDeck ? "shuffle" : "keep");
          const discardTag = `${discardOption.discardHandIndex ?? "auto"}-${discardOption.maxDiscardCount ?? "auto"}-${discardOption.discardHandIndexes?.join(".") ?? "auto"}`;
          if (!usesCoinFlip || forcedAttackCoinResult) {
            const decision = buildAttackDecision(retreatTargetUid, attackTargetUid, healTargetUid, usesCoinFlip, useShuffleSelfIntoDeck, discardOption.discardHandIndex, discardOption.maxDiscardCount, discardOption.discardHandIndexes);
            candidates.push(scoreCandidate(state, side.id, deps, decision, `${retreatTargetUid ?? "stay"}-${attackTargetUid ?? "active"}-${healTargetUid ?? "auto"}-${shuffleTag}-${discardTag}-${forcedAttackCoinResult ?? "none"}`));
            return;
          }

          const heads = scoreCandidate(
            state,
            side.id,
            deps,
            buildAttackDecision(retreatTargetUid, attackTargetUid, healTargetUid, true, useShuffleSelfIntoDeck, discardOption.discardHandIndex, discardOption.maxDiscardCount, discardOption.discardHandIndexes),
            `${retreatTargetUid ?? "stay"}-${attackTargetUid ?? "active"}-${healTargetUid ?? "auto"}-${shuffleTag}-${discardTag}-heads`,
            "heads",
          );
          const tails = scoreCandidate(
            state,
            side.id,
            deps,
            buildAttackDecision(retreatTargetUid, attackTargetUid, healTargetUid, true, useShuffleSelfIntoDeck, discardOption.discardHandIndex, discardOption.maxDiscardCount, discardOption.discardHandIndexes),
            `${retreatTargetUid ?? "stay"}-${attackTargetUid ?? "active"}-${healTargetUid ?? "auto"}-${shuffleTag}-${discardTag}-tails`,
            "tails",
          );
          candidates.push({
            ...heads,
            id: `${retreatTargetUid ?? "stay"}-${attackTargetUid ?? "active"}-${healTargetUid ?? "auto"}-${shuffleTag}-${discardTag}-expected`,
            score: (heads.score + tails.score) / 2,
          });
        });
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
  forcedCoinResult?: CoinFlipResult | CoinFlipResult[],
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
    performAttack(
      simulated,
      actingSideId,
      deps,
      decision.attackTargetUid,
      decision.healTargetUid,
      forcedCoinResult,
      undefined,
      0,
      decision.discardHandIndex,
      undefined,
      undefined,
      decision.useShuffleSelfIntoDeck,
      decision.maxDiscardCount,
      decision.discardHandIndexes,
    );
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
  const shuffleRiskPenalty = getOptionalSelfShuffleRiskPenalty(before, simulated, actingSideId, decision, lethalTarget);
  const nextTurnLockPenalty = getCannotAttackNextTurnPenalty(before, simulated, actingSideId, decision, lethalTarget);
  const benchSurvivalPenalty = getBenchSurvivalFloorPenalty(before, simulated, actingSideId, lethalTarget);
  const statusValue = getStatusPressureValue(before, simulated, actingSideId, decision);
  const handValueSpent = getDiscardedHandValue(before, simulated, actingSideId);

  return {
    id,
    decision,
    score: score + statusValue - shuffleRiskPenalty - nextTurnLockPenalty - benchSurvivalPenalty - handValueSpent,
    keepsSafe: !canImmediateOpponentKo(simulated, actingSideId),
    lethalTarget,
    targetValue,
    targetIsActive,
  };
}

function buildDiscardOptions(
  state: GameState,
  side: SideState,
): Array<{ discardHandIndex?: number; maxDiscardCount?: number; discardHandIndexes?: number[] }> {
  const active = side.active;
  if (!active) return [{}];
  const attack = getPrimaryAttack(getUmamusumeCard(active));
  const handOptions = side.hand
    .map((cardId, handIndex) => ({ cardId, handIndex, value: scoreCardFutureValue(state, side, cardId) }))
    .sort((left, right) => left.value - right.value);

  if (attack.attackDamageBonusIfDiscardHandCard) {
    const cheapest = handOptions[0];
    return cheapest ? [{ discardHandIndex: cheapest.handIndex }, {}] : [{}];
  }

  if (attack.attackDamageBonusPerDiscardedHandCard) {
    const max = Math.min(attack.attackDamageBonusPerDiscardedHandCard.maxDiscard, side.hand.length);
    const options = new Set<number>([0, max]);
    const opponent = state.sides[side.id === "player" ? "opponent" : "player"];
    const defenderHp = opponent.active?.hp ?? 0;
    const baseDamage = attack.damage + side.activeAttackDamageBonus;
    const perCard = attack.attackDamageBonusPerDiscardedHandCard.bonusPerCard;
    const enoughForActiveKo = defenderHp > 0 ? Math.ceil(Math.max(0, defenderHp - baseDamage) / perCard) : max;
    options.add(Math.max(0, Math.min(max, enoughForActiveKo)));
    if (max > 1) options.add(Math.max(1, Math.ceil(max / 2)));
    return [...options].sort((left, right) => left - right).map((maxDiscardCount) => ({
      maxDiscardCount,
      discardHandIndexes: handOptions.slice(0, maxDiscardCount).map((option) => option.handIndex),
    }));
  }

  return [{}];
}

function getDiscardedHandValue(before: GameState, after: GameState, actingSideId: SideId): number {
  const beforeSide = before.sides[actingSideId];
  const afterSide = after.sides[actingSideId];
  const afterHandCounts = new Map<string, number>();
  afterSide.hand.forEach((cardId) => afterHandCounts.set(cardId, (afterHandCounts.get(cardId) ?? 0) + 1));
  let penalty = 0;
  beforeSide.hand.forEach((cardId) => {
    const remaining = afterHandCounts.get(cardId) ?? 0;
    if (remaining > 0) {
      afterHandCounts.set(cardId, remaining - 1);
      return;
    }
    penalty += Math.min(90, scoreCardFutureValue(before, beforeSide, cardId) * 0.45);
  });
  return penalty;
}

function getStatusPressureValue(
  before: GameState,
  after: GameState,
  actingSideId: SideId,
  decision: AiCombatDecision,
): number {
  if (decision.kind !== "attack") return 0;
  const defenderId: SideId = actingSideId === "player" ? "opponent" : "player";
  const beforeDefender = before.sides[defenderId];
  const afterDefender = after.sides[defenderId];
  const beforeActive = beforeDefender.active;
  const afterActive = afterDefender.active;
  if (!beforeActive || !afterActive || beforeActive.uid !== afterActive.uid) return 0;

  let score = 0;
  if (!beforeActive.specialConditions.includes("paralysed") && afterActive.specialConditions.includes("paralysed")) {
    const preventedLethal = canImmediateOpponentKoConservative(before, actingSideId) && !canImmediateOpponentKoConservative(after, actingSideId);
    score += preventedLethal ? 180 : 70;
  }
  if (!beforeActive.specialConditions.includes("poisoned") && afterActive.specialConditions.includes("poisoned")) {
    score += afterActive.hp <= 10 ? 150 : 34;
  }
  return score;
}

function getBenchSurvivalFloorPenalty(
  before: GameState,
  after: GameState,
  actingSideId: SideId,
  lethalTarget: boolean,
): number {
  if (lethalTarget) return 0;
  const beforeSide = before.sides[actingSideId];
  const afterSide = after.sides[actingSideId];
  const threatened = canImmediateOpponentKoConservative(after, actingSideId);
  const benchCount = afterSide.bench.length;
  if (benchCount >= 2 && !threatened) return 0;

  let penalty = 0;
  if (benchCount === 0) penalty += 260;
  else if (benchCount === 1) penalty += threatened ? 180 : 90;
  else if (threatened) penalty += 50;

  if (benchCount > 0) {
    const fragileBench = afterSide.bench.filter((u) => u.hp <= 40).length;
    penalty += fragileBench * (threatened ? 46 : 22);
  }

  // If we reduced bench stability compared with before, tax that extra.
  if (afterSide.bench.length < beforeSide.bench.length) {
    penalty += (beforeSide.bench.length - afterSide.bench.length) * 35;
  }
  return penalty;
}

function getCannotAttackNextTurnPenalty(
  before: GameState,
  after: GameState,
  actingSideId: SideId,
  decision: AiCombatDecision,
  lethalTarget: boolean,
): number {
  if (decision.kind !== "attack") return 0;
  const beforeActive = before.sides[actingSideId].active;
  const afterActive = after.sides[actingSideId].active;
  if (!beforeActive || !afterActive || beforeActive.uid !== afterActive.uid) return 0;
  const gainedLock = afterActive.attackBlockedUntilOwnTurn !== beforeActive.attackBlockedUntilOwnTurn;
  if (!gainedLock) return 0;
  if (lethalTarget) return 0;
  return after.sides[actingSideId].bench.length === 0 ? 120 : 55;
}

function getOptionalSelfShuffleRiskPenalty(
  before: GameState,
  after: GameState,
  actingSideId: SideId,
  decision: AiCombatDecision,
  lethalTarget: boolean,
): number {
  if (decision.kind !== "attack" || decision.useShuffleSelfIntoDeck !== true) return 0;

  const beforeSide = before.sides[actingSideId];
  const afterSide = after.sides[actingSideId];
  const beforeActive = beforeSide.active;
  const afterActive = afterSide.active;
  if (!beforeActive || !afterActive) return 0;

  let penalty = 0;
  if (afterSide.bench.length === 0) penalty += 220;
  else if (afterSide.bench.length === 1) penalty += 110;

  const promotedHpLoss = Math.max(0, beforeActive.hp - afterActive.hp);
  penalty += promotedHpLoss * 1.2;

  const investedEnergy = attachedEnergyCount(beforeActive);
  if (!lethalTarget) penalty += investedEnergy * 28;
  else penalty += investedEnergy * 8;

  if (beforeSide.points >= 2 && !lethalTarget) penalty += 160;
  return penalty;
}
