import type { AiCombatDecision, CombatCandidate } from "./types";
import type { AiDifficulty, GameState, SideId, SideState, UmamusumeInstance } from "../../../../../../shared/src/types";
import { getCard, getPrimaryAttack, getUmamusumeCard } from "../../core/catalog";
import { hasEnoughEnergy } from "../energy";
import { attachedEnergyCount, getAllUmamusume } from "../../core/umamusume";

export function getHealingGained(beforeSide: SideState, afterSide: SideState): number {
  const beforeByUid = new Map(getAllUmamusume(beforeSide).map((umamusume) => [umamusume.uid, umamusume.hp]));
  return getAllUmamusume(afterSide).reduce((sum, umamusume) => {
    const beforeHp = beforeByUid.get(umamusume.uid);
    if (beforeHp === undefined) return sum;
    return sum + Math.max(0, umamusume.hp - beforeHp);
  }, 0);
}

export function pickCandidateByDifficulty(
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

export function getDamageDealt(beforeSide: SideState, afterSide: SideState): number {
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

export function getTargetValue(defender: SideState, targetUid?: number): number {
  const target = targetUid !== undefined
    ? getAllUmamusume(defender).find((umamusume) => umamusume.uid === targetUid)
    : defender.active;
  if (!target) return 0;
  const attackDamagePotential = getPrimaryAttack(getUmamusumeCard(target)).damage;
  return attackDamagePotential + attachedEnergyCount(target) * 12 + target.stage * 18;
}

export function didCandidateKoTarget(beforeDefender: SideState, afterDefender: SideState, targetUid?: number): boolean {
  const effectiveUid = targetUid ?? beforeDefender.active?.uid;
  if (effectiveUid === undefined) return false;
  const alive = getAllUmamusume(afterDefender).some((umamusume) => umamusume.uid === effectiveUid && umamusume.hp > 0);
  return !alive;
}

export function canImmediateOpponentKo(state: GameState, sideId: SideId): boolean {
  const side = state.sides[sideId];
  const opponent = state.sides[sideId === "player" ? "opponent" : "player"];
  const active = side.active;
  const attacker = opponent.active;
  if (!active || !attacker) return false;
  if (!hasEnoughEnergy(attacker, getPrimaryAttack(getUmamusumeCard(attacker)).cost)) return false;
  const ownInPlayCount = 1 + opponent.bench.length;
  const allInPlayCount = ownInPlayCount + 1 + side.bench.length;
  const predicted = predictAttackDamage(attacker, active, opponent.activeAttackDamageBonus, ownInPlayCount, allInPlayCount, state.turnNumber);
  return predicted >= active.hp;
}

export function predictAttackDamage(
  attacker: UmamusumeInstance,
  defender: UmamusumeInstance,
  bonusDamage: number,
  ownInPlayCount: number,
  allInPlayCount: number,
  turnNumber?: number,
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
  if (attack.attackDamageBonusIfToolAttached && attacker.toolCardId) damage += attack.attackDamageBonusIfToolAttached;
  const attackerCard = getUmamusumeCard(attacker);
  const defenderCard = getUmamusumeCard(defender);
  const conditionalBonus = attackerCard.ability?.attackDamageBonusIfAttachedEnergy;
  if (conditionalBonus && attacker.energies[conditionalBonus.type] >= conditionalBonus.min) damage += conditionalBonus.amount;
  const evolvedLastTurnBonus = attackerCard.ability?.attackDamageBonusIfEvolvedLastTurn ?? 0;
  if (evolvedLastTurnBonus > 0 && turnNumber !== undefined && attacker.evolvedTurn === turnNumber - 1) damage += evolvedLastTurnBonus;
  if (attack.coinBonus) damage += Math.floor(attack.coinBonus / 2);
  if (attack.knockOutActiveIfAllCoinHeads) damage += Math.floor(defender.hp / Math.pow(2, attack.knockOutActiveIfAllCoinHeads));
  if (defenderCard.weakness.type === attackerCard.type) damage += defenderCard.weakness.amount;
  return Math.max(0, damage);
}

export function countDiscardedUmamusume(cardIds: string[]): number {
  return cardIds.reduce((count, cardId) => (getCard(cardId).kind === "umamusume" ? count + 1 : count), 0);
}

export function buildAttackDecision(
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
