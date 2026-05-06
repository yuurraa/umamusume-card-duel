import type { GameState, SideState } from "../../../../../../shared/src/types";
import { getCard, getPrimaryAttack, getUmamusumeCard } from "../../core/catalog";
import { canImmediateOpponentKoConservative, predictAttackDamage } from "./combatUtils";
import type { AiTurnGoal } from "./types";
import { canAttack } from "../eligibility";
import { hasEnoughEnergy } from "../energy";
import { isAttackSupportedByEnergyPool } from "./energyAwareness";

export function chooseAiTurnGoal(
  state: GameState,
  side: SideState,
): AiTurnGoal {
  if (!side.active) return "maximize_progress";
  if (canSecureImmediateLethal(state, side)) return "secure_lethal_now";
  if (canSetUpTwoTurnLethal(state, side)) return "set_up_two_turn_lethal";
  if (canImmediateOpponentKoConservative(state, side.id)) return "deny_opponent_lethal";
  if (hadRecentNoAttack(state, side.title)) return "maximize_progress";

  const hasBench = side.bench.length > 0;
  const hasBasicInHand = side.hand.some((cardId) => {
    const card = getCard(cardId);
    return card.kind === "umamusume" && card.stage === 0;
  });
  if (!hasBench && !hasBasicInHand) {
    return hasBenchRecoveryOptionInHand(side) ? "stabilize_board" : "maximize_progress";
  }
  return "maximize_progress";
}

export function explainAiTurnGoal(state: GameState, side: SideState): string[] {
  if (!side.active) return ["no_active"];
  if (canSecureImmediateLethal(state, side)) return ["immediate_lethal"];
  if (canSetUpTwoTurnLethal(state, side)) return ["two_turn_setup_window"];
  if (canImmediateOpponentKoConservative(state, side.id)) return ["ko_threat_conservative"];
  if (hasConsecutiveNoAttackTurns(state, side.title, 2)) return ["no_attack_recovery_mode"];
  const hasBench = side.bench.length > 0;
  const hasBasicInHand = side.hand.some((cardId) => {
    const card = getCard(cardId);
    return card.kind === "umamusume" && card.stage === 0;
  });
  if (!hasBench && !hasBasicInHand) return ["no_bench_no_basic_in_hand"];
  return ["default_progress"];
}

function canSetUpTwoTurnLethal(state: GameState, side: SideState): boolean {
  if (!side.active || canSecureImmediateLethal(state, side)) return false;
  const opponent = state.sides[side.id === "player" ? "opponent" : "player"];
  if (!opponent.active) return false;
  if (!canAttack(state, side)) return false;
  const attacker = side.active;
  const attack = getPrimaryAttack(getUmamusumeCard(attacker));
  if (!isAttackSupportedByEnergyPool(side, attack.cost)) return false;
  const typedCostMet = Object.entries(attack.cost)
    .filter(([type]) => type !== "colorless")
    .every(([type, amount]) => attacker.energies[type as keyof typeof attacker.energies] >= (amount ?? 0));
  if (!typedCostMet) return false;
  const totalCost = Object.values(attack.cost).reduce((sum, amount) => sum + (amount ?? 0), 0);
  const attached = Object.values(attacker.energies).reduce((sum, amount) => sum + amount, 0);
  if (attached + 1 < totalCost) return false;
  const ownInPlayCount = 1 + side.bench.length;
  const allInPlayCount = ownInPlayCount + 1 + opponent.bench.length;
  const damageNow = predictAttackDamage(
    attacker,
    opponent.active,
    side.activeAttackDamageBonus,
    ownInPlayCount,
    allInPlayCount,
    state.turnNumber,
  );
  const neededToKo = opponent.active.hp - damageNow;
  if (neededToKo <= 0) return false;
  if (damageNow <= 0) return false;
  // Heuristic: if a single extra attachment likely flips the KO race and we're not dead immediately, pursue setup.
  if (neededToKo <= 30 && damageNow >= 20 && !canImmediateOpponentKoConservative(state, side.id)) return true;
  return false;
}

function canSecureImmediateLethal(state: GameState, side: SideState): boolean {
  if (!side.active || !canAttack(state, side)) return false;
  const opponent = state.sides[side.id === "player" ? "opponent" : "player"];
  if (!opponent.active) return false;
  const attacker = side.active;
  const attack = getPrimaryAttack(getUmamusumeCard(attacker));
  if (!hasEnoughEnergy(attacker, attack.cost)) return false;
  const ownInPlayCount = 1 + side.bench.length;
  const allInPlayCount = ownInPlayCount + 1 + opponent.bench.length;
  const damage = predictAttackDamage(
    attacker,
    opponent.active,
    side.activeAttackDamageBonus,
    ownInPlayCount,
    allInPlayCount,
    state.turnNumber,
  );
  return damage >= opponent.active.hp;
}

function hasBenchRecoveryOptionInHand(side: SideState): boolean {
  return side.hand.some((cardId) => {
    const card = getCard(cardId);
    if (card.kind !== "trainer") return false;
    if (card.effect.searchUmamusume || card.effect.searchRandomBasicUmamusume) return true;
    if (card.effect.draw || card.effect.shuffleHandIntoDeckDraw) return true;
    return false;
  });
}

function hadRecentNoAttack(state: GameState, sideTitle: string): boolean {
  return hasConsecutiveNoAttackTurns(state, sideTitle, 1);
}

export function hasConsecutiveNoAttackTurns(state: GameState, sideTitle: string, requiredCount: number): boolean {
  const noAttack = `${sideTitle} did not attack.`;
  const attackPrefix = `${sideTitle} attacked with `;
  let streak = 0;
  for (const entry of state.log.slice(0, 64)) {
    if (entry === noAttack) {
      streak += 1;
      if (streak >= requiredCount) return true;
      continue;
    }
    if (entry.startsWith(attackPrefix)) {
      streak = 0;
      continue;
    }
  }
  return false;
}
