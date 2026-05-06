import { MAX_HAND } from "../../../../../shared/src/gameData";
import type { EnergyType, GameState, PendingPlayerChoice, SideId, SideState, TrainerCard, UmamusumeInstance } from "../../../../../shared/src/types";
import { getCard, isUmamusumeInDeck } from "../core/catalog";
import { actorLowerPossessive, actorName, actorPossessive, energyLabel, formatCardName, formatUmamusumeInstanceName, pluralize } from "../core/labels";
import { log, logPrimaryFirst } from "../core/log";
import { findMostDamagedUmamusume, findOwnUmamusumeByUid } from "../core/umamusume";
import { drawCards } from "./turn";
import { rollEnergyFromPool, shuffle } from "../core/random";
import type { PlayChoices } from "../core/playTypes";

export type SwitchAfterGustResume = Extract<PendingPlayerChoice, { kind: "switchAfterGust" }>["resume"];

type SwitchOutOpponentActiveFn = (state: GameState, actingSideId: SideId, pendingChoiceResume?: SwitchAfterGustResume) => void;

export function playStadium(state: GameState, side: SideState, stadium: TrainerCard): void {
  logPrimaryFirst(state, `${actorName(side)} played ${stadium.name}.`, () => {
    if (state.stadium) {
      const previous = state.stadium;
      const previousCard = getCard(previous.cardId);
      state.sides[previous.owner].discard.push(previous.cardId);
      log(state, `${previousCard.name} left the Stadium Spot.`);
    }
    state.stadium = { cardId: stadium.id, owner: side.id };
  });
}

export function canUseStadium(state: GameState, side: SideState): boolean {
  if (state.phase !== "play" || state.pendingPlayerChoice || state.gameOver || state.currentSide !== side.id) return false;
  if (side.usedStadiumThisTurn) return false;
  if (!state.stadium) return false;
  const stadium = getCard(state.stadium.cardId);
  if (stadium.kind !== "trainer" || stadium.trainerType !== "stadium") return false;
  return Boolean(stadium.effect.shuffleHandIntoDeckDraw && stadium.effect.shuffleHandIntoDeckDraw > 0);
}

export function useStadium(state: GameState, side: SideState): boolean {
  if (!canUseStadium(state, side) || !state.stadium) return false;
  const stadium = getCard(state.stadium.cardId);
  if (stadium.kind !== "trainer") return false;
  const drawAmount = stadium.effect.shuffleHandIntoDeckDraw ?? 0;
  if (drawAmount <= 0) return false;

  const shuffledFromHand = side.hand.length;
  side.deck = shuffle([...side.deck, ...side.hand]);
  side.hand = [];

  const drawnCardIds = drawCards(state, side, drawAmount);
  side.usedStadiumThisTurn = true;
  log(
    state,
    `${actorName(side)} used ${stadium.name}, shuffled ${shuffledFromHand} ${pluralize(shuffledFromHand, "card")} from hand into deck, and drew ${drawnCardIds.length} ${pluralize(drawnCardIds.length, "card")}. ${actorName(side)}'s turn ended.`,
  );
  return true;
}

export function applyTrainer(
  state: GameState,
  side: SideState,
  trainer: TrainerCard,
  choices: PlayChoices = {},
  switchOutOpponentActive: SwitchOutOpponentActiveFn,
  pendingChoiceResume: SwitchAfterGustResume = "none",
): void {
  const discardedCardName = trainer.effect.discardOtherCard ? discardOtherCardForScout(state, side, choices.discardHandIndex) : null;
  if (trainer.effect.retreatCostReduction) side.retreatCostReduction += trainer.effect.retreatCostReduction;
  if (trainer.effect.activeAttackDamageBonus) side.activeAttackDamageBonus += trainer.effect.activeAttackDamageBonus;
  if (trainer.effect.extraEnergyAttach) {
    side.bonusEnergyAttachments += trainer.effect.extraEnergyAttach;
    for (let count = 0; count < trainer.effect.extraEnergyAttach; count += 1) {
      side.energyZone.push(rollEnergyFromPool(side.energyPool));
    }
  }
  if (trainer.effect.attachEnergyFromZoneToBench) {
    attachEnergyFromZoneToBench(state, side, trainer, trainer.effect.attachEnergyFromZoneToBench, choices.umamusumeTargetUid);
  }
  if (trainer.effect.gustOpponent) switchOutOpponentActive(state, side.id, pendingChoiceResume);
  if (trainer.effect.heal) {
    const chosenTarget = choices.umamusumeTargetUid ? findOwnUmamusumeByUid(side, choices.umamusumeTargetUid) : undefined;
    const target = trainer.effect.healTarget === "any" && chosenTarget
      ? chosenTarget
      : trainer.effect.healTarget === "any"
        ? findMostDamagedUmamusume(side)
        : side.active;
    if (!target) return;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + trainer.effect.heal);
    const healed = target.hp - before;
    if (healed > 0) log(state, `${trainer.name} healed ${formatUmamusumeInstanceName(target)} for ${healed} HP.`);
  }
  if (trainer.effect.draw) {
    const drawnCardIds = drawCards(state, side, trainer.effect.draw);
    if (drawnCardIds.length > 0) {
      if (side.id === "player") {
        log(state, `${actorName(side)} drew ${formatCardNameList(drawnCardIds)}.`);
      } else {
        const drawn = drawnCardIds.length;
        log(state, `${actorName(side)} drew ${drawn} ${pluralize(drawn, "card")}.`);
      }
    }
  }
  if (trainer.effect.searchUmamusume) searchUmamusumeFromDeck(state, side, choices.deckCardIndex, Boolean(trainer.effect.revealSearchedCard));
  if (trainer.effect.searchEvolutionUmamusume) searchEvolutionUmamusumeFromDeck(state, side, choices.deckCardIndex, Boolean(trainer.effect.revealSearchedCard));
  if (trainer.effect.searchRandomBasicUmamusume) searchRandomBasicUmamusumeFromDeck(state, side, Boolean(trainer.effect.revealSearchedCard));
  if (trainer.effect.randomBasicUmamusumeFromDiscard) moveRandomBasicUmamusumeFromDiscardToHand(state, side);
  if (trainer.effect.discardRandomOpponentActiveEnergy) discardRandomOpponentActiveEnergy(state, side, trainer);
  if (trainer.effect.recoverActiveSpecialConditions) recoverActiveSpecialConditions(state, side, trainer);
  if (discardedCardName) {
    if (side.id === "player") {
      log(state, `${actorName(side)} discarded ${discardedCardName}.`);
    } else {
      log(state, `${actorName(side)} discarded 1 card.`);
    }
  }
}

export function hasDamagedHealingTarget(side: SideState, card: TrainerCard): boolean {
  const targets = (card.effect.healTarget === "any" ? [side.active, ...side.bench] : [side.active]).filter((umamusume): umamusume is UmamusumeInstance => Boolean(umamusume));
  return targets.some((umamusume) => umamusume.hp < umamusume.maxHp);
}

function attachEnergyFromZoneToBench(
  state: GameState,
  side: SideState,
  trainer: TrainerCard,
  count: number,
  targetUid?: number,
): void {
  if (count <= 0 || side.bench.length === 0) return;
  const target = (targetUid ? side.bench.find((umamusume) => umamusume.uid === targetUid) : undefined) ?? side.bench[0];
  if (!target) return;

  for (let attached = 0; attached < count; attached += 1) {
    const energyType = rollEnergyFromPool(side.energyPool);
    target.energies[energyType] += 1;
    log(state, `${trainer.name} generated 1 ${energyLabel(energyType)} in the Energy Zone and attached it to ${formatUmamusumeInstanceName(target)}.`);
  }
}

function discardOtherCardForScout(state: GameState, side: SideState, discardHandIndex = 0): string | null {
  const discarded = side.hand.splice(discardHandIndex, 1)[0];
  if (!discarded) return null;
  side.discard.push(discarded);
  return formatCardName(getCard(discarded));
}

function searchUmamusumeFromDeck(state: GameState, side: SideState, deckCardIndex?: number, reveal = false): void {
  const chosenCard = deckCardIndex === undefined ? undefined : side.deck[deckCardIndex];
  const index = chosenCard && isUmamusumeInDeck(chosenCard) && deckCardIndex !== undefined ? deckCardIndex : side.deck.findIndex(isUmamusumeInDeck);
  moveDeckCardToHand(state, side, index, reveal);
}

function searchEvolutionUmamusumeFromDeck(state: GameState, side: SideState, deckCardIndex?: number, reveal = false): void {
  const chosenCard = deckCardIndex === undefined ? undefined : side.deck[deckCardIndex];
  const isEvolutionUmamusume = (cardId: string) => {
    const card = getCard(cardId);
    return card.kind === "umamusume" && card.stage > 0;
  };
  const index = chosenCard && isEvolutionUmamusume(chosenCard) && deckCardIndex !== undefined
    ? deckCardIndex
    : side.deck.findIndex(isEvolutionUmamusume);
  moveDeckCardToHand(state, side, index, reveal);
}

function searchRandomBasicUmamusumeFromDeck(state: GameState, side: SideState, reveal = false): void {
  const candidates = side.deck
    .map((cardId, index) => ({ card: getCard(cardId), index }))
    .filter(({ card }) => card.kind === "umamusume" && card.stage === 0);
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  moveDeckCardToHand(state, side, chosen?.index ?? -1, reveal);
}

function moveRandomBasicUmamusumeFromDiscardToHand(state: GameState, side: SideState): void {
  if (side.hand.length >= MAX_HAND) return;
  const candidates = side.discard
    .map((cardId, index) => ({ card: getCard(cardId), index }))
    .filter(({ card }) => card.kind === "umamusume" && card.stage === 0);
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  if (!chosen) return;
  const [cardId] = side.discard.splice(chosen.index, 1);
  if (!cardId) return;
  side.hand.push(cardId);
  if (side.id === "player") {
    log(state, `${actorName(side)} put ${formatCardName(getCard(cardId))} from discard into ${actorLowerPossessive(side)} hand.`);
  } else {
    log(state, `${actorName(side)} put 1 card from discard into ${actorLowerPossessive(side)} hand.`);
  }
}

function discardRandomOpponentActiveEnergy(state: GameState, side: SideState, trainer: TrainerCard): void {
  const opponent = state.sides[side.id === "player" ? "opponent" : "player"];
  const active = opponent.active;
  if (!active) return;
  const energyPool = (Object.entries(active.energies) as [EnergyType, number][])
    .flatMap(([energyType, count]) => Array.from({ length: count }, () => energyType));
  const energyType = energyPool[Math.floor(Math.random() * energyPool.length)];
  if (!energyType) return;
  active.energies[energyType] = Math.max(0, active.energies[energyType] - 1);
  log(state, `${trainer.name} discarded 1 ${energyLabel(energyType)} from ${actorPossessive(opponent)} Active Umamusume.`);
}

function recoverActiveSpecialConditions(state: GameState, side: SideState, trainer: TrainerCard): void {
  const active = side.active;
  if (!active || active.specialConditions.length === 0) return;
  active.specialConditions = [];
  active.paralysedUntilOwnTurn = null;
  log(state, `${trainer.name} cleared all Special Conditions from ${formatUmamusumeInstanceName(active)}.`);
}

function moveDeckCardToHand(state: GameState, side: SideState, deckIndex: number, reveal = false): void {
  if (deckIndex < 0 || side.hand.length >= MAX_HAND) return;
  const cardId = side.deck.splice(deckIndex, 1)[0];
  if (!cardId) return;
  side.hand.push(cardId);
  const possessive = actorLowerPossessive(side);
  log(
    state,
    side.id === "player"
      ? `${actorName(side)} added ${formatCardName(getCard(cardId))} from ${possessive} deck to ${possessive} hand.`
      : reveal
      ? `${actorName(side)} revealed ${formatCardName(getCard(cardId))} and added it to ${possessive} hand.`
      : `${actorName(side)} added 1 card from ${possessive} deck to ${possessive} hand.`,
  );
}

function formatCardNameList(cardIds: string[]): string {
  const names = cardIds.map((cardId) => formatCardName(getCard(cardId)));
  if (names.length === 0) return "0 cards";
  if (names.length === 1) return names[0] ?? "1 card";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
