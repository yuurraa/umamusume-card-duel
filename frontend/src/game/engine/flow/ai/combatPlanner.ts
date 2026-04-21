import type { GameState, SideId, SideState } from "../../../../../../shared/src/types";
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
  countDiscardedUmamusume,
  didCandidateKoTarget,
  getDamageDealt,
  getHealingGained,
  getTargetValue,
} from "./combatUtils";

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
