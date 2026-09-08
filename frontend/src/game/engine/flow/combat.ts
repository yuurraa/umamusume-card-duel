import { MAX_POINTS } from "../../../../../shared/src/gameData";
import { isExCard } from "../../../../../shared/src/cardRarity";
import type { CoinFlipResult, EnergyType, GameState, SideId, SideState, UmamusumeInstance } from "../../../../../shared/src/types";
import { getCard, getPrimaryAttack, getUmamusumeCard } from "../core/catalog";
import { actorLowerPossessive, actorName, actorPossessive, energyLabel, formatCardName, formatUmamusumeCardName, formatUmamusumeInstanceName, pluralize } from "../core/labels";
import { log } from "../core/log";
import { findMostDamagedUmamusume, findOwnUmamusumeByUid, getAllUmamusume } from "../core/umamusume";
import { drawCards } from "./turn";
import { shuffle, type RandomSource } from "../core/random";
import { evolveUmamusume } from "./evolution";
import { getUmamusumeAbility } from "./abilityRules";
import { clearSpecialConditions } from "./specialConditions";
import { beginTransition, emitCardMovement, emitEnergyChanges, emitGameEvent, emitStatusChanges, endTransition } from "../core/events";

type CombatDeps = {
  refreshContinuousEffects: (state: GameState) => void;
  choosePreferredActiveIndex: (side: SideState) => number;
  random?: RandomSource;
};

export function performAttack(
  state: GameState,
  attackerId: SideId,
  deps: CombatDeps,
  attackTargetUid?: number,
  healTargetUid?: number,
  forcedCoinResult?: CoinFlipResult | CoinFlipResult[],
  evolutionDeckCardIndex?: number,
  attackIndex = 0,
  discardHandIndex?: number,
  randomDiscardIndex?: number,
  switchTargetUid?: number,
  useShuffleSelfIntoDeck?: boolean,
  maxDiscardCount?: number,
  discardHandIndexes?: number[],
  evolutionHandCardIndex?: number,
): void {
  const transitionId = beginTransition(state);
  try {
    performAttackInternal(
      state,
      attackerId,
      deps,
      attackTargetUid,
      healTargetUid,
      forcedCoinResult,
      evolutionDeckCardIndex,
      attackIndex,
      discardHandIndex,
      randomDiscardIndex,
      switchTargetUid,
      useShuffleSelfIntoDeck,
      maxDiscardCount,
      discardHandIndexes,
      evolutionHandCardIndex,
    );
  } finally {
    endTransition(state, transitionId);
  }
}

function performAttackInternal(
  state: GameState,
  attackerId: SideId,
  deps: CombatDeps,
  attackTargetUid?: number,
  healTargetUid?: number,
  forcedCoinResult?: CoinFlipResult | CoinFlipResult[],
  evolutionDeckCardIndex?: number,
  attackIndex = 0,
  discardHandIndex?: number,
  randomDiscardIndex?: number,
  switchTargetUid?: number,
  useShuffleSelfIntoDeck?: boolean,
  maxDiscardCount?: number,
  discardHandIndexes?: number[],
  evolutionHandCardIndex?: number,
): void {
  const random = deps.random ?? Math.random;
  const defenderId = attackerId === "player" ? "opponent" : "player";
  const pointsBeforeAttack = {
    attacker: state.sides[attackerId].points,
    defender: state.sides[defenderId].points,
  };
  const attacker = state.sides[attackerId];
  const defender = state.sides[defenderId];
  if (!attacker.active || !defender.active) return;
  const attackerCard = getUmamusumeCard(attacker.active);
  const attack = attackerCard.attacks[attackIndex];
  if (!attack) return;
  const startingActive = attacker.active;
  if (attackTargetUid !== undefined && (
    attack.targetOpponent !== "any"
    || !getAllUmamusume(defender).some((umamusume) => umamusume.uid === attackTargetUid)
  )) return;
  if (attack.targetOpponent === "any" && attackTargetUid === undefined) return;
  if (healTargetUid !== undefined && (
    !attack.heal
    || attack.healTarget !== "any"
    || !getAllUmamusume(attacker).some((umamusume) => umamusume.uid === healTargetUid)
  )) return;
  if (switchTargetUid !== undefined && (
    !attack.switchSelfAfterAttack
    || !attacker.bench.some((umamusume) => umamusume.uid === switchTargetUid)
  )) return;
  const switchTarget = resolveSwitchTarget(state, attacker, attackerId, switchTargetUid, attack.switchSelfAfterAttack, deps.choosePreferredActiveIndex);
  const attackTarget = attack.targetOpponent === "any"
    ? getAllUmamusume(defender).find((umamusume) => umamusume.uid === attackTargetUid)
    : defender.active;
  if (!attackTarget) return;
  const attackTargetHpBefore = attackTarget.hp;
  const nonDamagingAttack = isNonDamagingAttack(attack);
  const defenderCard = getUmamusumeCard(attackTarget);
  let damage = attack.damage + (nonDamagingAttack ? 0 : attacker.activeAttackDamageBonus);
  let coinFlipHeads: boolean | null = null;
  const forcedCoinResults = Array.isArray(forcedCoinResult) ? [...forcedCoinResult] : forcedCoinResult ? [forcedCoinResult] : [];

  // Frozen uses the Pokémon TCG Pocket Confusion rule: each attack attempt
  // flips a coin, and tails ends the attack without any effect or self-damage.
  if (attacker.active.specialConditions.includes("frozen")) {
    const frozenCoinResult = flipCoin(attacker, forcedCoinResults, random);
    emitGameEvent(state, {
      kind: "coin",
      visibility: "public",
      side: attackerId,
      results: [frozenCoinResult],
    });
    if (frozenCoinResult === "tails") {
      log(state, `${formatUmamusumeInstanceName(attacker.active)} is Frozen. Flip a coin and got 1x tails; ${attack.name} failed.`);
      emitGameEvent(state, {
        kind: "attack",
        visibility: "public",
        actorSide: attackerId,
        actorUid: startingActive.uid,
        targetSide: defenderId,
        targetUid: attackTarget.uid,
        attackName: attack.name,
        damage: 0,
        hpBefore: attackTargetHpBefore,
        hpAfter: attackTargetHpBefore,
      });
      return;
    }
    log(state, `${formatUmamusumeInstanceName(attacker.active)} is Frozen. Flip a coin and got 1x heads.`);
  }

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
  if (attack.attackDamageBonusIfToolAttached && attacker.active.toolCardId && !areToolsDisabled(state)) {
    damage += attack.attackDamageBonusIfToolAttached;
  }
  if (switchTarget && attack.switchSelfAfterAttack?.bonusDamage) {
    damage += attack.switchSelfAfterAttack.bonusDamage;
  }
  if (attack.attackDamageBonusIfDiscardHandCard && attacker.hand.length > 0) {
    const requestedDiscardIndex = discardHandIndex !== undefined && discardHandIndex >= 0 && discardHandIndex < attacker.hand.length
      ? discardHandIndex
      : undefined;
    const resolvedDiscardIndex = requestedDiscardIndex ?? (!state.humanBySide[attackerId] ? 0 : undefined);
    if (resolvedDiscardIndex !== undefined) {
      const [discardedCardId] = attacker.hand.splice(resolvedDiscardIndex, 1);
      if (discardedCardId) {
        attacker.discard.push(discardedCardId);
        damage += attack.attackDamageBonusIfDiscardHandCard;
        emitGameEvent(state, {
          kind: "cardMovement",
          visibility: "actor",
          side: attackerId,
          from: "hand",
          to: "discard",
          count: 1,
          cardIds: [discardedCardId],
        });
        log(state, `${actorName(attacker)} discarded ${formatCardName(getCard(discardedCardId))} for ${attack.name}.`);
      }
    }
  }
  const attackerAbility = getUmamusumeAbility(state, attackerId, attacker.active);
  const conditionalAttackBonus = attackerAbility?.attackDamageBonusIfAttachedEnergy;
  if (!nonDamagingAttack && conditionalAttackBonus && attacker.active.energies[conditionalAttackBonus.type] >= conditionalAttackBonus.min) {
    damage += conditionalAttackBonus.amount;
  }
  if (attack.damagePerUniqueAttachedEnergy) {
    const uniqueEnergyCount = Object.values(attacker.active.energies).filter((count) => count > 0).length;
    damage += uniqueEnergyCount * attack.damagePerUniqueAttachedEnergy;
  }
  if (attack.attackDamageBonusPerDiscardedHandCard && attacker.hand.length > 0) {
    const requestedDiscardCount = maxDiscardCount ?? attack.attackDamageBonusPerDiscardedHandCard.maxDiscard;
    const discardCount = Math.max(0, Math.min(requestedDiscardCount, attack.attackDamageBonusPerDiscardedHandCard.maxDiscard, attacker.hand.length));
    const indexes = discardHandIndexes?.length
      ? [...discardHandIndexes].filter((index) => index >= 0 && index < attacker.hand.length).slice(0, discardCount)
      : Array.from({ length: discardCount }, (_, index) => index);
    const uniqueIndexes = [...new Set(indexes)].sort((left, right) => right - left);
    let actualDiscardCount = 0;
    for (const index of uniqueIndexes) {
      const [discardedCardId] = attacker.hand.splice(index, 1);
      if (!discardedCardId) break;
      attacker.discard.push(discardedCardId);
      emitGameEvent(state, {
        kind: "cardMovement",
        visibility: "actor",
        side: attackerId,
        from: "hand",
        to: "discard",
        count: 1,
        cardIds: [discardedCardId],
      });
      actualDiscardCount += 1;
    }
    if (actualDiscardCount > 0) {
      damage += actualDiscardCount * attack.attackDamageBonusPerDiscardedHandCard.bonusPerCard;
      log(state, `${actorName(attacker)} discarded ${actualDiscardCount} ${pluralize(actualDiscardCount, "card")} for ${attack.name}.`);
    }
  }
  const evolvedLastTurnBonus = attackerAbility?.attackDamageBonusIfEvolvedLastTurn ?? 0;
  if (!nonDamagingAttack && evolvedLastTurnBonus > 0 && attacker.active.evolvedTurn === state.turnNumber - 1) {
    damage += evolvedLastTurnBonus;
  }
  const evolvedThisTurnOrLastTurnBonus = attackerAbility?.attackDamageBonusIfEvolvedThisTurnOrLastTurn ?? 0;
  if (!nonDamagingAttack && evolvedThisTurnOrLastTurnBonus > 0 && (attacker.active.evolvedTurn === state.turnNumber || attacker.active.evolvedTurn === state.turnNumber - 1)) {
    damage += evolvedThisTurnOrLastTurnBonus;
  }
  if (attack.attackDamageBonusIfOpponentActiveHasSpecialCondition && attackTarget.specialConditions.length > 0) {
    damage += attack.attackDamageBonusIfOpponentActiveHasSpecialCondition;
  }
  if (attack.coinBonus || attack.drawOnHeads || attack.discardRandomOpponentHandOnHeads) {
    const coinResult = flipCoin(attacker, forcedCoinResults, random);
    emitGameEvent(state, {
      kind: "coin",
      visibility: "public",
      side: attackerId,
      results: [coinResult],
    });
    const heads = coinResult === "heads";
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
  if (attack.guaranteeNextCoinFlipHeads) {
    attacker.guaranteedCoinFlipHeads = (attacker.guaranteedCoinFlipHeads ?? 0) + attack.guaranteeNextCoinFlipHeads;
    log(state, `${actorPossessive(attacker)} next coin flip is guaranteed to be heads.`);
  }
  if (attack.knockOutActiveIfAllCoinHeads) {
    const results = Array.from({ length: attack.knockOutActiveIfAllCoinHeads }, () => flipCoin(attacker, forcedCoinResults, random));
    emitGameEvent(state, {
      kind: "coin",
      visibility: "public",
      side: attackerId,
      results,
    });
    log(state, formatCoinFlipResultLog(results));
    if (results.every((result) => result === "heads")) {
      attackTarget.hp = 0;
      log(state, `${attack.name} knocked out ${actorPossessive(defender)} Active Umamusume.`);
    }
  }
  attackTarget.hp = Math.max(0, attackTarget.hp - damage);
  if (damage > 0) attackTarget.tookDamageThisTurn = true;
  emitGameEvent(state, {
    kind: "attack",
    visibility: "public",
    actorSide: attackerId,
    actorUid: startingActive.uid,
    targetSide: defenderId,
    targetUid: attackTarget.uid,
    attackName: attack.name,
    damage,
    hpBefore: attackTargetHpBefore,
    hpAfter: attackTarget.hp,
  });
  if (reduction > 0) log(state, `${actorPossessive(defender)} damage reduction prevented ${reduction} damage.`);
  const counterDamage = damage > 0 && defender.active?.uid === attackTarget.uid ? activeToolCounterDamage(state, defender.active) : 0;
  if (counterDamage > 0 && attacker.active) {
    const attackerHpBefore = attacker.active.hp;
    attacker.active.hp = Math.max(0, attacker.active.hp - counterDamage);
    attacker.active.tookDamageThisTurn = true;
    emitGameEvent(state, {
      kind: "damage",
      visibility: "public",
      actorSide: defenderId,
      targetSide: attackerId,
      targetUid: attacker.active.uid,
      amount: attackerHpBefore - attacker.active.hp,
      hpBefore: attackerHpBefore,
      hpAfter: attacker.active.hp,
    });
    const toolName = defender.active.toolCardId ? getCard(defender.active.toolCardId).name : "Boxing Gloves";
    log(state, `${toolName} did ${counterDamage} damage to ${actorPossessive(attacker)} Attacking Umamusume.`);
  }

  if (attack.preventDamageNextTurn) {
    attacker.active.nextTurnDamageReduction = Math.max(attacker.active.nextTurnDamageReduction, attack.preventDamageNextTurn);
    log(state, `${actorPossessive(attacker)} ${formatUmamusumeCardName(attackerCard)} braced for the next attack.`);
  }
  if (attack.cannotAttackNextTurn) {
    startingActive.attackBlockedUntilOwnTurn = (state.turnsTakenBySide[attackerId] ?? 0) + 1;
    log(state, `${formatUmamusumeInstanceName(startingActive)} cannot attack during the next turn.`);
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
    if (healed > 0) {
      emitGameEvent(state, {
        kind: "heal",
        visibility: "public",
        actorSide: attackerId,
        targetSide: attackerId,
        targetUid: target.uid,
        amount: healed,
        hpBefore: before,
        hpAfter: target.hp,
      });
    }
    if (healed > 0) log(state, `${attack.name} healed ${formatUmamusumeInstanceName(target)} for ${healed} HP.`);
    if (attack.recoverSpecialConditions) recoverSpecialConditions(state, attackerId, target, attack.name);
  }
  if (attack.inflictSpecialCondition && attackTarget.hp > 0 && (!attack.inflictSpecialConditionOnHeads || coinFlipHeads)) {
    applySpecialCondition(state, defenderId, attackTarget, attack.inflictSpecialCondition);
  }
  if (attack.discardRandomOpponentHandOnHeads && coinFlipHeads) {
    const shouldUseOptionalDiscard = defender.hand.length > 0 && attacker.active.hp > attack.discardRandomOpponentHandOnHeads.selfDamage;
    if (shouldUseOptionalDiscard) {
      const randomHandIndex = Math.floor(random() * defender.hand.length);
      const [discardedCardId] = defender.hand.splice(randomHandIndex, 1);
      if (discardedCardId) {
        defender.discard.push(discardedCardId);
        emitGameEvent(state, {
          kind: "cardMovement",
          visibility: "actor",
          side: defenderId,
          from: "hand",
          to: "discard",
          count: 1,
          cardIds: [discardedCardId],
        });
        attacker.active.hp = Math.max(0, attacker.active.hp - attack.discardRandomOpponentHandOnHeads.selfDamage);
        attacker.active.tookDamageThisTurn = true;
        log(state, `${attack.name} discarded 1 random card from ${actorLowerPossessive(defender)} hand.`);
        log(state, `${formatUmamusumeInstanceName(attacker.active)} took ${attack.discardRandomOpponentHandOnHeads.selfDamage} damage.`);
      }
    }
  }
  if (attack.benchDamage && attack.benchDamage > 0) {
    defender.bench.forEach((benchedUmamusume) => {
      const hpBefore = benchedUmamusume.hp;
      benchedUmamusume.hp = Math.max(0, benchedUmamusume.hp - attack.benchDamage!);
      benchedUmamusume.tookDamageThisTurn = true;
      if (hpBefore !== benchedUmamusume.hp) {
        emitGameEvent(state, {
          kind: "damage",
          visibility: "public",
          actorSide: attackerId,
          targetSide: defenderId,
          targetUid: benchedUmamusume.uid,
          amount: hpBefore - benchedUmamusume.hp,
          hpBefore,
          hpAfter: benchedUmamusume.hp,
        });
      }
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
      const before = { ...attackingActive.energies };
      attackingActive.energies[energyType] = Math.max(0, attackingActive.energies[energyType] - (amount || 0));
      emitEnergyChanges(state, attackerId, attackingActive.uid, before, attackingActive.energies);
      if (amount) log(state, `${actorName(attacker)} discarded ${amount} ${energyLabel(energyType)}.`);
    });
  }
  if (attack.evolveFromHandOrDeck && attacker.active) {
    evolveActiveFromHandOrDeck(state, attacker, evolutionHandCardIndex, evolutionDeckCardIndex);
  } else if (attack.evolveFromDeck && attacker.active) {
    evolveActiveFromDeck(state, attacker, evolutionDeckCardIndex);
  }
  const shouldShuffleSelfIntoDeck = useShuffleSelfIntoDeck ?? !state.humanBySide[attackerId];
  if (attack.shuffleSelfIntoDeck && attacker.active && shouldShuffleSelfIntoDeck) {
    shuffleActiveIntoDeckIfPaid(state, attacker, attack.shuffleSelfIntoDeck, deps);
  }
  if (attack.shuffleRandomDiscardIntoDeck) {
    shuffleRandomDiscardIntoDeck(state, attacker, attack.name, randomDiscardIndex, random);
  }

  resolveKnockout(state, attackerId, defenderId, deps, `${formatUmamusumeCardName(attackerCard)}'s ${attack.name}`);
  defender.bench
    .filter((umamusume) => umamusume.hp <= 0)
    .forEach((umamusume) => {
      if (knockOutUmamusume(state, attackerId, defenderId, umamusume, deps.choosePreferredActiveIndex, `${formatUmamusumeCardName(attackerCard)}'s ${attack.name}`)) {
        if (!state.gameOver) deps.refreshContinuousEffects(state);
      }
    });
  if (switchTarget && attacker.active && attacker.active.uid === startingActive.uid && attacker.active.hp > 0) {
    const switchIndex = attacker.bench.findIndex((umamusume) => umamusume.uid === switchTarget.uid);
    if (switchIndex >= 0) {
      const promoted = attacker.bench.splice(switchIndex, 1)[0];
      if (promoted) {
        const clearedConditions = [...attacker.active.specialConditions];
        clearSpecialConditions(attacker.active);
        emitStatusChanges(state, attackerId, attacker.active.uid, clearedConditions, []);
        attacker.bench.push(attacker.active);
        attacker.active = promoted;
        log(state, `${actorName(attacker)} switched to ${formatUmamusumeInstanceName(promoted)}.`);
        deps.refreshContinuousEffects(state);
      }
    }
  }
  const preserveAttackerWin = shouldPreserveAttackerWinOnSimultaneousKo(state, attackerId, defenderId, pointsBeforeAttack);
  if (preserveAttackerWin && !state.gameOver) {
    state.gameOver = true;
    state.winner = attackerId;
    state.currentSide = "done";
    log(state, `${actorName(attacker)} reached 3 points`);
  }
  if (!state.gameOver && !preserveAttackerWin && attacker.active && attacker.active.hp <= 0) {
    if (knockOutUmamusume(state, defenderId, attackerId, attacker.active, deps.choosePreferredActiveIndex, "Boxing Gloves")) {
      if (
        state.pendingPlayerChoice
        && state.pendingPlayerChoice.kind === "promoteAfterKnockout"
        && state.pendingPlayerChoice.sideId === attackerId
      ) {
        state.pendingPlayerChoice.resume = "finishOpponentTurn";
      }
      deps.refreshContinuousEffects(state);
    }
  }
}

function shuffleRandomDiscardIntoDeck(state: GameState, side: SideState, attackName: string, randomDiscardIndex: number | undefined, random: RandomSource): void {
  if (side.discard.length === 0) return;
  const discardIndex = randomDiscardIndex !== undefined && randomDiscardIndex >= 0 && randomDiscardIndex < side.discard.length
    ? randomDiscardIndex
    : Math.floor(random() * side.discard.length);
  const [cardId] = side.discard.splice(discardIndex, 1);
  if (!cardId) return;
  side.deck = shuffle([...side.deck, cardId], random);
  emitCardMovement(state, side.id, "discard", "deck", 1, [cardId]);
  log(state, `${attackName} shuffled ${formatCardName(getCard(cardId))} from ${actorPossessive(side)} discard pile into the deck.`);
}

function evolveActiveFromDeck(state: GameState, side: SideState, evolutionDeckCardIndex?: number): void {
  const active = side.active;
  if (!active) return;
  const isActiveEvolution = (cardId: string) => {
    if (!cardId) return false;
    const card = getCard(cardId);
    return card.kind === "umamusume" && card.evolvesFrom === active.species && card.stage === active.stage + 1;
  };
  const deckIndex = evolutionDeckCardIndex !== undefined && isActiveEvolution(side.deck[evolutionDeckCardIndex] ?? "")
    ? evolutionDeckCardIndex
    : side.deck.findIndex(isActiveEvolution);
  if (deckIndex < 0) return;
  const [cardId] = side.deck.splice(deckIndex, 1);
  if (!cardId) return;
  const evolutionCard = getCard(cardId);
  if (evolutionCard.kind !== "umamusume") return;
  emitCardMovement(state, side.id, "deck", "play", 1, [cardId]);
  evolveUmamusume(state, side, active, evolutionCard);
}

function evolveActiveFromHandOrDeck(state: GameState, side: SideState, evolutionHandCardIndex?: number, evolutionDeckCardIndex?: number): void {
  const active = side.active;
  if (!active) return;
  const isActiveEvolution = (cardId: string) => {
    const card = getCard(cardId);
    return card.kind === "umamusume" && card.evolvesFrom === active.species && card.stage === active.stage + 1;
  };
  const handIndex = evolutionHandCardIndex !== undefined && isActiveEvolution(side.hand[evolutionHandCardIndex] ?? "")
    ? evolutionHandCardIndex
    : -1;
  if (handIndex >= 0) {
    const [cardId] = side.hand.splice(handIndex, 1);
    if (!cardId) return;
    const card = getCard(cardId);
    if (card.kind !== "umamusume") return;
    emitCardMovement(state, side.id, "hand", "play", 1, [cardId]);
    evolveUmamusume(state, side, active, card);
    return;
  }
  evolveActiveFromDeck(state, side, evolutionDeckCardIndex);
}

function shuffleActiveIntoDeckIfPaid(
  state: GameState,
  side: SideState,
  effect: NonNullable<ReturnType<typeof getPrimaryAttack>["shuffleSelfIntoDeck"]>,
  deps: CombatDeps,
): void {
  const active = side.active;
  if (!active) return;
  if (effect.requiresBench && side.bench.length === 0) return;
  const canPay = Object.entries(effect.discardEnergy).every(([type, amount]) => active.energies[type as EnergyType] >= (amount ?? 0));
  if (!canPay) return;

  Object.entries(effect.discardEnergy).forEach(([type, amount]) => {
    const energyType = type as EnergyType;
    const before = { ...active.energies };
    active.energies[energyType] = Math.max(0, active.energies[energyType] - (amount ?? 0));
    emitEnergyChanges(state, side.id, active.uid, before, active.energies);
    if (amount) log(state, `${actorName(side)} discarded ${amount} ${energyLabel(energyType)}.`);
  });

  const shuffledCardIds = [...(active.evolutionCardIds ?? []), active.cardId, ...(active.toolCardId ? [active.toolCardId] : [])];
  side.active = null;
  side.deck = shuffle([...side.deck, ...shuffledCardIds], deps.random);
  if (shuffledCardIds.length > 0) emitCardMovement(state, side.id, "play", "deck", shuffledCardIds.length, shuffledCardIds);

  const promotedIndex = deps.choosePreferredActiveIndex(side);
  const promoted = promotedIndex >= 0 ? side.bench.splice(promotedIndex, 1)[0] : side.bench.shift();
  if (promoted) {
    side.active = promoted;
    log(state, `${actorName(side)} shuffled ${formatCardNameList(shuffledCardIds)} into the deck and promoted ${formatUmamusumeInstanceName(promoted)}.`);
  }
}

function recoverSpecialConditions(state: GameState, side: SideId, umamusume: UmamusumeInstance, sourceName: string): void {
  if (umamusume.specialConditions.length === 0) return;
  const clearedConditions = [...umamusume.specialConditions];
  clearSpecialConditions(umamusume);
  emitStatusChanges(state, side, umamusume.uid, clearedConditions, []);
  log(state, `${sourceName} cleared all Special Conditions from ${formatUmamusumeInstanceName(umamusume)}.`);
}

function applySpecialCondition(
  state: GameState,
  affectedSideId: SideId,
  umamusume: UmamusumeInstance,
  condition: "asleep" | "burned" | "frozen" | "paralysed" | "poisoned",
): void {
  if (umamusume.specialConditions.length === 1 && umamusume.specialConditions[0] === condition) return;
  // Rule: a Umamusume can only have one Special Condition at a time.
  const beforeConditions = [...umamusume.specialConditions];
  umamusume.specialConditions = [condition];
  emitStatusChanges(state, affectedSideId, umamusume.uid, beforeConditions, umamusume.specialConditions);
  if (condition === "paralysed") {
    umamusume.paralysedUntilOwnTurn = (state.turnsTakenBySide[affectedSideId] ?? 0) + 1;
    log(state, `${formatUmamusumeInstanceName(umamusume)} is Paralysed and cannot attack or retreat until the end of ${affectedSideId === "player" ? "your" : "opponent's"} next turn.`);
    return;
  }
  umamusume.paralysedUntilOwnTurn = null;
  log(state, `${formatUmamusumeInstanceName(umamusume)} is ${condition}.`);
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
  defender.discard.push(...(knockedOut.evolutionCardIds ?? []));
  if (knockedOut.toolCardId) {
    defender.discard.push(knockedOut.toolCardId);
    emitGameEvent(state, {
      kind: "tool",
      visibility: "public",
      side: knockedSideId,
      targetUid: knockedOut.uid,
      toolCardId: knockedOut.toolCardId,
      action: "discard",
    });
  }
  const discardedCardIds = [knockedOut.cardId, ...(knockedOut.evolutionCardIds ?? []), ...(knockedOut.toolCardId ? [knockedOut.toolCardId] : [])];
  if (discardedCardIds.length > 0) emitCardMovement(state, knockedSideId, "play", "discard", discardedCardIds.length, discardedCardIds);
  const pointsAwarded = Math.min(isExCard(knockedCard) ? 2 : 1, MAX_POINTS - attacker.points);
  attacker.points += pointsAwarded;
  emitGameEvent(state, {
    kind: "knockout",
    visibility: "public",
    scoringSide: scoringSideId,
    knockedSide: knockedSideId,
    targetUid: knockedOut.uid,
    cardId: knockedOut.cardId,
    pointsAwarded,
    points: attacker.points,
    ...(cause ? { cause } : {}),
  });
  emitGameEvent(state, {
    kind: "score",
    visibility: "public",
    side: scoringSideId,
    points: attacker.points,
  });
  const knockedOwner = knockedSideId === "player" ? "Your" : "Opponent's";
  const sourceOwner = scoringSideId === "player" ? "your" : "opponent's";
  const causeSuffix = cause ? ` by ${sourceOwner} ${cause}` : "";
  log(state, `${knockedOwner} ${formatUmamusumeCardName(knockedCard)} was knocked out${causeSuffix}. ${actorName(attacker)} scored ${pointsAwarded} ${pluralize(pointsAwarded, "point")}.`);

  if (attacker.points >= MAX_POINTS) {
    state.gameOver = true;
    state.winner = scoringSideId;
    state.currentSide = "done";
    emitGameEvent(state, { kind: "gameEnd", visibility: "public", winner: scoringSideId, reason: "points" });
    log(state, `${actorName(attacker)} reached 3 points`);
    return true;
  }

  if (!defender.active && defender.bench.length === 0) {
    state.gameOver = true;
    state.winner = scoringSideId;
    state.currentSide = "done";
    emitGameEvent(state, { kind: "gameEnd", visibility: "public", winner: scoringSideId, reason: "noBench" });
    log(state, `${actorName(defender)} had no benched Umamusume.`);
    return true;
  }

  if (!activeKnockout) return true;

  const shouldAdvanceTurnAfterChoice = knockedSideId !== state.currentSide;
  state.pendingPlayerChoice = {
    kind: "promoteAfterKnockout",
    sideId: knockedSideId,
    resume: shouldAdvanceTurnAfterChoice ? "finishOpponentTurn" : "none",
  };
  log(state, `${actorName(defender)} must choose the next Active Umamusume.`);
  return true;
}

function attackDamageReductionFor(state: GameState, umamusume: UmamusumeInstance): number {
  const ownerSideId: SideId = state.sides.player.active?.uid === umamusume.uid || state.sides.player.bench.some((entry) => entry.uid === umamusume.uid) ? "player" : "opponent";
  return (getUmamusumeAbility(state, ownerSideId, umamusume)?.damageReduction ?? 0) + umamusume.nextTurnDamageReduction + activeToolDamageReduction(state, umamusume);
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
    && !attack.damagePerUmamusumeInPlay
    && !attack.attackDamageBonusIfToolAttached
    && !attack.attackDamageBonusIfDiscardHandCard
    && !attack.switchSelfAfterAttack?.bonusDamage;
}

function resolveSwitchTarget(
  state: GameState,
  attacker: SideState,
  attackerId: SideId,
  switchTargetUid: number | undefined,
  switchEffect: ReturnType<typeof getPrimaryAttack>["switchSelfAfterAttack"],
  choosePreferredActiveIndex: (side: SideState) => number,
): UmamusumeInstance | null {
  if (!switchEffect) return null;
  if (switchTargetUid !== undefined) {
    return attacker.bench.find((umamusume) => umamusume.uid === switchTargetUid) ?? null;
  }
  if (state.humanBySide[attackerId] || attacker.bench.length === 0) return null;
  const preferredIndex = choosePreferredActiveIndex(attacker);
  return preferredIndex >= 0 ? attacker.bench[preferredIndex] ?? null : attacker.bench[0] ?? null;
}

function flipCoin(side: SideState, forcedCoinResults: CoinFlipResult[], random: RandomSource): CoinFlipResult {
  if ((side.guaranteedCoinFlipHeads ?? 0) > 0) {
    side.guaranteedCoinFlipHeads -= 1;
    if (forcedCoinResults.length > 0) forcedCoinResults.shift();
    return "heads";
  }
  return forcedCoinResults.shift() ?? (random() >= 0.5 ? "heads" : "tails");
}

function formatCoinFlipResultLog(results: CoinFlipResult[]): string {
  const heads = results.filter((result) => result === "heads").length;
  const tails = results.length - heads;
  if (results.length === 1) return `Flip a coin and got 1x ${results[0]}.`;
  return `Flip ${results.length} coins and got ${heads}x heads, ${tails}x tails.`;
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
