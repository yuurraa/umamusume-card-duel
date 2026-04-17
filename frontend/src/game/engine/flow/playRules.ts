import { MAX_BENCH } from "../../../../../shared/src/gameData";
import type { Card, GameState, PlayAction, SideState } from "../../../../../shared/src/types";
import { getCard } from "../core/catalog";
import { evolveUmamusume, findEvolutionTarget, isValidEvolutionTarget } from "./evolution";
import { actorName, formatUmamusumeCardName } from "../core/labels";
import { log } from "../core/log";
import { findOwnUmamusumeByUid } from "../core/umamusume";
import { createUmamusume } from "./setup";
import { applyTrainer, playStadium } from "./trainers";
import type { PlayChoices } from "../core/playTypes";
import type { SwitchAfterGustResume } from "./trainers";

export function getPlayableAction(state: GameState, side: SideState, cardId: string): PlayAction {
  const card = getCard(cardId);
  if (card.kind === "trainer") {
    if (card.trainerType === "supporter" && side.usedSupporterThisTurn) {
      return { canPlay: false, reason: "You already used a Supporter this turn." };
    }
    if (card.trainerType === "stadium" && state.stadium) {
      const activeStadium = getCard(state.stadium.cardId);
      if (activeStadium.name === card.name) return { canPlay: false, reason: "That Stadium is already in play." };
    }
    if (card.effect.discardOtherCard && side.hand.length < 2) {
      return { canPlay: false, reason: "You need another card to discard." };
    }
    if (card.effect.attachEnergyFromZoneToBench && side.bench.length === 0) {
      return { canPlay: false, reason: "You need a benched Umamusume." };
    }
    return { canPlay: true, type: "trainer" };
  }
  if (card.stage === 0) {
    if (side.bench.length >= MAX_BENCH) return { canPlay: false, reason: "Bench is full." };
    return { canPlay: true, type: "benchBasic" };
  }
  const target = findEvolutionTarget(state, side, card);
  if (!target) return { canPlay: false, reason: "No eligible evolution target." };
  return { canPlay: true, type: "evolve", target };
}

export function adjustHandChoices(choices: PlayChoices, handIndex: number): PlayChoices {
  if (choices.discardHandIndex === undefined) return choices;
  if (choices.discardHandIndex === handIndex) {
    const { discardHandIndex: _discardHandIndex, ...rest } = choices;
    return rest;
  }
  return {
    ...choices,
    discardHandIndex: choices.discardHandIndex > handIndex ? choices.discardHandIndex - 1 : choices.discardHandIndex,
  };
}

export function resolveCardPlay(
  state: GameState,
  side: SideState,
  card: Card,
  play: PlayAction,
  choices: PlayChoices,
  switchOutOpponentActive: (state: GameState, actingSideId: SideState["id"], pendingChoiceResume?: SwitchAfterGustResume) => void,
): void {
  if (!play.canPlay) return;
  if (play.type === "benchBasic" && card.kind === "umamusume") {
    side.bench.push(createUmamusume(card.id, state.turnNumber));
    log(state, `${actorName(side)} benched ${formatUmamusumeCardName(card)}.`);
  } else if (play.type === "evolve" && card.kind === "umamusume") {
    const chosenTarget = choices.umamusumeTargetUid !== undefined ? findOwnUmamusumeByUid(side, choices.umamusumeTargetUid) : undefined;
    if (choices.umamusumeTargetUid !== undefined && (!chosenTarget || !isValidEvolutionTarget(state, side, chosenTarget, card))) return;
    const target = chosenTarget ?? play.target;
    evolveUmamusume(state, side, target, card);
  } else if (play.type === "trainer" && card.kind === "trainer") {
    if (card.trainerType === "stadium") {
      playStadium(state, side, card);
      return;
    }
    applyTrainer(state, side, card, choices, switchOutOpponentActive);
    if (card.trainerType === "supporter") side.usedSupporterThisTurn = true;
    side.discard.push(card.id);
    log(state, `${actorName(side)} played ${card.name}.`);
  }
}
