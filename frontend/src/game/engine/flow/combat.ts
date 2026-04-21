import { MAX_POINTS } from "../../../../../shared/src/gameData";
import type { EnergyType, GameState, SideId, SideState, UmamusumeInstance } from "../../../../../shared/src/types";
import { getCard, getPrimaryAttack, getUmamusumeCard } from "../core/catalog";
import { actorName, actorPossessive, energyLabel, formatCardName, formatUmamusumeCardName, formatUmamusumeInstanceName, pluralize } from "../core/labels";
import { log } from "../core/log";
import { findMostDamagedUmamusume, findOwnUmamusumeByUid, getAllUmamusume } from "../core/umamusume";
import { drawCards } from "./turn";

type CombatDeps = {
  refreshContinuousEffects: (state: GameState) => void;
  choosePreferredActiveIndex: (side: SideState) => number;
};

export function performAttack(
  state: GameState,
  attackerId: SideId,
  deps: CombatDeps,
  attackTargetUid?: number,
  healTargetUid?: number,
  forcedCoinResult?: "heads" | "tails",
): void {
  const defenderId = attackerId === "player" ? "opponent" : "player";
  const pointsBeforeAttack = {
    attacker: state.sides[attackerId].points,
    defender: state.sides[defenderId].points,
  };
  const attacker = state.sides[attackerId];
  const defender = state.sides[defenderId];
  if (!attacker.active || !defender.active) return;
  const attackerCard = getUmamusumeCard(attacker.active);
  const attack = getPrimaryAttack(attackerCard);
  const attackTarget = attack.targetOpponent === "any"
    ? (attackTargetUid !== undefined ? getAllUmamusume(defender).find((umamusume) => umamusume.uid === attackTargetUid) : undefined) ?? defender.active
    : defender.active;
  if (!attackTarget) return;
  const nonDamagingAttack = isNonDamagingAttack(attack);
  const defenderCard = getUmamusumeCard(attackTarget);
  let damage = attack.damage + (nonDamagingAttack ? 0 : attacker.activeAttackDamageBonus);
  let coinFlipHeads: boolean | null = null;

  if (attack.bonusIfTookDamageLastTurn && attacker.active.tookDamageLastTurn) {
    damage += attack.bonusIfTookDamageLastTurn;
  }
  if (attack.damagePerAttachedEnergy) {
    const bonusEnergyCount = attack.damagePerAttachedEnergy.types.reduce((sum, type) => sum + attacker.active!.energies[type], 0);
    damage += bonusEnergyCount * attack.damagePerAttachedEnergy.amount;
  }
  if (attack.damagePerUmamusumeInPlay) {
    const inPlayCount = attack.damagePerUmamusumeInPlay.side === "all"
      ? getAllUmamusume(attacker).length + getAllUmamusume(defender).length
      : getAllUmamusume(attacker).length;
    damage += inPlayCount * attack.damagePerUmamusumeInPlay.amount;
  }
  const conditionalAttackBonus = attackerCard.ability?.attackDamageBonusIfAttachedEnergy;
  if (!nonDamagingAttack && conditionalAttackBonus && attacker.active.energies[conditionalAttackBonus.type] >= conditionalAttackBonus.min) {
    damage += conditionalAttackBonus.amount;
  }
  if (attack.coinBonus || attack.drawOnHeads) {
    const heads = forcedCoinResult ? forcedCoinResult === "heads" : Math.random() >= 0.5;
    coinFlipHeads = heads;
    if (heads && attack.coinBonus) damage += attack.coinBonus;
  }
  if (damage > 0 && defenderCard.weakness.type === attackerCard.type) damage += defenderCard.weakness.amount;

  const reduction = Math.min(damage, attackDamageReductionFor(state, attackTarget));
  damage = Math.max(0, damage - reduction);
  if (damage <= 0) {
    log(state, `${actorName(attacker)} used ${formatUmamusumeCardName(attackerCard)}'s ${attack.name}.`);
  } else {
    log(state, `${actorName(attacker)} attacked with ${formatUmamusumeCardName(attackerCard)}'s ${attack.name} for ${damage} damage.`);
  }
  if (coinFlipHeads !== null) {
    log(state, `Flip a coin and got 1x ${coinFlipHeads ? "heads" : "tails"}.`);
  }
  attackTarget.hp = Math.max(0, attackTarget.hp - damage);
  if (damage > 0) attackTarget.tookDamageThisTurn = true;
  if (reduction > 0) log(state, `${actorPossessive(defender)} damage reduction prevented ${reduction} damage.`);
  const counterDamage = damage > 0 && defender.active?.uid === attackTarget.uid ? activeToolCounterDamage(state, defender.active) : 0;
  if (counterDamage > 0 && attacker.active) {
    attacker.active.hp = Math.max(0, attacker.active.hp - counterDamage);
    attacker.active.tookDamageThisTurn = true;
    const toolName = defender.active.toolCardId ? getCard(defender.active.toolCardId).name : "Boxing Gloves";
    log(state, `${toolName} did ${counterDamage} damage to ${actorPossessive(attacker)} Attacking Umamusume.`);
  }

  if (attack.preventDamageNextTurn) {
    attacker.active.nextTurnDamageReduction = Math.max(attacker.active.nextTurnDamageReduction, attack.preventDamageNextTurn);
    log(state, `${actorPossessive(attacker)} ${formatUmamusumeCardName(attackerCard)} braced for the next attack.`);
  }

  if (attack.draw) {
    const drawnCardIds = drawCards(state, attacker, attack.draw);
    if (drawnCardIds.length > 0) {
      if (attacker.id === "player") {
        log(state, `${actorName(attacker)} drew ${formatCardNameList(drawnCardIds)}.`);
      } else {
        const drawn = drawnCardIds.length;
        log(state, `${actorName(attacker)} drew ${drawn} ${pluralize(drawn, "card")}.`);
      }
    }
  }
  if (attack.drawOnHeads && coinFlipHeads) {
    const drawnCardIds = drawCards(state, attacker, attack.drawOnHeads);
    if (drawnCardIds.length > 0) {
      if (attacker.id === "player") {
        log(state, `${actorName(attacker)} drew ${formatCardNameList(drawnCardIds)}.`);
      } else {
        const drawn = drawnCardIds.length;
        log(state, `${actorName(attacker)} drew ${drawn} ${pluralize(drawn, "card")}.`);
      }
    }
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
  if (attack.benchDamage && attack.benchDamage > 0) {
    defender.bench.forEach((benchedUmamusume) => {
      benchedUmamusume.hp = Math.max(0, benchedUmamusume.hp - attack.benchDamage!);
      benchedUmamusume.tookDamageThisTurn = true;
    });
    const count = defender.bench.length;
    if (count > 0) {
      log(state, `${attack.name} also did ${attack.benchDamage} damage to ${count} ${count === 1 ? "benched Umamusume" : "benched Umamusume"}.`);
    }
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

  resolveKnockout(state, attackerId, defenderId, deps, `${formatUmamusumeCardName(attackerCard)}'s ${attack.name}`);
  defender.bench
    .filter((umamusume) => umamusume.hp <= 0)
    .forEach((umamusume) => {
      if (knockOutUmamusume(state, attackerId, defenderId, umamusume, deps.choosePreferredActiveIndex, `${formatUmamusumeCardName(attackerCard)}'s ${attack.name}`)) {
        if (!state.gameOver) deps.refreshContinuousEffects(state);
      }
    });
  const preserveAttackerWin = shouldPreserveAttackerWinOnSimultaneousKo(state, attackerId, defenderId, pointsBeforeAttack);
  if (preserveAttackerWin && !state.gameOver) {
    state.gameOver = true;
    state.winner = attackerId;
    state.currentSide = "done";
    log(state, `${actorName(attacker)} reached 3 points and won.`);
  }
  if (!state.gameOver && !preserveAttackerWin && attacker.active && attacker.active.hp <= 0) {
    if (knockOutUmamusume(state, defenderId, attackerId, attacker.active, deps.choosePreferredActiveIndex, "Boxing Gloves")) {
      deps.refreshContinuousEffects(state);
    }
  }
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
  if (knockedOut.toolCardId) defender.discard.push(knockedOut.toolCardId);
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
    log(state, "Choose your next Active Umamusume.");
    return true;
  }

  const promotedIndex = choosePreferredActiveIndex(defender);
  const promoted = promotedIndex >= 0 ? defender.bench.splice(promotedIndex, 1)[0] : defender.bench.shift();
  if (!promoted) return true;
  defender.active = promoted;
  log(state, `${actorName(defender)} promoted ${formatUmamusumeInstanceName(promoted)}.`);
  return true;
}

function attackDamageReductionFor(state: GameState, umamusume: UmamusumeInstance): number {
  return (getUmamusumeCard(umamusume).ability?.damageReduction ?? 0) + umamusume.nextTurnDamageReduction + activeToolDamageReduction(state, umamusume);
}

function activeToolDamageReduction(state: GameState, umamusume: UmamusumeInstance): number {
  if (areToolsDisabled(state) || !umamusume.toolCardId) return 0;
  const tool = getCard(umamusume.toolCardId);
  return tool.kind === "trainer" ? tool.effect.toolDamageReduction ?? 0 : 0;
}

function activeToolCounterDamage(state: GameState, umamusume: UmamusumeInstance): number {
  if (areToolsDisabled(state) || !umamusume.toolCardId) return 0;
  const tool = getCard(umamusume.toolCardId);
  return tool.kind === "trainer" ? tool.effect.toolCounterDamage ?? 0 : 0;
}

function areToolsDisabled(state: GameState): boolean {
  if (!state.stadium) return false;
  const stadium = getCard(state.stadium.cardId);
  return stadium.kind === "trainer" && Boolean(stadium.effect.disableTools);
}

function resolveKnockout(state: GameState, attackerId: SideId, defenderId: SideId, deps: CombatDeps, cause?: string): void {
  const defender = state.sides[defenderId];
  if (!defender.active) return;
  if (defender.active.hp > 0) return;

  if (!knockOutUmamusume(state, attackerId, defenderId, defender.active, deps.choosePreferredActiveIndex, cause)) return;
  if (!state.gameOver) deps.refreshContinuousEffects(state);
}

function formatCardNameList(cardIds: string[]): string {
  const names = cardIds.map((cardId) => formatCardName(getCard(cardId)));
  if (names.length === 0) return "0 cards";
  if (names.length === 1) return names[0] ?? "1 card";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function isNonDamagingAttack(attack: ReturnType<typeof getPrimaryAttack>): boolean {
  return attack.damage <= 0
    && !attack.coinBonus
    && !attack.bonusIfTookDamageLastTurn
    && !attack.damagePerAttachedEnergy
    && !attack.damagePerUmamusumeInPlay;
}

function shouldPreserveAttackerWinOnSimultaneousKo(
  state: GameState,
  attackerId: SideId,
  defenderId: SideId,
  pointsBeforeAttack: { attacker: number; defender: number },
): boolean {
  const attackerAtMatchPointBefore = pointsBeforeAttack.attacker === MAX_POINTS - 1;
  const defenderAtMatchPointBefore = pointsBeforeAttack.defender === MAX_POINTS - 1;
  if (!attackerAtMatchPointBefore || !defenderAtMatchPointBefore) return false;

  const attackerPointsAfter = state.sides[attackerId].points;
  const defenderPointsAfter = state.sides[defenderId].points;
  const attackerReachedMaxFirst = attackerPointsAfter >= MAX_POINTS && pointsBeforeAttack.attacker < MAX_POINTS;
  const defenderHadNotReachedMaxBeforeResolution = defenderPointsAfter < MAX_POINTS;
  return attackerReachedMaxFirst && defenderHadNotReachedMaxBeforeResolution;
}
