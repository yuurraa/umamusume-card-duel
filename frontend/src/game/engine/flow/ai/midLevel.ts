import type { CoinFlipResult, GameState, SideState } from "../../../../../../shared/src/types";
import { cloneGame } from "../../core/stateClone";
import { getPrimaryAttack, getUmamusumeCard } from "../../core/catalog";
import { attachedEnergyCount } from "../../core/umamusume";
import { performAttack } from "../combat";
import type { AiCombatDeps, AiCombatDecision, CombatCandidate, MidLevelDecision } from "./types";
import { aiRetreatToTarget, buildCombatCandidates } from "./combatPlanner";
import { canImmediateOpponentKoConservative } from "./combatUtils";
import { hasEnoughEnergy } from "../energy";

export function chooseMidLevelCombatDecision(
  state: GameState,
  side: SideState,
  candidates: CombatCandidate[],
  deps: AiCombatDeps,
  forcedAttackCoinResult?: CoinFlipResult | CoinFlipResult[],
): MidLevelDecision | null {
  if (candidates.length === 0) return null;

  const lethalCandidates = candidates.filter((candidate) => candidate.lethalTarget);
  if (lethalCandidates.length > 0) {
    return {
      goal: "secure_lethal",
      candidate: pickBestCandidate(lethalCandidates),
    };
  }

  if (canImmediateOpponentKoConservative(state, side.id)) {
    const safeCandidates = candidates.filter((candidate) => candidate.keepsSafe);
    if (safeCandidates.length > 0) {
      return {
        goal: "deny_opponent_lethal",
        candidate: pickBestCandidate(safeCandidates),
      };
    }
  }

  return {
    goal: "maximize_expected_damage",
    candidate: pickBestLookaheadCandidate(state, side, candidates, deps, forcedAttackCoinResult),
  };
}

function pickBestCandidate(candidates: CombatCandidate[]): CombatCandidate {
  return [...candidates].sort(compareCandidates)[0] ?? candidates[0]!;
}

function pickBestLookaheadCandidate(
  state: GameState,
  side: SideState,
  candidates: CombatCandidate[],
  deps: AiCombatDeps,
  forcedAttackCoinResult?: CoinFlipResult | CoinFlipResult[],
): CombatCandidate {
  const topCandidates = [...candidates].sort(compareCandidates).slice(0, 3);
  const sideId = side.id;
  const opponentId = sideId === "player" ? "opponent" : "player";
  let best = topCandidates[0] ?? candidates[0]!;
  let bestAdjusted = Number.NEGATIVE_INFINITY;

  topCandidates.forEach((candidate) => {
    const simulated = cloneGame(state);
    const simulatedSide = simulated.sides[sideId];
    applyDecision(simulated, simulatedSide, candidate.decision, deps, forcedAttackCoinResult);
    const risk = estimateOpponentBestScore(simulated, opponentId, deps);
    const retreatPenalty = estimateRetreatInvestmentPenalty(state, side, candidate.decision);
    const adjusted = candidate.score - risk * 0.35 - retreatPenalty;
    if (adjusted > bestAdjusted) {
      bestAdjusted = adjusted;
      best = candidate;
    }
  });

  return best;
}

function applyDecision(
  state: GameState,
  side: SideState,
  decision: AiCombatDecision,
  deps: AiCombatDeps,
  forcedAttackCoinResult?: CoinFlipResult | CoinFlipResult[],
): void {
  if (decision.kind !== "attack") return;
  if (decision.retreatTargetUid !== undefined) {
    const retreated = aiRetreatToTarget(state, side, decision.retreatTargetUid);
    if (!retreated) return;
  }
  performAttack(
    state,
    side.id,
    deps,
    decision.attackTargetUid,
    decision.healTargetUid,
    decision.usesCoinFlip ? forcedAttackCoinResult : undefined,
    undefined,
    0,
    undefined,
    undefined,
    undefined,
    decision.useShuffleSelfIntoDeck,
  );
}

function estimateOpponentBestScore(
  state: GameState,
  opponentId: "player" | "opponent",
  deps: AiCombatDeps,
): number {
  if (state.gameOver) {
    return state.winner === opponentId ? 5000 : 0;
  }
  const opponent = state.sides[opponentId];
  if (!opponent.active) return 0;
  const responses = buildCombatCandidates(state, opponent, deps);
  const best = responses.sort(compareCandidates)[0];
  return best?.score ?? 0;
}

function estimateRetreatInvestmentPenalty(
  state: GameState,
  side: SideState,
  decision: AiCombatDecision,
): number {
  if (decision.kind !== "attack" || decision.retreatTargetUid === undefined) return 0;
  const active = side.active;
  if (!active) return 0;
  const retreatTarget = side.bench.find((umamusume) => umamusume.uid === decision.retreatTargetUid);
  if (!retreatTarget) return 0;

  const activeCard = getUmamusumeCard(active);
  const activeAttack = getPrimaryAttack(activeCard);
  const targetCard = getUmamusumeCard(retreatTarget);
  const targetAttack = getPrimaryAttack(targetCard);
  const activeEnergy = attachedEnergyCount(active);
  const targetEnergy = attachedEnergyCount(retreatTarget);
  const activeReady = hasEnoughEnergy(active, activeAttack.cost);
  const targetReady = hasEnoughEnergy(retreatTarget, targetAttack.cost);
  const threatenedNow = canImmediateOpponentKoConservative(state, side.id);

  // Guardrail for "loaded attacker retreats into fragile pivot" lines.
  let penalty = 0;
  if (active.stage >= 1 && activeEnergy >= 2) penalty += activeEnergy * 28 + active.stage * 20;
  if (active.maxHp - retreatTarget.maxHp >= 30) penalty += 34;
  if (activeReady && !targetReady) penalty += 32;
  if (activeReady && targetAttack.damage + 20 < activeAttack.damage) penalty += 22;
  if (!threatenedNow && active.hp >= 40) penalty += 18;
  if (targetEnergy === 0 && retreatTarget.maxHp <= 80) penalty += 18;
  return penalty;
}

function compareCandidates(left: CombatCandidate, right: CombatCandidate): number {
  if (right.score !== left.score) return right.score - left.score;
  if (left.lethalTarget !== right.lethalTarget) return left.lethalTarget ? -1 : 1;
  if (right.targetValue !== left.targetValue) return right.targetValue - left.targetValue;
  if (left.targetIsActive !== right.targetIsActive) return left.targetIsActive ? -1 : 1;
  if (left.decision.kind === "endTurn" && right.decision.kind !== "endTurn") return 1;
  if (right.decision.kind === "endTurn" && left.decision.kind !== "endTurn") return -1;
  return left.id.localeCompare(right.id);
}
