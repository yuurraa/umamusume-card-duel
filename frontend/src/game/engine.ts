import {
  MAX_BENCH,
  playerDeckList,
  opponentDeckList,
} from "../../../shared/src/gameData";
import type {
  EnergyType,
  GameState,
  UmamusumeInstance,
  SideId,
  SideState,
} from "../../../shared/src/types";
import { cloneGame } from "./engine/core/stateClone";
import { getCard, getUmamusumeCard, getPrimaryAttack, isBasicUmamusumeInDeck, isUmamusumeInDeck } from "./engine/core/catalog";
import {
  energyLabel,
  formatUmamusumeCardName,
  formatUmamusumeInstanceName,
} from "./engine/core/labels";
import { attachedEnergyCount, findOwnUmamusumeByUid, getAllUmamusume, getDamagedUmamusume } from "./engine/core/umamusume";
import { log } from "./engine/core/log";
import { getEvolutionTargets, isValidEvolutionTarget } from "./engine/flow/evolution";
import { attachEnergy, getAbilityMoveEnergyTypes } from "./engine/flow/energy";
import { effectiveRetreatCost, getDisplayedRetreatCost, payRetreatCost, payRetreatCostBySelection } from "./engine/flow/retreat";
import { buildOpeningSide, createUmamusume, resetUmamusumeIdCounter } from "./engine/flow/setup";
import { canAttachEnergy, canAttachEnergyToUmamusume, canAttack, canRetreat, canUseUmamusumeAbility, isPlayerTurn } from "./engine/flow/eligibility";
import { endTurn, startTurn } from "./engine/flow/turn";
import type { PlayChoices } from "./engine/core/playTypes";
import { choosePreferredActiveIndex, normalizeBoardState, refreshContinuousHp, switchOutOpponentActive } from "./engine/flow/board";
import { adjustHandChoices, getPlayableAction, resolveCardPlay } from "./engine/flow/playRules";
import { aiAttachOneEnergy, aiEvolveOne, aiPlayOneBasic, aiPlayOneTrainer } from "./engine/flow/ai";
import { knockOutUmamusume, performAttack } from "./engine/flow/combat";

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
  isPlayerTurn,
  getPlayableAction,
};

export function createGame(playerDeck = playerDeckList, opponentDeck = opponentDeckList, opponentName = "Opponent"): GameState {
  resetUmamusumeIdCounter();
  const firstPlayer = Math.random() >= 0.5 ? "player" : "opponent";
  const coinFlipResult = firstPlayer === "player" ? "heads" : "tails";
  const playerOpening = buildOpeningSide("player", "You", playerDeck, false);
  const opponentOpening = buildOpeningSide("opponent", opponentName, opponentDeck, true);

  const state: GameState = {
    phase: "setup",
    setup: {
      coinFlipResult,
      opponentReady: true,
      opponentRevealed: false,
    },
    pendingPlayerChoice: null,
    sides: {
      player: playerOpening,
      opponent: opponentOpening,
    },
    currentSide: firstPlayer,
    opponentTurnStep: null,
    stadium: null,
    turnNumber: 1,
    firstPlayer,
    gameOver: false,
    winner: null,
    log: [],
  };

  log(state, `Coin flip was ${coinFlipResult}. ${firstPlayer === "player" ? "You are going first." : "Opponent is going first."}`);
  return state;
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

export function playerAttack(state: GameState, healTargetUid?: number): GameState {
  const next = cloneGame(state);
  if (!canAttack(next, next.sides.player)) return next;
  performAttack(next, "player", { refreshContinuousEffects, choosePreferredActiveIndex }, healTargetUid);
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

export function playerSurrender(state: GameState): GameState {
  const next = cloneGame(state);
  if (next.phase !== "play" || next.gameOver) return next;
  next.pendingPlayerChoice = null;
  next.opponentTurnStep = null;
  next.gameOver = true;
  next.winner = "opponent";
  next.currentSide = "done";
  log(next, "You surrendered. Opponent won.");
  return next;
}

export function advanceOpponentTurnStep(state: GameState): GameState {
  const next = cloneGame(state);
  if (next.phase !== "play" || next.pendingPlayerChoice || next.gameOver || next.currentSide !== "opponent") return next;
  const opponent = next.sides.opponent;
  if (!opponent.active) return next;

  for (let transitions = 0; transitions < 8; transitions += 1) {
    const step = next.opponentTurnStep ?? "bench";

    if (step === "bench") {
      if (aiPlayOneBasic(next, opponent)) return next;
      next.opponentTurnStep = "trainerBefore";
      continue;
    }

    if (step === "trainerBefore") {
      if (aiPlayOneTrainer(next, opponent, "resumeOpponentAfterFirstTrainerPass", { refreshContinuousEffects, switchOutOpponentActive })) return next;
      next.opponentTurnStep = "evolve";
      continue;
    }

    if (step === "evolve") {
      if (aiEvolveOne(next, opponent)) {
        refreshContinuousEffects(next);
        return next;
      }
      next.opponentTurnStep = "attach";
      continue;
    }

    if (step === "attach") {
      if (aiAttachOneEnergy(next, opponent)) return next;
      next.opponentTurnStep = "trainerAfter";
      continue;
    }

    if (step === "trainerAfter") {
      if (aiPlayOneTrainer(next, opponent, "resumeOpponentAfterSecondTrainerPass", { refreshContinuousEffects, switchOutOpponentActive })) return next;
      next.opponentTurnStep = "attack";
      continue;
    }

    if (step === "attack") {
      refreshContinuousEffects(next);
      if (canAttack(next, opponent)) {
        performAttack(next, "opponent", { refreshContinuousEffects, choosePreferredActiveIndex });
        if (next.pendingPlayerChoice) {
          next.opponentTurnStep = "finish";
          return next;
        }
      } else {
        log(next, "Opponent did not attack.");
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

export function usePlayerAbility(state: GameState, abilityUmamusumeUid: number, sourceUmamusumeUid: number, selectedEnergyType?: EnergyType): GameState {
  const next = cloneGame(state);
  const side = next.sides.player;
  if (!canUseUmamusumeAbility(next, side, abilityUmamusumeUid) || !side.active) return next;
  const abilityUmamusume = findOwnUmamusumeByUid(side, abilityUmamusumeUid);
  if (!abilityUmamusume) return next;
  const abilityCard = getUmamusumeCard(abilityUmamusume);
  const ability = abilityCard.ability;
  const energyTypes = getAbilityMoveEnergyTypes(ability);
  const source = side.bench.find((umamusume) => umamusume.uid === sourceUmamusumeUid && energyTypes.some((energyType) => umamusume.energies[energyType] > 0));
  if (!source) return next;
  const availableEnergyTypes = energyTypes.filter((type) => source.energies[type] > 0);
  const energyType = selectedEnergyType
    ? availableEnergyTypes.includes(selectedEnergyType) ? selectedEnergyType : undefined
    : availableEnergyTypes.length === 1 ? availableEnergyTypes[0] : undefined;
  if (!ability || !energyType) return next;
  source.energies[energyType] -= 1;
  side.active.energies[energyType] += 1;
  abilityUmamusume.usedAbilityThisTurn = true;
  side.usedAbilityNamesThisTurn ??= [];
  if (!side.usedAbilityNamesThisTurn.includes(ability.name)) side.usedAbilityNamesThisTurn.push(ability.name);
  log(next, `${formatUmamusumeCardName(abilityCard)}'s ${ability.name} moved 1 ${energyLabel(energyType)} to the active spot.`);
  return next;
}

export function completePregameSetup(state: GameState, activeHandIndex: number, benchHandIndexes: number[]): GameState {
  const next = cloneGame(state);
  if (next.phase !== "setup") return next;
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

  next.phase = "play";
  next.setup = next.setup ? { ...next.setup, opponentRevealed: true } : null;
  next.pendingPlayerChoice = null;

  startTurn(next, next.firstPlayer, refreshContinuousEffects, true);
  return next;
}

export function resolvePendingPlayerChoice(state: GameState, umamusumeUid: number): GameState {
  const next = cloneGame(state);
  const pending = next.pendingPlayerChoice;
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


