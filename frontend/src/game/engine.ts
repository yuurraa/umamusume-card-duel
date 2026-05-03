import {
  MAX_BENCH,
  aiPremadeDecks,
  premadeDecks,
  playerDeckList,
  opponentDeckList,
} from "../../../shared/src/gameData";
import type {
  AiDeckStyle,
  AiDifficulty,
  CoinFlipResult,
  EnergyType,
  GameState,
  UmamusumeInstance,
  SideId,
  SideState,
} from "../../../shared/src/types";
import { cloneGame } from "./engine/core/stateClone";
import { getCard, getUmamusumeCard, getPrimaryAttack, isBasicUmamusumeInDeck, isUmamusumeInDeck } from "./engine/core/catalog";
import {
  actorLowerPossessive,
  actorName,
  energyLabel,
  formatUmamusumeCardName,
  formatUmamusumeInstanceName,
  pluralize,
} from "./engine/core/labels";
import { attachedEnergyCount, findOwnUmamusumeByUid, getAllUmamusume, getDamagedUmamusume } from "./engine/core/umamusume";
import { log } from "./engine/core/log";
import { getEvolutionTargets, isValidEvolutionTarget } from "./engine/flow/evolution";
import { attachEnergy, getAbilityMoveEnergyTypes } from "./engine/flow/energy";
import { effectiveRetreatCost, getDisplayedRetreatCost, payRetreatCost, payRetreatCostBySelection } from "./engine/flow/retreat";
import { buildOpeningSide, createUmamusume, resetUmamusumeIdCounter } from "./engine/flow/setup";
import { canAttachEnergy, canAttachEnergyToUmamusume, canAttack, canRetreat, canUseUmamusumeAbility, isPlayerTurn } from "./engine/flow/eligibility";
import { drawCards, endTurn, startTurn } from "./engine/flow/turn";
import type { PlayChoices } from "./engine/core/playTypes";
import { choosePreferredActiveIndex, normalizeBoardState, refreshContinuousHp, switchOutOpponentActive } from "./engine/flow/board";
import { adjustHandChoices, getPlayableAction, getRainbowUncapEvolutionHandOptions, getRainbowUncapTargets, getToolTargets, resolveCardPlay } from "./engine/flow/playRules";
import { aiAttachOneEnergy, aiEvolveOne, aiPlayOneBasic, aiPlayOneTrainer, aiResolveCombatDecision, aiUseOneAbility } from "./engine/flow/ai";
import { knockOutUmamusume, performAttack } from "./engine/flow/combat";
import { canUseStadium, useStadium } from "./engine/flow/trainers";

export type { PlayChoices };

export {
  cloneGame,
  getCard,
  getUmamusumeCard,
  getPrimaryAttack,
  isUmamusumeInDeck,
  isBasicUmamusumeInDeck,
  energyLabel,
  attachedEnergyCount,
  getAllUmamusume,
  getDamagedUmamusume,
  getEvolutionTargets,
  getDisplayedRetreatCost,
  canAttachEnergy,
  canAttachEnergyToUmamusume,
  canAttack,
  canRetreat,
  canUseUmamusumeAbility,
  canUseStadium,
  isPlayerTurn,
  getPlayableAction,
  getRainbowUncapEvolutionHandOptions,
  getRainbowUncapTargets,
  getToolTargets,
};

export function createGame(
  playerDeck = playerDeckList,
  opponentDeck = opponentDeckList,
  opponentName = "Opponent",
  _aiDifficulty: AiDifficulty = "hard",
  opponentIsHuman = false,
  playerName = "Guest",
  playerEnergyTypes?: EnergyType[],
  opponentEnergyTypes?: EnergyType[],
): GameState {
  resetUmamusumeIdCounter();
  const firstPlayer = Math.random() >= 0.5 ? "player" : "opponent";
  const coinFlipResult = firstPlayer === "player" ? "heads" : "tails";
  const playerOpening = buildOpeningSide("player", playerName, playerDeck, false, playerEnergyTypes);
  const opponentOpening = buildOpeningSide("opponent", opponentName, opponentDeck, !opponentIsHuman, opponentEnergyTypes);

  const state: GameState = {
    phase: "setup",
    setup: {
      coinFlipResult,
      readyBySide: {
        player: false,
        opponent: !opponentIsHuman,
      },
      opponentRevealed: false,
      countdownSecondsRemaining: null,
    },
    pendingPlayerChoice: null,
    sides: {
      player: playerOpening,
      opponent: opponentOpening,
    },
    currentSide: firstPlayer,
    opponentTurnStep: null,
    stadium: null,
    turnDeadlineMs: null,
    turnNumber: 1,
    firstPlayer,
    turnsTakenBySide: {
      player: 0,
      opponent: 0,
    },
    aiDifficulty: "hard",
    humanBySide: {
      player: true,
      opponent: opponentIsHuman,
    },
    aiDeckStyleBySide: {
      player: inferDeckStyle(playerDeck),
      opponent: inferDeckStyle(opponentDeck, opponentName),
    },
    gameOver: false,
    winner: null,
    log: [],
  };

  log(state, `Coin flip was ${coinFlipResult}. ${firstPlayer === "player" ? "You are going first." : "Opponent is going first."}`);
  return state;
}

function inferDeckStyle(deckList: string[], deckName?: string): AiDeckStyle {
  const named = normalizeDeckName(deckName);
  if (named.includes("rice shower") || named.includes("manhattan cafe")) return "blitz";
  if (named.includes("agnes digital")) return "scaleBench";
  if (named.includes("matikanetannhauser") || named.includes("mihono bourbon") || named.includes("super creek")) return "stall";

  const bestMatch = [...premadeDecks, ...aiPremadeDecks]
    .map((deck) => ({
      deckId: deck.id,
      overlap: deck.cardIds.reduce((sum, cardId) => sum + (deckList.includes(cardId) ? 1 : 0), 0),
    }))
    .sort((left, right) => right.overlap - left.overlap)[0];

  switch (bestMatch?.deckId) {
    case "riceShowerHaruUrara":
      return "blitz";
    case "agnesDigitalAgnesTachyon":
      return "scaleBench";
    case "matikanetannhauserNiceNature":
    case "mihonoBourbonNishinoFlower":
    case "superCreekNishinoFlower":
      return "stall";
    default:
      return "balanced";
  }
}

function normalizeDeckName(name: string | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

export function playHandCard(state: GameState, handIndex: number, choices: PlayChoices = {}): GameState {
  const next = cloneGame(state);
  const side = next.sides.player;
  if (!isPlayerTurn(next) || next.pendingPlayerChoice) return next;
  const cardId = side.hand[handIndex];
  if (!cardId) return next;
  const card = getCard(cardId);
  const play = getPlayableAction(next, side, cardId);
  if (!play.canPlay) return next;
  if (play.type === "evolve" && card.kind === "umamusume" && choices.umamusumeTargetUid !== undefined) {
    const chosenTarget = findOwnUmamusumeByUid(side, choices.umamusumeTargetUid);
    if (!chosenTarget || !isValidEvolutionTarget(next, side, chosenTarget, card)) return next;
  }
  if (play.type === "attachTool" && choices.umamusumeTargetUid !== undefined) {
    const chosenTarget = findOwnUmamusumeByUid(side, choices.umamusumeTargetUid);
    if (!chosenTarget || chosenTarget.toolCardId) return next;
  }
  if (card.kind === "trainer" && card.effect.rainbowUncapCrystal && choices.umamusumeTargetUid !== undefined) {
    const target = getRainbowUncapTargets(next, side).find((umamusume) => umamusume.uid === choices.umamusumeTargetUid);
    if (!target) return next;
    if (
      choices.rainbowEvolutionHandIndex !== undefined
      && !getRainbowUncapEvolutionHandOptions(side, target).some((option) => option.handIndex === choices.rainbowEvolutionHandIndex)
    ) {
      return next;
    }
  }
  side.hand.splice(handIndex, 1);
  resolveCardPlay(next, side, card, play, adjustHandChoices(choices, handIndex), switchOutOpponentActive);
  normalizeBoardState(next);
  refreshContinuousEffects(next);
  return next;
}

export function attachPlayerEnergy(state: GameState, umamusumeUid?: number): GameState {
  const next = cloneGame(state);
  const side = next.sides.player;
  if (next.pendingPlayerChoice) return next;
  const target = umamusumeUid ? findOwnUmamusumeByUid(side, umamusumeUid) : side.active;
  if (!target || !canAttachEnergyToUmamusume(next, side, target)) return next;
  attachEnergy(next, side, target);
  normalizeBoardState(next);
  return next;
}

export function playerAttack(
  state: GameState,
  attackTargetUid?: number,
  healTargetUid?: number,
  forcedCoinResult?: CoinFlipResult | CoinFlipResult[],
  evolutionDeckCardIndex?: number,
  attackIndex = 0,
  discardHandIndex?: number,
  randomDiscardIndex?: number,
): GameState {
  const next = cloneGame(state);
  if (!canAttack(next, next.sides.player)) return next;
  performAttack(next, "player", { refreshContinuousEffects, choosePreferredActiveIndex }, attackTargetUid, healTargetUid, forcedCoinResult, evolutionDeckCardIndex, attackIndex, discardHandIndex, randomDiscardIndex);
  if (next.pendingPlayerChoice) return next;
  if (!next.gameOver) advanceToNextTurn(next);
  return next;
}

export function playerEndTurn(state: GameState): GameState {
  const next = cloneGame(state);
  if (!isPlayerTurn(next) || next.pendingPlayerChoice) return next;
  advanceToNextTurn(next);
  return next;
}

export function timeoutEndTurn(state: GameState): GameState {
  if (state.phase !== "play" || state.gameOver || state.pendingPlayerChoice) return state;
  if (state.currentSide !== "player" && state.currentSide !== "opponent") return state;
  const next = cloneGame(state);
  advanceToNextTurn(next);
  return next;
}

export function playerUseStadium(state: GameState): GameState {
  const next = cloneGame(state);
  const side = next.sides.player;
  if (!canUseStadium(next, side)) return next;
  if (!useStadium(next, side)) return next;
  if (!next.gameOver) advanceToNextTurn(next);
  return next;
}

export function playerSurrender(state: GameState): GameState {
  const next = cloneGame(state);
  if (next.gameOver || next.currentSide === "done") return next;
  next.pendingPlayerChoice = null;
  next.opponentTurnStep = null;
  next.gameOver = true;
  next.winner = "opponent";
  next.currentSide = "done";
  log(next, "You surrendered. Opponent won.");
  return next;
}

export function opponentAbandonedMatch(state: GameState): GameState {
  const next = cloneGame(state);
  if (next.gameOver || next.currentSide === "done") return next;
  next.pendingPlayerChoice = null;
  next.opponentTurnStep = null;
  next.gameOver = true;
  next.winner = "player";
  next.currentSide = "done";
  next.turnDeadlineMs = null;
  log(next, "Opponent left the match. You won.");
  return next;
}

export function advanceOpponentTurnStep(state: GameState, forcedAttackCoinResult?: CoinFlipResult | CoinFlipResult[], random: () => number = Math.random): GameState {
  return advanceAiTurnStep(state, "opponent", forcedAttackCoinResult, random);
}

export function advancePlayerAiTurnStep(state: GameState, forcedAttackCoinResult?: CoinFlipResult | CoinFlipResult[], random: () => number = Math.random): GameState {
  return advanceAiTurnStep(state, "player", forcedAttackCoinResult, random);
}

function advanceAiTurnStep(
  state: GameState,
  actingSideId: SideId,
  forcedAttackCoinResult?: CoinFlipResult | CoinFlipResult[],
  random: () => number = Math.random,
): GameState {
  const next = cloneGame(state);
  if (next.phase !== "play" || next.pendingPlayerChoice || next.gameOver || next.currentSide !== actingSideId) return next;
  const actingSide = next.sides[actingSideId];
  if (!actingSide.active) return next;
  const trainerBeforeResume = actingSideId === "opponent" ? "resumeOpponentAfterFirstTrainerPass" : "none";
  const trainerAfterResume = actingSideId === "opponent" ? "resumeOpponentAfterSecondTrainerPass" : "none";

  for (let transitions = 0; transitions < 8; transitions += 1) {
    const step = next.opponentTurnStep ?? "bench";

    if (step === "bench") {
      if (aiPlayOneBasic(next, actingSide)) return next;
      next.opponentTurnStep = "trainerBefore";
      continue;
    }

    if (step === "trainerBefore") {
      if (aiPlayOneBasic(next, actingSide)) return next;
      if (aiPlayOneTrainer(next, actingSide, trainerBeforeResume, { refreshContinuousEffects, switchOutOpponentActive })) return next;
      next.opponentTurnStep = "evolve";
      continue;
    }

    if (step === "evolve") {
      if (aiEvolveOne(next, actingSide)) {
        refreshContinuousEffects(next);
        return next;
      }
      next.opponentTurnStep = "attach";
      continue;
    }

    if (step === "attach") {
      if (aiAttachOneEnergy(next, actingSide)) return next;
      next.opponentTurnStep = "trainerAfter";
      continue;
    }

    if (step === "trainerAfter") {
      if (aiPlayOneBasic(next, actingSide)) return next;
      if (aiPlayOneTrainer(next, actingSide, trainerAfterResume, { refreshContinuousEffects, switchOutOpponentActive })) return next;
      next.opponentTurnStep = "attack";
      continue;
    }

    if (step === "attack") {
      refreshContinuousEffects(next);
      if (aiUseOneAbility(next, actingSide, { refreshContinuousEffects, choosePreferredActiveIndex }, random)) return next;
      const combat = aiResolveCombatDecision(next, actingSide, forcedAttackCoinResult, { refreshContinuousEffects, choosePreferredActiveIndex }, random);
      if (!combat.resolved) return next;
      if (combat.usedAttack) {
        if (next.pendingPlayerChoice) {
          next.opponentTurnStep = "finish";
          return next;
        }
      } else if (canUseStadium(next, actingSide) && useStadium(next, actingSide)) {
        next.opponentTurnStep = null;
        if (!next.gameOver) advanceToNextTurn(next);
        return next;
      } else {
        log(next, `${actingSide.title} did not attack.`);
      }
      next.opponentTurnStep = null;
      if (!next.gameOver) advanceToNextTurn(next);
      return next;
    }

    if (step === "finish") {
      next.opponentTurnStep = null;
      if (!next.gameOver) advanceToNextTurn(next);
      return next;
    }
  }

  return next;
}

export function playerRetreat(state: GameState, benchUmamusumeUid?: number, discardEnergyTypes?: EnergyType[]): GameState {
  const next = cloneGame(state);
  const side = next.sides.player;
  if (next.pendingPlayerChoice || !side.active) return next;
  if (!canRetreat(next, side)) return next;
  const cost = effectiveRetreatCost(next, side);
  if (discardEnergyTypes) {
    if (!payRetreatCostBySelection(side.active, discardEnergyTypes, cost)) return next;
  } else {
    payRetreatCost(side.active, cost);
  }
  const targetIndex = benchUmamusumeUid ? side.bench.findIndex((umamusume) => umamusume.uid === benchUmamusumeUid) : 0;
  const promoted = targetIndex >= 0 ? side.bench.splice(targetIndex, 1)[0] : undefined;
  if (!promoted) return next;
  side.bench.push(side.active);
  side.active = promoted;
  side.usedRetreatThisTurn = true;
  normalizeBoardState(next);
  refreshContinuousEffects(next);
  log(next, `You retreated to ${formatUmamusumeInstanceName(side.active)}.`);
  return next;
}

export function usePlayerAbility(
  state: GameState,
  abilityUmamusumeUid: number,
  sourceUmamusumeUid: number,
  selectedEnergyType?: EnergyType,
  discardHandIndex?: number,
  opponentTargetUmamusumeUid?: number,
): GameState {
  const next = cloneGame(state);
  const side = next.sides.player;
  if (!canUseUmamusumeAbility(next, side, abilityUmamusumeUid)) return next;
  const abilityUmamusume = findOwnUmamusumeByUid(side, abilityUmamusumeUid);
  if (!abilityUmamusume) return next;
  const abilityCard = getUmamusumeCard(abilityUmamusume);
  const ability = abilityCard.ability;
  if (!ability) return next;

  if (ability.moveBenchedEnergyToActive) {
    if (!side.active) return next;
    const energyTypes = getAbilityMoveEnergyTypes(ability);
    const source = side.bench.find((umamusume) => umamusume.uid === sourceUmamusumeUid && energyTypes.some((energyType) => umamusume.energies[energyType] > 0));
    if (!source) return next;
    const availableEnergyTypes = energyTypes.filter((type) => source.energies[type] > 0);
    const energyType = selectedEnergyType
      ? availableEnergyTypes.includes(selectedEnergyType) ? selectedEnergyType : undefined
      : availableEnergyTypes.length === 1 ? availableEnergyTypes[0] : undefined;
    if (!energyType) return next;
    source.energies[energyType] -= 1;
    side.active.energies[energyType] += 1;
    abilityUmamusume.usedAbilityThisTurn = true;
    side.usedAbilityNamesThisTurn ??= [];
    if (!side.usedAbilityNamesThisTurn.includes(ability.name)) side.usedAbilityNamesThisTurn.push(ability.name);
    log(next, `${formatUmamusumeCardName(abilityCard)}'s ${ability.name} moved 1 ${energyLabel(energyType)} to the active spot.`);
    return next;
  }

  if (ability.coinFlipDrawOrActiveDamageCounter) {
    const active = side.active;
    if (!active) return next;
    const heads = flipCoin(side) === "heads";
    abilityUmamusume.usedAbilityThisTurn = true;
    side.usedAbilityNamesThisTurn ??= [];
    if (!side.usedAbilityNamesThisTurn.includes(ability.name)) side.usedAbilityNamesThisTurn.push(ability.name);
    log(next, `${actorName(side)} used ${formatUmamusumeCardName(abilityCard)}'s ${ability.name}.`);
    if (heads) {
      const drawnCardIds = drawCards(next, side, ability.coinFlipDrawOrActiveDamageCounter.draw);
      const drawnText = drawnCardIds.length > 0 ? formatCardNameList(drawnCardIds) : `0 ${pluralize(0, "card")}`;
      log(next, "Flip a coin and got 1x heads.");
      if (side.id === "player") {
        log(next, `${actorName(side)} drew ${drawnText}.`);
      } else {
        const drawn = drawnCardIds.length;
        log(next, `${actorName(side)} drew ${drawn} ${pluralize(drawn, "card")}.`);
      }
      return next;
    }
    const damage = ability.coinFlipDrawOrActiveDamageCounter.damageOnTails;
    active.hp = Math.max(0, active.hp - damage);
    active.tookDamageThisTurn = damage > 0;
    log(next, "Flip a coin and got 1x tails.");
    log(next, `${actorName(side)} put 1 damage counter on your Active Umamusume.`);
    if (active.hp <= 0) {
      const scoringSideId: SideId = side.id === "player" ? "opponent" : "player";
      if (knockOutUmamusume(next, scoringSideId, side.id, active, choosePreferredActiveIndex, `${formatUmamusumeCardName(abilityCard)}'s ${ability.name}`)) {
        if (!next.gameOver) refreshContinuousEffects(next);
      }
      return next;
    }
    normalizeBoardState(next);
    refreshContinuousEffects(next);
    return next;
  }

  if (ability.discardToDraw) {
    if (side.hand.length < ability.discardToDraw.discard) return next;
    const resolvedDiscardIndex = discardHandIndex !== undefined && discardHandIndex >= 0 && discardHandIndex < side.hand.length
      ? discardHandIndex
      : 0;
    const discardedCardId = side.hand.splice(resolvedDiscardIndex, 1)[0];
    if (!discardedCardId) return next;
    side.discard.push(discardedCardId);
    const drawnCardIds = drawCards(next, side, ability.discardToDraw.draw);
    const drawn = drawnCardIds.length;
    abilityUmamusume.usedAbilityThisTurn = true;
    side.usedAbilityNamesThisTurn ??= [];
    if (!side.usedAbilityNamesThisTurn.includes(ability.name)) side.usedAbilityNamesThisTurn.push(ability.name);
    if (side.id === "player") {
      const discardedCard = getCard(discardedCardId);
      const drawnText = drawn > 0 ? formatCardNameList(drawnCardIds) : `0 ${pluralize(0, "card")}`;
      log(next, `${formatUmamusumeCardName(abilityCard)}'s ${ability.name} discarded ${discardedCard.name} and drew ${drawnText}.`);
    } else {
      log(next, `${formatUmamusumeCardName(abilityCard)}'s ${ability.name} discarded 1 card and drew ${drawn} ${pluralize(drawn, "card")}.`);
    }
    return next;
  }

  if (ability.damageOpponent) {
    const opponent = next.sides.opponent;
    const target = ability.damageOpponentTarget === "any"
      ? (opponentTargetUmamusumeUid !== undefined ? getAllUmamusume(opponent).find((umamusume) => umamusume.uid === opponentTargetUmamusumeUid) : undefined) ?? opponent.active
      : opponent.active;
    if (!target) return next;
    if (ability.discardEnergy) {
      const canPayDiscard = Object.entries(ability.discardEnergy).every(([type, amount]) => abilityUmamusume.energies[type as EnergyType] >= (amount ?? 0));
      if (!canPayDiscard) return next;
    }
    target.hp = Math.max(0, target.hp - ability.damageOpponent);
    target.tookDamageThisTurn = ability.damageOpponent > 0;
    if (ability.discardEnergy) {
      Object.entries(ability.discardEnergy).forEach(([type, amount]) => {
        const energyType = type as EnergyType;
        abilityUmamusume.energies[energyType] = Math.max(0, abilityUmamusume.energies[energyType] - (amount ?? 0));
        if (amount) log(next, `${actorName(side)} discarded ${amount} ${energyLabel(energyType)}.`);
      });
    }
    abilityUmamusume.usedAbilityThisTurn = true;
    side.usedAbilityNamesThisTurn ??= [];
    if (!side.usedAbilityNamesThisTurn.includes(ability.name)) side.usedAbilityNamesThisTurn.push(ability.name);
    log(next, `${formatUmamusumeCardName(abilityCard)}'s ${ability.name} did ${ability.damageOpponent} damage to ${formatUmamusumeInstanceName(target)}.`);
    if (target.hp <= 0) {
      if (knockOutUmamusume(next, "player", "opponent", target, choosePreferredActiveIndex, `${formatUmamusumeCardName(abilityCard)}'s ${ability.name}`)) {
        if (!next.gameOver) refreshContinuousEffects(next);
      }
    }
    return next;
  }

  return next;
}

function flipCoin(side: SideState): CoinFlipResult {
  if ((side.guaranteedCoinFlipHeads ?? 0) > 0) {
    side.guaranteedCoinFlipHeads -= 1;
    return "heads";
  }
  return Math.random() >= 0.5 ? "heads" : "tails";
}

export function completePregameSetup(state: GameState, activeHandIndex: number, benchHandIndexes: number[]): GameState {
  const next = cloneGame(state);
  if (next.phase !== "setup") return next;
  const setup = next.setup;
  if (!setup || setup.readyBySide.player) return next;
  const player = next.sides.player;
  const activeCardId = player.hand[activeHandIndex];
  if (!activeCardId || !isBasicUmamusumeInDeck(activeCardId)) return next;

  const uniqueBenchIndexes = [...new Set(benchHandIndexes)]
    .filter((index) => index !== activeHandIndex)
    .filter((index) => index >= 0 && index < player.hand.length)
    .filter((index) => isBasicUmamusumeInDeck(player.hand[index] ?? ""))
    .slice(0, MAX_BENCH);

  player.active = createUmamusume(activeCardId, 0);
  player.bench = uniqueBenchIndexes.map((index) => createUmamusume(player.hand[index]!, 0));

  const taken = new Set([activeHandIndex, ...uniqueBenchIndexes]);
  player.hand = player.hand.filter((_, index) => !taken.has(index));

  setup.readyBySide.player = true;
  next.pendingPlayerChoice = null;

  if (!setup.readyBySide.opponent) {
    log(next, "Waiting for opponent to finish preparation.");
    return next;
  }

  setup.countdownSecondsRemaining = 3;
  next.setup = { ...setup, opponentRevealed: false };
  log(next, "Both players are ready. Match starts in 3...");
  return next;
}

export function tickSetupCountdown(state: GameState): GameState {
  const next = cloneGame(state);
  if (next.phase !== "setup") return next;
  const setup = next.setup;
  if (!setup || !setup.readyBySide.player || !setup.readyBySide.opponent) return next;

  const remaining = setup.countdownSecondsRemaining;
  if (remaining === null) {
    setup.countdownSecondsRemaining = 3;
    next.setup = { ...setup, opponentRevealed: false };
    return next;
  }

  if (remaining > 1) {
    setup.countdownSecondsRemaining = remaining - 1;
    next.setup = { ...setup, opponentRevealed: false };
    return next;
  }

  setup.countdownSecondsRemaining = 0;
  next.phase = "play";
  next.setup = { ...setup, opponentRevealed: true };
  startTurn(next, next.firstPlayer, refreshContinuousEffects, true);
  return next;
}

export function resolvePendingPlayerChoice(state: GameState, umamusumeUid: number): GameState {
  const next = cloneGame(state);
  const pending = next.pendingPlayerChoice;
  if (pending?.sideId !== "player") return next;
  const player = next.sides.player;
  if (!pending) return next;

  player.bench = player.bench.filter((umamusume, index, bench) => umamusume.hp > 0 && bench.findIndex((entry) => entry.uid === umamusume.uid) === index);
  const requiresPromotion = pending.kind === "promoteAfterKnockout" || !player.active || player.active.hp <= 0;

  if (requiresPromotion) {
    if (player.active && player.active.hp <= 0) player.active = null;
    const replacementIndex = player.bench.findIndex((umamusume) => umamusume.uid === umamusumeUid);
    const replacement = replacementIndex >= 0 ? player.bench.splice(replacementIndex, 1)[0] : undefined;
    if (!replacement) return next;
    player.active = replacement;
    log(next, `You promoted ${formatUmamusumeInstanceName(replacement)}.`);
  } else {
    if (!player.active) return next;
    const replacementIndex = player.bench.findIndex((umamusume) => umamusume.uid === umamusumeUid);
    const replacement = replacementIndex >= 0 ? player.bench.splice(replacementIndex, 1)[0] : undefined;
    if (!replacement) return next;
    const switchedOut = player.active;
    player.bench.push(switchedOut);
    player.active = replacement;
    log(next, `You switched to ${formatUmamusumeInstanceName(replacement)}.`);
  }

  next.pendingPlayerChoice = null;
  normalizeBoardState(next);
  refreshContinuousEffects(next);

  if (pending.resume === "finishOpponentTurn") {
    if (!next.gameOver) advanceToNextTurn(next);
    return next;
  }
  return next;
}

function advanceToNextTurn(state: GameState): void {
  state.turnDeadlineMs = null;
  endTurn(state, (turnState, sideId) => startTurn(turnState, sideId, refreshContinuousEffects));
}

function refreshContinuousEffects(state: GameState): void {
  refreshContinuousHp(state);
  resolveContinuousKnockouts(state);
}

function resolveContinuousKnockouts(state: GameState): void {
  let resolvedKnockout = true;
  while (resolvedKnockout && !state.gameOver) {
    resolvedKnockout = false;
    for (const sideId of ["player", "opponent"] as const) {
      const side = state.sides[sideId];
      const knockedOut = getAllUmamusume(side).find((umamusume) => umamusume.hp <= 0);
      if (!knockedOut) continue;
      const scoringSideId: SideId = sideId === "player" ? "opponent" : "player";
      resolvedKnockout = knockOutUmamusume(state, scoringSideId, sideId, knockedOut, choosePreferredActiveIndex);
      if (resolvedKnockout) refreshContinuousHp(state);
      break;
    }
  }
}

function formatCardNameList(cardIds: string[]): string {
  const names = cardIds.map((cardId) => getCard(cardId).name);
  if (names.length === 0) return "0 cards";
  if (names.length === 1) return names[0] ?? "1 card";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
