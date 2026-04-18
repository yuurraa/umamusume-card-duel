import { MAX_BENCH, MAX_HAND } from "../../../../../shared/src/gameData";
import type { Card, GameState, PlayAction, SideState, UmamusumeCard, UmamusumeInstance } from "../../../../../shared/src/types";
import { getCard } from "../core/catalog";
import { evolveUmamusume, findEvolutionTarget, isValidEvolutionTarget } from "./evolution";
import { actorName, formatCardName, formatUmamusumeCardName, formatUmamusumeInstanceName } from "../core/labels";
import { log, logPrimaryFirst } from "../core/log";
import { findOwnUmamusumeByUid, getAllUmamusume } from "../core/umamusume";
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
    if (card.trainerType === "tool") {
      const target = getToolTargets(side)[0];
      if (!target) return { canPlay: false, reason: "No Umamusume can hold another Tool." };
      return { canPlay: true, type: "attachTool", target };
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
    if (card.effect.randomBasicUmamusumeFromDiscard && !hasBasicUmamusumeInDiscard(side)) {
      return { canPlay: false, reason: "You need a Basic Umamusume in discard." };
    }
    if (card.effect.randomBasicUmamusumeFromDiscard && side.hand.length >= MAX_HAND) {
      return { canPlay: false, reason: "Your hand is full." };
    }
    if (card.effect.rainbowUncapCrystal && !getRainbowUncapTargets(state, side).length) {
      return { canPlay: false, reason: "No Basic Umamusume can skip to Stage 2." };
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
  const adjusted: PlayChoices = { ...choices };
  if (adjusted.discardHandIndex !== undefined) {
    if (adjusted.discardHandIndex === handIndex) {
      delete adjusted.discardHandIndex;
    } else if (adjusted.discardHandIndex > handIndex) {
      adjusted.discardHandIndex -= 1;
    }
  }
  if (adjusted.rainbowEvolutionHandIndex !== undefined) {
    if (adjusted.rainbowEvolutionHandIndex === handIndex) {
      delete adjusted.rainbowEvolutionHandIndex;
    } else if (adjusted.rainbowEvolutionHandIndex > handIndex) {
      adjusted.rainbowEvolutionHandIndex -= 1;
    }
  }
  return adjusted;
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
  } else if (play.type === "attachTool" && card.kind === "trainer") {
    const chosenTarget = choices.umamusumeTargetUid !== undefined ? findOwnUmamusumeByUid(side, choices.umamusumeTargetUid) : undefined;
    const target = chosenTarget && !chosenTarget.toolCardId ? chosenTarget : play.target;
    if (!target || target.toolCardId) return;
    target.toolCardId = card.id;
    log(state, `${actorName(side)} attached ${card.name} to ${formatUmamusumeInstanceName(target)}.`);
  } else if (play.type === "trainer" && card.kind === "trainer") {
    if (card.trainerType === "stadium") {
      playStadium(state, side, card);
      return;
    }
    logPrimaryFirst(state, `${actorName(side)} played ${card.name}.`, () => {
      if (card.effect.rainbowUncapCrystal) {
        useRainbowUncapCrystal(state, side, choices.umamusumeTargetUid, choices.rainbowEvolutionHandIndex);
      } else {
        applyTrainer(state, side, card, choices, switchOutOpponentActive);
      }
      if (card.trainerType === "supporter") side.usedSupporterThisTurn = true;
      side.discard.push(card.id);
    });
  }
}

export function getToolTargets(side: SideState) {
  return getAllUmamusume(side).filter((umamusume) => !umamusume.toolCardId);
}

export function getRainbowUncapTargets(state: GameState, side: SideState) {
  return getAllUmamusume(side).filter((umamusume) => {
    if (isSideFirstTurn(state, side.id)) return false;
    if (umamusume.stage !== 0) return false;
    if (umamusume.enteredTurn === state.turnNumber) return false;
    return getRainbowUncapEvolutionHandOptions(side, umamusume).length > 0;
  });
}

export function getRainbowUncapEvolutionHandOptions(side: SideState, umamusume: UmamusumeInstance): { handIndex: number; card: UmamusumeCard }[] {
  return side.hand.flatMap((cardId, handIndex) => {
    const candidate = getCard(cardId);
    return candidate.kind === "umamusume" && candidate.stage === 2 && candidate.evolvesFrom === umamusume.species
      ? [{ handIndex, card: candidate }]
      : [];
  });
}

export function useRainbowUncapCrystal(state: GameState, side: SideState, targetUid?: number, evolutionHandIndex?: number): boolean {
  const targets = getRainbowUncapTargets(state, side);
  const target = targetUid !== undefined ? targets.find((umamusume) => umamusume.uid === targetUid) : targets[0];
  if (!target) return false;
  const evolutionOptions = getRainbowUncapEvolutionHandOptions(side, target);
  const evolutionOption = evolutionHandIndex !== undefined
    ? evolutionOptions.find((option) => option.handIndex === evolutionHandIndex)
    : evolutionOptions[0];
  if (!evolutionOption) return false;
  const { card: evolutionCard, handIndex: evolutionIndex } = evolutionOption;
  side.hand.splice(evolutionIndex, 1);
  evolveUmamusume(state, side, target, evolutionCard);
  log(state, `${formatCardName(evolutionCard)} skipped Stage 1 with Rainbow Uncap Crystal.`);
  return true;
}

function hasBasicUmamusumeInDiscard(side: SideState): boolean {
  return side.discard.some((cardId) => {
    const card = getCard(cardId);
    return card.kind === "umamusume" && card.stage === 0;
  });
}

function isSideFirstTurn(state: GameState, sideId: SideState["id"]): boolean {
  if (sideId === state.firstPlayer) return state.turnNumber === 1;
  return state.firstPlayer === "player" ? state.turnNumber === 1 : state.turnNumber === 2;
}
