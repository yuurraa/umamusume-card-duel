import { MAX_POINTS } from "../../../../../shared/src/gameData";
import type { EnergyType, GameState, SideId, SideState, UmamusumeInstance } from "../../../../../shared/src/types";
import { getPrimaryAttack, getUmamusumeCard } from "../core/catalog";
import { actorName, actorPossessive, energyLabel, formatUmamusumeCardName, formatUmamusumeInstanceName, pluralize } from "../core/labels";
import { log } from "../core/log";
import { findMostDamagedUmamusume, findOwnUmamusumeByUid } from "../core/umamusume";
import { drawCards } from "./turn";

type CombatDeps = {
  refreshContinuousEffects: (state: GameState) => void;
  choosePreferredActiveIndex: (side: SideState) => number;
};

export function performAttack(state: GameState, attackerId: SideId, deps: CombatDeps, healTargetUid?: number): void {
  const defenderId = attackerId === "player" ? "opponent" : "player";
  const attacker = state.sides[attackerId];
  const defender = state.sides[defenderId];
  if (!attacker.active || !defender.active) return;
  const attackerCard = getUmamusumeCard(attacker.active);
  const attack = getPrimaryAttack(attackerCard);
  const defenderCard = getUmamusumeCard(defender.active);
  let damage = attack.damage + attacker.activeAttackDamageBonus;

  if (attack.bonusIfTookDamageLastTurn && attacker.active.tookDamageLastTurn) {
    damage += attack.bonusIfTookDamageLastTurn;
  }
  if (attack.damagePerAttachedEnergy) {
    const bonusEnergyCount = attack.damagePerAttachedEnergy.types.reduce((sum, type) => sum + attacker.active!.energies[type], 0);
    damage += bonusEnergyCount * attack.damagePerAttachedEnergy.amount;
  }
  if (attack.coinBonus) {
    const heads = Math.random() >= 0.5;
    if (heads) damage += attack.coinBonus;
    log(state, `${attack.name}'s coin flip was ${heads ? `heads (+${attack.coinBonus})` : "tails"}.`);
  }
  if (defenderCard.weakness.type === attackerCard.type) damage += defenderCard.weakness.amount;

  const reduction = Math.min(damage, attackDamageReductionFor(defender.active));
  damage = Math.max(0, damage - reduction);
  defender.active.hp = Math.max(0, defender.active.hp - damage);
  if (damage > 0) defender.active.tookDamageThisTurn = true;
  if (reduction > 0) log(state, `${actorPossessive(defender)} damage reduction prevented ${reduction} damage.`);

  if (attack.preventDamageNextTurn) {
    attacker.active.nextTurnDamageReduction = Math.max(attacker.active.nextTurnDamageReduction, attack.preventDamageNextTurn);
    log(state, `${actorPossessive(attacker)} ${formatUmamusumeCardName(attackerCard)} braced for the next attack.`);
  }

  if (attack.draw) {
    drawCards(state, attacker, attack.draw);
    log(state, `${actorName(attacker)} drew ${attack.draw} ${pluralize(attack.draw, "card")}.`);
  }
  if (attack.heal) {
    const chosenTarget = healTargetUid !== undefined ? findOwnUmamusumeByUid(attacker, healTargetUid) : undefined;
    const target = attack.healTarget === "self"
      ? attacker.active
      : attack.healTarget === "any" && chosenTarget
        ? chosenTarget
        : findMostDamagedUmamusume(attacker);
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + attack.heal);
    const healed = target.hp - before;
    if (healed > 0) log(state, `${attack.name} healed ${formatUmamusumeInstanceName(target)} for ${healed} HP.`);
  }
  if (attack.discardEnergy) {
    const attackingActive = attacker.active;
    if (!attackingActive) return;
    Object.entries(attack.discardEnergy).forEach(([type, amount]) => {
      const energyType = type as EnergyType;
      attackingActive.energies[energyType] = Math.max(0, attackingActive.energies[energyType] - (amount || 0));
      if (amount) log(state, `${actorName(attacker)} discarded ${amount} ${energyLabel(energyType)}.`);
    });
  }
  log(state, `${actorName(attacker)} attacked with ${formatUmamusumeCardName(attackerCard)}'s ${attack.name} for ${damage} damage.`);

  resolveKnockout(state, attackerId, defenderId, deps, `${formatUmamusumeCardName(attackerCard)}'s ${attack.name}`);
}

export function knockOutUmamusume(
  state: GameState,
  scoringSideId: SideId,
  knockedSideId: SideId,
  knockedOut: UmamusumeInstance,
  choosePreferredActiveIndex: (side: SideState) => number,
  cause?: string,
): boolean {
  const attacker = state.sides[scoringSideId];
  const defender = state.sides[knockedSideId];
  const activeKnockout = defender.active?.uid === knockedOut.uid;
  const benchIndex = defender.bench.findIndex((umamusume) => umamusume.uid === knockedOut.uid);
  if (!activeKnockout && benchIndex < 0) return false;

  const knockedCard = getUmamusumeCard(knockedOut);
  if (activeKnockout) defender.active = null;
  if (benchIndex >= 0) defender.bench.splice(benchIndex, 1);
  defender.bench = defender.bench.filter((umamusume) => umamusume.uid !== knockedOut.uid);
  defender.discard.push(knockedOut.cardId);
  attacker.points += 1;
  const knockedOwner = knockedSideId === "player" ? "Your" : "Opponent's";
  const sourceOwner = scoringSideId === "player" ? "your" : "opponent's";
  const causeSuffix = cause ? ` by ${sourceOwner} ${cause}` : "";
  log(state, `${knockedOwner} ${formatUmamusumeCardName(knockedCard)} was knocked out${causeSuffix}. ${actorName(attacker)} scored 1 point.`);

  if (attacker.points >= MAX_POINTS) {
    state.gameOver = true;
    state.winner = scoringSideId;
    state.currentSide = "done";
    log(state, `${actorName(attacker)} reached 3 points and won.`);
    return true;
  }

  if (!defender.active && defender.bench.length === 0) {
    state.gameOver = true;
    state.winner = scoringSideId;
    state.currentSide = "done";
    log(state, `${actorName(defender)} had no benched Umamusume. ${actorName(attacker)} won.`);
    return true;
  }

  if (!activeKnockout) return true;

  if (knockedSideId === "player") {
    state.pendingPlayerChoice = {
      kind: "promoteAfterKnockout",
      resume: state.currentSide === "opponent" ? "finishOpponentTurn" : "none",
    };
    log(state, "Choose your next active Umamusume.");
    return true;
  }

  const promotedIndex = choosePreferredActiveIndex(defender);
  const promoted = promotedIndex >= 0 ? defender.bench.splice(promotedIndex, 1)[0] : defender.bench.shift();
  if (!promoted) return true;
  defender.active = promoted;
  log(state, `${actorName(defender)} promoted ${formatUmamusumeInstanceName(promoted)}.`);
  return true;
}

function attackDamageReductionFor(umamusume: UmamusumeInstance): number {
  return (getUmamusumeCard(umamusume).ability?.damageReduction ?? 0) + umamusume.nextTurnDamageReduction;
}

function resolveKnockout(state: GameState, attackerId: SideId, defenderId: SideId, deps: CombatDeps, cause?: string): void {
  const defender = state.sides[defenderId];
  if (!defender.active) return;
  if (defender.active.hp > 0) return;

  if (!knockOutUmamusume(state, attackerId, defenderId, defender.active, deps.choosePreferredActiveIndex, cause)) return;
  if (!state.gameOver) deps.refreshContinuousEffects(state);
}
