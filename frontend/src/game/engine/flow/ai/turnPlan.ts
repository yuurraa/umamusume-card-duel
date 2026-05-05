import type { GameState, SideState } from "../../../../../../shared/src/types";
import { getCard, getPrimaryAttack, getUmamusumeCard } from "../../core/catalog";
import { canImmediateOpponentKo, predictAttackDamage } from "./combatUtils";
import type { AiTurnGoal } from "./types";
import { canAttack } from "../eligibility";
import { hasEnoughEnergy } from "../energy";

export function chooseAiTurnGoal(
  state: GameState,
  side: SideState,
): AiTurnGoal {
  if (!side.active) return "maximize_progress";
  if (canSecureImmediateLethal(state, side)) return "secure_lethal_now";
  if (canImmediateOpponentKo(state, side.id)) return "deny_opponent_lethal";

  const hasBench = side.bench.length > 0;
  const hasBasicInHand = side.hand.some((cardId) => {
    const card = getCard(cardId);
    return card.kind === "umamusume" && card.stage === 0;
  });
  if (!hasBench && !hasBasicInHand) return "stabilize_board";
  return "maximize_progress";
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
