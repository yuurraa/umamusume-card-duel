import { MAX_BENCH, OPENING_HAND, cards } from "../../../../../shared/src/gameData";
import type { EnergyType, SideId, SideState, UmamusumeInstance } from "../../../../../shared/src/types";
import { ALL_ENERGY_TYPES, UMAMUSUME_TYPE_TO_ENERGY } from "../core/constants";
import { getCard, isBasicUmamusumeInDeck } from "../core/catalog";
import { shuffle } from "../core/random";

let nextUmamusumeId = 1;

export function resetUmamusumeIdCounter(): void {
  nextUmamusumeId = 1;
}

export function createUmamusume(cardId: string, turnNumber: number): UmamusumeInstance {
  const card = getCard(cardId);
  if (card.kind !== "umamusume") throw new Error(`Expected Umamusume card: ${cardId}`);
  return {
    uid: nextUmamusumeId++,
    cardId,
    evolutionCardIds: [],
    species: card.species,
    stage: card.stage,
    hp: card.hp,
    maxHp: card.hp,
    energies: createEmptyEnergyRecord(),
    specialConditions: [],
    enteredTurn: turnNumber,
    evolvedTurn: null,
    tookDamageLastTurn: false,
    tookDamageThisTurn: false,
    nextTurnDamageReduction: 0,
    usedAbilityThisTurn: false,
    attackBlockedUntilOwnTurn: null,
    paralysedUntilOwnTurn: null,
    toolCardId: null,
  };
}

export function buildOpeningSide(id: SideId, title: string, deckList: string[], autoSetupActive: boolean, selectedEnergyTypes?: EnergyType[]): SideState {
  const { deck, hand } = drawOpeningHand(deckList);
  const side = makeSide(id, title, deck, getDeckEnergyPool(deckList, selectedEnergyTypes));
  side.hand = hand;

  if (autoSetupActive) {
    const basicIndexes = hand
      .map((cardId, index) => ({ cardId, index }))
      .filter(({ cardId }) => isBasicUmamusumeInDeck(cardId))
      .slice(0, MAX_BENCH + 1);
    const activeEntry = basicIndexes[0];
    if (activeEntry) {
      side.active = createUmamusume(activeEntry.cardId, 0);
      const benchEntries = basicIndexes.slice(1);
      side.bench = benchEntries.map(({ cardId }) => createUmamusume(cardId, 0));
      const taken = new Set(basicIndexes.map(({ index }) => index));
      side.hand = side.hand.filter((_, index) => !taken.has(index));
    }
  }

  return side;
}

export function buildDeferredOpeningSide(id: SideId, title: string, deckList: string[], selectedEnergyTypes?: EnergyType[]): { side: SideState; openingHand: string[] } {
  const { deck, hand } = drawOpeningHand(deckList);
  return {
    side: makeSide(id, title, deck, getDeckEnergyPool(deckList, selectedEnergyTypes)),
    openingHand: hand,
  };
}

export function autoSetupBasicUmamusume(side: SideState): void {
  const basicIndexes = side.hand
    .map((cardId, index) => ({ cardId, index }))
    .filter(({ cardId }) => isBasicUmamusumeInDeck(cardId))
    .slice(0, MAX_BENCH + 1);
  const activeEntry = basicIndexes[0];
  if (!activeEntry) return;

  side.active = createUmamusume(activeEntry.cardId, 0);
  const benchEntries = basicIndexes.slice(1);
  side.bench = benchEntries.map(({ cardId }) => createUmamusume(cardId, 0));
  const taken = new Set(basicIndexes.map(({ index }) => index));
  side.hand = side.hand.filter((_, index) => !taken.has(index));
}

function createEmptyEnergyRecord(): Record<EnergyType, number> {
  return ALL_ENERGY_TYPES.reduce<Record<EnergyType, number>>((energies, type) => {
    energies[type] = 0;
    return energies;
  }, {} as Record<EnergyType, number>);
}

function getDeckEnergyPool(deckList: string[], selectedEnergyTypes?: EnergyType[]): EnergyType[] {
  const selectedPool = normalizeSelectedEnergyTypes(selectedEnergyTypes);
  if (selectedPool.length > 0) return selectedPool;

  const pool = new Set<EnergyType>();
  deckList.forEach((cardId) => {
    const card = cards[cardId];
    if (!card || card.kind !== "umamusume") return;
    pool.add(UMAMUSUME_TYPE_TO_ENERGY[card.type]);
  });
  return pool.size > 0 ? [...pool] : ["psychic"];
}

function normalizeSelectedEnergyTypes(selectedEnergyTypes?: EnergyType[]): EnergyType[] {
  if (!selectedEnergyTypes) return [];
  const selected = new Set(selectedEnergyTypes);
  return ALL_ENERGY_TYPES.filter((type) => type !== "colorless" && selected.has(type)).slice(0, 3);
}

function drawOpeningHand(deckList: string[]): { deck: string[]; hand: string[] } {
  while (true) {
    const deck = shuffle(deckList);
    const hand = deck.splice(0, OPENING_HAND);
    if (hand.some(isBasicUmamusumeInDeck)) return { deck, hand };
  }
}

function makeSide(id: SideId, title: string, deck: string[], energyPool: EnergyType[]): SideState {
  return {
    id,
    title,
    energyPool,
    deck,
    discard: [],
    hand: [],
    active: null,
    bench: [],
    points: 0,
    energyZone: [],
    energyAttachmentsThisTurn: 0,
    bonusEnergyAttachments: 0,
    retreatCostReduction: 0,
    activeAttackDamageBonus: 0,
    usedSupporterThisTurn: false,
    usedRetreatThisTurn: false,
    usedStadiumThisTurn: false,
    usedAbilityNamesThisTurn: [],
    usedAbilityNamesThisGame: [],
    guaranteedCoinFlipHeads: 0,
  };
}
