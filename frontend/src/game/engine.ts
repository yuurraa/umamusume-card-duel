import {
  MAX_BENCH,
  MAX_HAND,
  MAX_POINTS,
  OPENING_HAND,
  cards,
  playerDeckList,
  opponentDeckList,
} from "../../../shared/src/gameData";
import type {
  Card,
  EnergyCost,
  EnergyType,
  GameState,
  PendingPlayerChoice,
  PokemonType,
  PlayAction,
  PokemonCard,
  PokemonInstance,
  SideId,
  SideState,
  TrainerCard,
} from "../../../shared/src/types";

let nextPokemonId = 1;

const ALL_ENERGY_TYPES: EnergyType[] = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "steel", "colorless", "dragon"];

const POKEMON_TYPE_TO_ENERGY: Record<PokemonType, EnergyType> = {
  Grass: "grass",
  Fire: "fire",
  Water: "water",
  Lightning: "lightning",
  Psychic: "psychic",
  Fighting: "fighting",
  Darkness: "darkness",
  Steel: "steel",
  Colorless: "colorless",
  Dragon: "dragon",
};

const ENERGY_LABELS: Record<EnergyType, string> = {
  grass: "Grass Energy",
  fire: "Fire Energy",
  water: "Water Energy",
  lightning: "Lightning Energy",
  psychic: "Psychic Energy",
  fighting: "Fighting Energy",
  darkness: "Darkness Energy",
  steel: "Steel Energy",
  colorless: "Colorless Energy",
  dragon: "Dragon Energy",
};

export type PlayChoices = {
  discardHandIndex?: number;
  deckCardIndex?: number;
  pokemonTargetUid?: number;
};

export function createGame(playerDeck = playerDeckList, opponentDeck = opponentDeckList, opponentName = "Opponent"): GameState {
  nextPokemonId = 1;
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

  log(state, `Coin flip was ${coinFlipResult}. ${firstPlayer === "player" ? "You went first." : "Opponent went first."}`);
  return state;
}

export function cloneGame(state: GameState): GameState {
  return structuredClone(state);
}

export function getCard(cardId: string): Card {
  const card = cards[cardId];
  if (!card) throw new Error(`Unknown card: ${cardId}`);
  return card;
}

export function getPokemonCard(pokemon: PokemonInstance): PokemonCard {
  const card = getCard(pokemon.cardId);
  if (card.kind !== "pokemon") throw new Error(`Expected Pokemon card: ${pokemon.cardId}`);
  return card;
}

export function getPrimaryAttack(card: PokemonCard) {
  const attack = card.attacks[0];
  if (!attack) throw new Error(`Pokemon has no attacks: ${card.id}`);
  return attack;
}

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

export function playHandCard(state: GameState, handIndex: number, choices: PlayChoices = {}): GameState {
  const next = cloneGame(state);
  const side = next.sides.player;
  if (!isPlayerTurn(next) || next.pendingPlayerChoice) return next;
  const cardId = side.hand[handIndex];
  if (!cardId) return next;
  const card = getCard(cardId);
  const play = getPlayableAction(next, side, cardId);
  if (!play.canPlay) return next;
  if (play.type === "evolve" && card.kind === "pokemon" && choices.pokemonTargetUid !== undefined) {
    const chosenTarget = findOwnPokemonByUid(side, choices.pokemonTargetUid);
    if (!chosenTarget || !isValidEvolutionTarget(next, side, chosenTarget, card)) return next;
  }
  side.hand.splice(handIndex, 1);
  resolveCardPlay(next, side, card, play, adjustHandChoices(choices, handIndex));
  normalizeBoardState(next);
  refreshContinuousEffects(next);
  return next;
}

export function attachPlayerEnergy(state: GameState, pokemonUid?: number): GameState {
  const next = cloneGame(state);
  const side = next.sides.player;
  if (next.pendingPlayerChoice) return next;
  const target = pokemonUid ? findOwnPokemonByUid(side, pokemonUid) : side.active;
  if (!target || !canAttachEnergyToPokemon(next, side, target)) return next;
  attachEnergy(next, side, target);
  normalizeBoardState(next);
  return next;
}

export function playerAttack(state: GameState, healTargetUid?: number): GameState {
  const next = cloneGame(state);
  if (!canAttack(next, next.sides.player)) return next;
  performAttack(next, "player", healTargetUid);
  if (next.pendingPlayerChoice) return next;
  if (!next.gameOver) endTurn(next);
  return next;
}

export function playerEndTurn(state: GameState): GameState {
  const next = cloneGame(state);
  if (!isPlayerTurn(next) || next.pendingPlayerChoice) return next;
  endTurn(next);
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
      if (aiPlayOneTrainer(next, opponent, "resumeOpponentAfterFirstTrainerPass")) return next;
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
      if (aiPlayOneTrainer(next, opponent, "resumeOpponentAfterSecondTrainerPass")) return next;
      next.opponentTurnStep = "attack";
      continue;
    }

    if (step === "attack") {
      refreshContinuousEffects(next);
      if (canAttack(next, opponent)) {
        performAttack(next, "opponent");
        if (next.pendingPlayerChoice) {
          next.opponentTurnStep = "finish";
          return next;
        }
      } else {
        log(next, "Opponent did not attack.");
      }
      next.opponentTurnStep = null;
      if (!next.gameOver) endTurn(next);
      return next;
    }

    if (step === "finish") {
      next.opponentTurnStep = null;
      if (!next.gameOver) endTurn(next);
      return next;
    }
  }

  return next;
}

export function playerRetreat(state: GameState, benchPokemonUid?: number): GameState {
  const next = cloneGame(state);
  const side = next.sides.player;
  if (next.pendingPlayerChoice || !side.active) return next;
  if (!canRetreat(next, side)) return next;
  payRetreatCost(side.active, effectiveRetreatCost(next, side));
  const targetIndex = benchPokemonUid ? side.bench.findIndex((pokemon) => pokemon.uid === benchPokemonUid) : 0;
  const promoted = targetIndex >= 0 ? side.bench.splice(targetIndex, 1)[0] : undefined;
  if (!promoted) return next;
  side.bench.push(side.active);
  side.active = promoted;
  side.usedRetreatThisTurn = true;
  normalizeBoardState(next);
  refreshContinuousEffects(next);
  log(next, `You retreated to ${formatPokemonInstanceName(side.active)}.`);
  return next;
}

export function canAttachEnergy(state: GameState, side: SideState): boolean {
  return state.phase === "play" && !state.pendingPlayerChoice && !state.gameOver && state.currentSide === side.id && side.energyZone.length > 0 && side.energyAttachmentsThisTurn < 1 + side.bonusEnergyAttachments;
}

export function canAttachEnergyToPokemon(state: GameState, side: SideState, pokemon: PokemonInstance): boolean {
  if (!canAttachEnergy(state, side)) return false;
  return side.energyAttachmentsThisTurn < 1 || pokemon.uid === side.active?.uid;
}

export function canAttack(state: GameState, side: SideState): boolean {
  if (state.phase !== "play" || state.pendingPlayerChoice || state.gameOver || state.currentSide !== side.id || !side.active) return false;
  return hasEnoughEnergy(side.active, getPrimaryAttack(getPokemonCard(side.active)).cost);
}

export function canRetreat(state: GameState, side: SideState): boolean {
  if (state.phase !== "play" || state.pendingPlayerChoice || state.gameOver || state.currentSide !== side.id || side.usedRetreatThisTurn || !side.active) return false;
  if (side.bench.length === 0) return false;
  return attachedEnergyCount(side.active) >= effectiveRetreatCost(state, side);
}

export function canUsePokemonAbility(state: GameState, side: SideState, abilityPokemonUid: number): boolean {
  if (state.phase !== "play" || state.pendingPlayerChoice || state.gameOver || state.currentSide !== side.id || !side.active) return false;
  const abilityPokemon = findOwnPokemonByUid(side, abilityPokemonUid);
  if (!abilityPokemon || abilityPokemon.usedAbilityThisTurn) return false;
  const ability = getPokemonCard(abilityPokemon).ability;
  if (!ability?.moveBenchedEnergyToActive) return false;
  if (side.usedAbilityNamesThisTurn?.includes(ability.name)) return false;
  return getAbilityMoveEnergyTypes(ability).length > 0;
}

export function usePlayerAbility(state: GameState, abilityPokemonUid: number, sourcePokemonUid: number, selectedEnergyType?: EnergyType): GameState {
  const next = cloneGame(state);
  const side = next.sides.player;
  if (!canUsePokemonAbility(next, side, abilityPokemonUid) || !side.active) return next;
  const abilityPokemon = findOwnPokemonByUid(side, abilityPokemonUid);
  if (!abilityPokemon) return next;
  const abilityCard = getPokemonCard(abilityPokemon);
  const ability = abilityCard.ability;
  const energyTypes = getAbilityMoveEnergyTypes(ability);
  const source = side.bench.find((pokemon) => pokemon.uid === sourcePokemonUid && energyTypes.some((energyType) => pokemon.energies[energyType] > 0));
  if (!source) return next;
  const availableEnergyTypes = energyTypes.filter((type) => source.energies[type] > 0);
  const energyType = selectedEnergyType
    ? availableEnergyTypes.includes(selectedEnergyType) ? selectedEnergyType : undefined
    : availableEnergyTypes.length === 1 ? availableEnergyTypes[0] : undefined;
  if (!ability || !energyType) return next;
  source.energies[energyType] -= 1;
  side.active.energies[energyType] += 1;
  abilityPokemon.usedAbilityThisTurn = true;
  side.usedAbilityNamesThisTurn ??= [];
  if (!side.usedAbilityNamesThisTurn.includes(ability.name)) side.usedAbilityNamesThisTurn.push(ability.name);
  log(next, `${formatPokemonCardName(abilityCard)}'s ${ability.name} moved 1 ${energyLabel(energyType)} to the active spot.`);
  return next;
}

export function getDisplayedRetreatCost(state: GameState, side: SideState, pokemon: PokemonInstance): number {
  return pokemon.uid === side.active?.uid ? effectiveRetreatCost(state, side) : Math.max(0, retreatCost(getPokemonCard(pokemon).retreat) - getGlobalRetreatCostReduction(state));
}

export function attachedEnergyCount(pokemon: PokemonInstance): number {
  return Object.values(pokemon.energies).reduce((sum, amount) => sum + amount, 0);
}

export function isPlayerTurn(state: GameState): boolean {
  return state.phase === "play" && !state.gameOver && state.currentSide === "player";
}

export function energyLabel(type: EnergyType): string {
  return ENERGY_LABELS[type];
}

function actorName(side: SideState): string {
  return side.id === "player" ? "You" : "Opponent";
}

function actorPossessive(side: SideState): string {
  return side.id === "player" ? "Your" : "Opponent's";
}

function actorLowerPossessive(side: SideState): string {
  return side.id === "player" ? "your" : "their";
}

function stageName(stage: number): string {
  if (stage === 0) return "Basic";
  return `Stage ${stage}`;
}

function formatPokemonCardName(card: PokemonCard): string {
  return `${card.name} (${stageName(card.stage)})`;
}

function formatPokemonInstanceName(pokemon: PokemonInstance): string {
  return formatPokemonCardName(getPokemonCard(pokemon));
}

function formatCardName(card: Card): string {
  return card.kind === "pokemon" ? formatPokemonCardName(card) : card.name;
}

function pluralize(amount: number, singular: string, plural = `${singular}s`): string {
  return amount === 1 ? singular : plural;
}

export function getEvolutionTargets(state: GameState, side: SideState, evolutionCard: PokemonCard): PokemonInstance[] {
  return [side.active, ...side.bench].filter((pokemon): pokemon is PokemonInstance => Boolean(pokemon)).filter((pokemon) => isValidEvolutionTarget(state, side, pokemon, evolutionCard));
}

export function getAllPokemon(side: SideState): PokemonInstance[] {
  return side.active ? [side.active, ...side.bench] : [...side.bench];
}

export function getDamagedPokemon(side: SideState): PokemonInstance[] {
  return getAllPokemon(side).filter((pokemon) => pokemon.hp < pokemon.maxHp);
}

export function completePregameSetup(state: GameState, activeHandIndex: number, benchHandIndexes: number[]): GameState {
  const next = cloneGame(state);
  if (next.phase !== "setup") return next;
  const player = next.sides.player;
  const activeCardId = player.hand[activeHandIndex];
  if (!activeCardId || !isBasicPokemonInDeck(activeCardId)) return next;

  const uniqueBenchIndexes = [...new Set(benchHandIndexes)]
    .filter((index) => index !== activeHandIndex)
    .filter((index) => index >= 0 && index < player.hand.length)
    .filter((index) => isBasicPokemonInDeck(player.hand[index] ?? ""))
    .slice(0, MAX_BENCH);

  player.active = createPokemon(activeCardId, 0);
  player.bench = uniqueBenchIndexes.map((index) => createPokemon(player.hand[index]!, 0));

  const taken = new Set([activeHandIndex, ...uniqueBenchIndexes]);
  player.hand = player.hand.filter((_, index) => !taken.has(index));

  next.phase = "play";
  next.setup = next.setup ? { ...next.setup, opponentRevealed: true } : null;
  next.pendingPlayerChoice = null;

  startTurn(next, next.firstPlayer, true);
  return next;
}

export function resolvePendingPlayerChoice(state: GameState, pokemonUid: number): GameState {
  const next = cloneGame(state);
  const pending = next.pendingPlayerChoice;
  const player = next.sides.player;
  if (!pending) return next;

  player.bench = player.bench.filter((pokemon, index, bench) => pokemon.hp > 0 && bench.findIndex((entry) => entry.uid === pokemon.uid) === index);
  const requiresPromotion = pending.kind === "promoteAfterKnockout" || !player.active || player.active.hp <= 0;

  if (requiresPromotion) {
    if (player.active && player.active.hp <= 0) player.active = null;
    const replacementIndex = player.bench.findIndex((pokemon) => pokemon.uid === pokemonUid);
    const replacement = replacementIndex >= 0 ? player.bench.splice(replacementIndex, 1)[0] : undefined;
    if (!replacement) return next;
    player.active = replacement;
    log(next, `You promoted ${formatPokemonInstanceName(replacement)}.`);
  } else {
    if (!player.active) return next;
    const replacementIndex = player.bench.findIndex((pokemon) => pokemon.uid === pokemonUid);
    const replacement = replacementIndex >= 0 ? player.bench.splice(replacementIndex, 1)[0] : undefined;
    if (!replacement) return next;
    const switchedOut = player.active;
    player.bench.push(switchedOut);
    player.active = replacement;
    log(next, `You switched to ${formatPokemonInstanceName(replacement)}.`);
  }

  next.pendingPlayerChoice = null;
  normalizeBoardState(next);
  refreshContinuousEffects(next);

  if (pending.resume === "finishOpponentTurn") {
    if (!next.gameOver) endTurn(next);
    return next;
  }
  return next;
}

export function isPokemonInDeck(cardId: string): boolean {
  return getCard(cardId).kind === "pokemon";
}

export function isBasicPokemonInDeck(cardId: string): boolean {
  const card = getCard(cardId);
  return card.kind === "pokemon" && card.stage === 0;
}

function adjustHandChoices(choices: PlayChoices, handIndex: number): PlayChoices {
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

function createEmptyEnergyRecord(): Record<EnergyType, number> {
  return ALL_ENERGY_TYPES.reduce<Record<EnergyType, number>>((energies, type) => {
    energies[type] = 0;
    return energies;
  }, {} as Record<EnergyType, number>);
}

function getDeckEnergyPool(deckList: string[]): EnergyType[] {
  const pool = new Set<EnergyType>();
  deckList.forEach((cardId) => {
    const card = cards[cardId];
    if (!card || card.kind !== "pokemon") return;
    pool.add(POKEMON_TYPE_TO_ENERGY[card.type]);
  });
  return pool.size > 0 ? [...pool] : ["psychic"];
}

function drawOpeningHand(deckList: string[]): { deck: string[]; hand: string[] } {
  while (true) {
    const deck = shuffle(deckList);
    const hand = deck.splice(0, OPENING_HAND);
    if (hand.some(isBasicPokemonInDeck)) return { deck, hand };
  }
}

function buildOpeningSide(id: SideId, title: string, deckList: string[], autoSetupActive: boolean): SideState {
  const { deck, hand } = drawOpeningHand(deckList);
  const side = makeSide(id, title, deck, getDeckEnergyPool(deckList));
  side.hand = hand;

  if (autoSetupActive) {
    const basicIndexes = hand
      .map((cardId, index) => ({ cardId, index }))
      .filter(({ cardId }) => isBasicPokemonInDeck(cardId))
      .slice(0, MAX_BENCH + 1);
    const activeEntry = basicIndexes[0];
    if (activeEntry) {
      side.active = createPokemon(activeEntry.cardId, 0);
      const benchEntries = basicIndexes.slice(1);
      side.bench = benchEntries.map(({ cardId }) => createPokemon(cardId, 0));
      const taken = new Set(basicIndexes.map(({ index }) => index));
      side.hand = side.hand.filter((_, index) => !taken.has(index));
    }
  }

  return side;
}

function rollEnergyFromPool(pool: EnergyType[]): EnergyType {
  const index = Math.floor(Math.random() * pool.length);
  return pool[index] ?? "psychic";
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
    usedAbilityNamesThisTurn: [],
  };
}

function createPokemon(cardId: string, turnNumber: number): PokemonInstance {
  const card = getCard(cardId);
  if (card.kind !== "pokemon") throw new Error(`Expected Pokemon card: ${cardId}`);
  return {
    uid: nextPokemonId++,
    cardId,
    species: card.species,
    stage: card.stage,
    hp: card.hp,
    maxHp: card.hp,
    energies: createEmptyEnergyRecord(),
    enteredTurn: turnNumber,
    evolvedTurn: null,
    tookDamageLastTurn: false,
    tookDamageThisTurn: false,
    nextTurnDamageReduction: 0,
    usedAbilityThisTurn: false,
  };
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = copy[index];
    const swap = copy[swapIndex];
    if (current === undefined || swap === undefined) continue;
    copy[index] = swap;
    copy[swapIndex] = current;
  }
  return copy;
}

function startTurn(state: GameState, sideId: SideId, skipDraw = false): void {
  const side = state.sides[sideId];
  state.currentSide = sideId;
  state.opponentTurnStep = sideId === "opponent" ? "bench" : null;
  side.energyAttachmentsThisTurn = 0;
  side.bonusEnergyAttachments = 0;
  side.retreatCostReduction = 0;
  side.activeAttackDamageBonus = 0;
  side.usedSupporterThisTurn = false;
  side.usedRetreatThisTurn = false;
  side.usedAbilityNamesThisTurn = [];
  preparePokemonForTurn(side);
  side.energyZone = [];
  if (!(state.turnNumber === 1 && state.firstPlayer === sideId)) {
    side.energyZone.push(rollEnergyFromPool(side.energyPool));
  }
  refreshContinuousEffects(state);
  applyStartAbilities(state, side);
  if (!skipDraw) drawCards(state, side, 1);
}

function preparePokemonForTurn(side: SideState): void {
  getAllPokemon(side).forEach((pokemon) => {
    pokemon.tookDamageLastTurn = pokemon.tookDamageThisTurn;
    pokemon.tookDamageThisTurn = false;
    pokemon.nextTurnDamageReduction = 0;
    pokemon.usedAbilityThisTurn = false;
  });
}

function drawCards(state: GameState, side: SideState, amount: number): void {
  for (let count = 0; count < amount; count += 1) {
    if (side.hand.length >= MAX_HAND) {
      log(state, `${actorPossessive(side)} hand was full.`);
      return;
    }
    const card = side.deck.shift();
    if (!card) {
      log(state, `${actorName(side)} could not draw, but there was no deck-out loss.`);
      return;
    }
    side.hand.push(card);
  }
}

function applyStartAbilities(state: GameState, side: SideState): void {
  if (!side.active) return;
  const card = getPokemonCard(side.active);
  if (!card.ability) return;
  if (!card.ability.heal) return;
  const before = side.active.hp;
  side.active.hp = Math.min(side.active.maxHp, side.active.hp + card.ability.heal);
  const healed = side.active.hp - before;
  if (healed > 0) log(state, `${actorPossessive(side)} ${formatPokemonCardName(card)} healed ${healed} HP with ${card.ability.name}.`);
}

function getAbilityMoveEnergyTypes(ability: PokemonCard["ability"]): EnergyType[] {
  const energyTypes = ability?.moveBenchedEnergyToActive;
  if (!energyTypes) return [];
  return Array.isArray(energyTypes) ? energyTypes : [energyTypes];
}

function resolveCardPlay(state: GameState, side: SideState, card: Card, play: PlayAction, choices: PlayChoices = {}): void {
  if (!play.canPlay) return;
  if (play.type === "benchBasic" && card.kind === "pokemon") {
    side.bench.push(createPokemon(card.id, state.turnNumber));
    log(state, `${actorName(side)} benched ${formatPokemonCardName(card)}.`);
  } else if (play.type === "evolve" && card.kind === "pokemon") {
    const chosenTarget = choices.pokemonTargetUid !== undefined ? findOwnPokemonByUid(side, choices.pokemonTargetUid) : undefined;
    if (choices.pokemonTargetUid !== undefined && (!chosenTarget || !isValidEvolutionTarget(state, side, chosenTarget, card))) return;
    const target = chosenTarget ?? play.target;
    evolvePokemon(state, side, target, card);
  } else if (play.type === "trainer" && card.kind === "trainer") {
    if (card.trainerType === "stadium") {
      playStadium(state, side, card);
      return;
    }
    applyTrainer(state, side, card, choices);
    if (card.trainerType === "supporter") side.usedSupporterThisTurn = true;
    side.discard.push(card.id);
    log(state, `${actorName(side)} played ${card.name}.`);
  }
}

function playStadium(state: GameState, side: SideState, stadium: TrainerCard): void {
  if (state.stadium) {
    const previous = state.stadium;
    const previousCard = getCard(previous.cardId);
    state.sides[previous.owner].discard.push(previous.cardId);
    log(state, `${previousCard.name} left the Stadium Slot.`);
  }
  state.stadium = { cardId: stadium.id, owner: side.id };
  log(state, `${actorName(side)} played ${stadium.name}.`);
}

function findEvolutionTarget(state: GameState, side: SideState, evolutionCard: PokemonCard): PokemonInstance | undefined {
  return getEvolutionTargets(state, side, evolutionCard)[0];
}

function isValidEvolutionTarget(state: GameState, side: SideState, pokemon: PokemonInstance, evolutionCard: PokemonCard): boolean {
  if (isSideFirstTurn(state, side.id)) return false;
  if (pokemon.species !== evolutionCard.evolvesFrom) return false;
  if (pokemon.stage !== evolutionCard.stage - 1) return false;
  if (pokemon.enteredTurn === state.turnNumber) return false;
  if (pokemon.evolvedTurn === state.turnNumber) return false;
  return true;
}

function isSideFirstTurn(state: GameState, sideId: SideId): boolean {
  if (sideId === state.firstPlayer) return state.turnNumber === 1;
  return state.firstPlayer === "player" ? state.turnNumber === 1 : state.turnNumber === 2;
}

function evolvePokemon(state: GameState, side: SideState, pokemon: PokemonInstance, evolutionCard: PokemonCard): void {
  const damage = pokemon.maxHp - pokemon.hp;
  const previousName = formatPokemonInstanceName(pokemon);
  pokemon.cardId = evolutionCard.id;
  pokemon.species = evolutionCard.species;
  pokemon.stage = evolutionCard.stage;
  pokemon.maxHp = evolutionCard.hp;
  pokemon.hp = evolutionCard.hp - damage;
  pokemon.evolvedTurn = state.turnNumber;
  pokemon.enteredTurn = Math.min(pokemon.enteredTurn, state.turnNumber - 1);
  log(state, `${actorName(side)} evolved ${previousName} into ${formatPokemonCardName(evolutionCard)}.`);
}

function applyTrainer(
  state: GameState,
  side: SideState,
  trainer: TrainerCard,
  choices: PlayChoices = {},
  pendingChoiceResume: Extract<PendingPlayerChoice, { kind: "switchAfterGust" }>["resume"] = "none",
): void {
  if (trainer.effect.discardOtherCard) discardOtherCardForScout(state, side, choices.discardHandIndex);
  if (trainer.effect.retreatCostReduction) side.retreatCostReduction += trainer.effect.retreatCostReduction;
  if (trainer.effect.activeAttackDamageBonus) side.activeAttackDamageBonus += trainer.effect.activeAttackDamageBonus;
  if (trainer.effect.extraEnergyAttach) {
    side.bonusEnergyAttachments += trainer.effect.extraEnergyAttach;
    for (let count = 0; count < trainer.effect.extraEnergyAttach; count += 1) {
      side.energyZone.push(rollEnergyFromPool(side.energyPool));
    }
  }
  if (trainer.effect.gustOpponent) switchOutOpponentActive(state, side.id, pendingChoiceResume);
  if (trainer.effect.heal) {
    const chosenTarget = choices.pokemonTargetUid ? findOwnPokemonByUid(side, choices.pokemonTargetUid) : undefined;
    const target = trainer.effect.healTarget === "any" && chosenTarget ? chosenTarget : trainer.effect.healTarget === "any" ? findMostDamagedPokemon(side) : side.active;
    if (!target) return;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + trainer.effect.heal);
    const healed = target.hp - before;
    if (healed > 0) log(state, `${trainer.name} healed ${formatPokemonInstanceName(target)} for ${healed} HP.`);
  }
  if (trainer.effect.draw) drawCards(state, side, trainer.effect.draw);
  if (trainer.effect.searchPokemon) searchPokemonFromDeck(state, side, choices.deckCardIndex, Boolean(trainer.effect.revealSearchedCard));
  if (trainer.effect.searchRandomBasicPokemon) searchRandomBasicPokemonFromDeck(state, side, Boolean(trainer.effect.revealSearchedCard));
}

function discardOtherCardForScout(state: GameState, side: SideState, discardHandIndex = 0): void {
  const discarded = side.hand.splice(discardHandIndex, 1)[0];
  if (!discarded) return;
  side.discard.push(discarded);
  log(state, `${actorName(side)} discarded ${formatCardName(getCard(discarded))}.`);
}

function searchPokemonFromDeck(state: GameState, side: SideState, deckCardIndex?: number, reveal = false): void {
  const chosenCard = deckCardIndex === undefined ? undefined : side.deck[deckCardIndex];
  const index = chosenCard && isPokemonInDeck(chosenCard) && deckCardIndex !== undefined ? deckCardIndex : side.deck.findIndex(isPokemonInDeck);
  moveDeckCardToHand(state, side, index, reveal);
}

function searchRandomBasicPokemonFromDeck(state: GameState, side: SideState, reveal = false): void {
  const candidates = side.deck
    .map((cardId, index) => ({ card: getCard(cardId), index }))
    .filter(({ card }) => card.kind === "pokemon" && card.stage === 0);
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  moveDeckCardToHand(state, side, chosen?.index ?? -1, reveal);
}

function moveDeckCardToHand(state: GameState, side: SideState, deckIndex: number, reveal = false): void {
  if (deckIndex < 0 || side.hand.length >= MAX_HAND) return;
  const cardId = side.deck.splice(deckIndex, 1)[0];
  if (!cardId) return;
  side.hand.push(cardId);
  const possessive = actorLowerPossessive(side);
  log(state, reveal ? `${actorName(side)} revealed ${formatCardName(getCard(cardId))} and added it to ${possessive} hand.` : `${actorName(side)} added 1 card from ${possessive} deck to ${possessive} hand.`);
}

function hasPokemonInDeck(side: SideState): boolean {
  return side.deck.some((cardId) => getCard(cardId).kind === "pokemon");
}

function hasBasicPokemonInDeck(side: SideState): boolean {
  return side.deck.some((cardId) => {
    const card = getCard(cardId);
    return card.kind === "pokemon" && card.stage === 0;
  });
}

function findMostDamagedPokemon(side: SideState): PokemonInstance {
  if (!side.active) {
    const fallback = side.bench[0];
    if (!fallback) throw new Error(`No healing target available for ${side.title}.`);
    return fallback;
  }
  return [side.active, ...side.bench].reduce((best, pokemon) => {
    const bestDamage = best.maxHp - best.hp;
    const currentDamage = pokemon.maxHp - pokemon.hp;
    return currentDamage > bestDamage ? pokemon : best;
  }, side.active);
}

function findOwnPokemonByUid(side: SideState, pokemonUid: number): PokemonInstance | undefined {
  return getAllPokemon(side).find((pokemon) => pokemon.uid === pokemonUid);
}

function attachEnergy(state: GameState, side: SideState, pokemon: PokemonInstance): void {
  const nextEnergy = side.energyZone.shift();
  if (!nextEnergy) return;
  pokemon.energies[nextEnergy] += 1;
  side.energyAttachmentsThisTurn += 1;
  log(state, `${actorName(side)} attached 1 ${energyLabel(nextEnergy)} to ${formatPokemonInstanceName(pokemon)}.`);
}

function hasEnoughEnergy(pokemon: PokemonInstance, cost: EnergyCost): boolean {
  const requiredColorless = cost.colorless ?? 0;
  const requiredTyped = (Object.entries(cost) as [keyof EnergyCost, number | undefined][])
    .filter(([type]) => type !== "colorless")
    .reduce((sum, [type, amount]) => {
      const required = amount ?? 0;
      if (pokemon.energies[type as EnergyType] < required) return Number.POSITIVE_INFINITY;
      return sum + required;
    }, 0);

  if (!Number.isFinite(requiredTyped)) return false;
  return attachedEnergyCount(pokemon) >= requiredTyped + requiredColorless;
}

function retreatCost(retreat: string): number {
  if (retreat === "Empty") return 0;
  const amount = retreat.match(/x(\d+)/)?.[1];
  return amount ? Number(amount) : 1;
}

function effectiveRetreatCost(state: GameState, side: SideState): number {
  if (!side.active) return 0;
  return Math.max(0, retreatCost(getPokemonCard(side.active).retreat) - side.retreatCostReduction - getGlobalRetreatCostReduction(state));
}

function getGlobalRetreatCostReduction(state: GameState): number {
  if (!state.stadium) return 0;
  const stadium = getCard(state.stadium.cardId);
  if (stadium.kind !== "trainer") return 0;
  return stadium.effect.globalRetreatCostReduction ?? 0;
}

function payRetreatCost(pokemon: PokemonInstance, cost: number): void {
  let remaining = cost;
  for (const type of ALL_ENERGY_TYPES) {
    if (remaining <= 0) return;
    const discarded = Math.min(pokemon.energies[type], remaining);
    pokemon.energies[type] -= discarded;
    remaining -= discarded;
  }
}

function performAttack(state: GameState, attackerId: SideId, healTargetUid?: number): void {
  const defenderId = attackerId === "player" ? "opponent" : "player";
  const attacker = state.sides[attackerId];
  const defender = state.sides[defenderId];
  if (!attacker.active || !defender.active) return;
  const attackerCard = getPokemonCard(attacker.active);
  const attack = getPrimaryAttack(attackerCard);
  const defenderCard = getPokemonCard(defender.active);
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
    log(state, `${actorPossessive(attacker)} ${formatPokemonCardName(attackerCard)} braced for the next attack.`);
  }

  if (attack.draw) {
    drawCards(state, attacker, attack.draw);
    log(state, `${actorName(attacker)} drew ${attack.draw} ${pluralize(attack.draw, "card")}.`);
  }
  if (attack.heal) {
    const chosenTarget = healTargetUid !== undefined ? findOwnPokemonByUid(attacker, healTargetUid) : undefined;
    const target = attack.healTarget === "self"
      ? attacker.active
      : attack.healTarget === "any" && chosenTarget
        ? chosenTarget
        : findMostDamagedPokemon(attacker);
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + attack.heal);
    const healed = target.hp - before;
    if (healed > 0) log(state, `${attack.name} healed ${formatPokemonInstanceName(target)} for ${healed} HP.`);
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
  log(state, `${actorName(attacker)} attacked with ${formatPokemonCardName(attackerCard)}'s ${attack.name} for ${damage} damage.`);

  resolveKnockout(state, attackerId, defenderId);
}

function attackDamageReductionFor(pokemon: PokemonInstance): number {
  return (getPokemonCard(pokemon).ability?.damageReduction ?? 0) + pokemon.nextTurnDamageReduction;
}

function resolveKnockout(state: GameState, attackerId: SideId, defenderId: SideId): void {
  const defender = state.sides[defenderId];
  if (!defender.active) return;
  if (defender.active.hp > 0) return;

  if (!knockOutPokemon(state, attackerId, defenderId, defender.active)) return;
  if (!state.gameOver) refreshContinuousEffects(state);
}

function knockOutPokemon(state: GameState, scoringSideId: SideId, knockedSideId: SideId, knockedOut: PokemonInstance): boolean {
  const attacker = state.sides[scoringSideId];
  const defender = state.sides[knockedSideId];
  const activeKnockout = defender.active?.uid === knockedOut.uid;
  const benchIndex = defender.bench.findIndex((pokemon) => pokemon.uid === knockedOut.uid);
  if (!activeKnockout && benchIndex < 0) return false;

  const knockedCard = getPokemonCard(knockedOut);
  if (activeKnockout) defender.active = null;
  if (benchIndex >= 0) defender.bench.splice(benchIndex, 1);
  defender.bench = defender.bench.filter((pokemon) => pokemon.uid !== knockedOut.uid);
  defender.discard.push(knockedOut.cardId);
  attacker.points += 1;
  log(state, `${formatPokemonCardName(knockedCard)} was knocked out. ${actorName(attacker)} scored 1 point.`);

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
  log(state, `${actorName(defender)} promoted ${formatPokemonInstanceName(promoted)}.`);
  return true;
}

function endTurn(state: GameState): void {
  if (state.gameOver || state.currentSide === "done") return;
  const nextSide: SideId = state.currentSide === "player" ? "opponent" : "player";
  if (nextSide === "player") state.turnNumber += 1;
  startTurn(state, nextSide);
}

function aiPlayOneBasic(state: GameState, side: SideState): boolean {
  if (side.bench.length >= MAX_BENCH) return false;
  const index = side.hand.findIndex((cardId) => {
    const card = getCard(cardId);
    return card.kind === "pokemon" && card.stage === 0;
  });
  if (index === -1) return false;
  const cardId = side.hand.splice(index, 1)[0];
  if (!cardId) return false;
  const card = getCard(cardId);
  if (card.kind !== "pokemon") return false;
  side.bench.push(createPokemon(card.id, state.turnNumber));
  log(state, `${actorName(side)} benched ${formatPokemonCardName(card)}.`);
  return true;
}

function aiEvolveOne(state: GameState, side: SideState): boolean {
  const index = side.hand.findIndex((cardId) => {
    const card = getCard(cardId);
    return card.kind === "pokemon" && card.stage > 0 && Boolean(findEvolutionTarget(state, side, card));
  });
  if (index === -1) return false;
  const cardId = side.hand.splice(index, 1)[0];
  if (!cardId) return false;
  const card = getCard(cardId);
  if (card.kind !== "pokemon") return false;
  const target = findEvolutionTarget(state, side, card);
  if (!target) return false;
  evolvePokemon(state, side, target, card);
  return true;
}

function aiAttachOneEnergy(state: GameState, side: SideState): boolean {
  if (!side.active || !canAttachEnergy(state, side)) return false;
  if (side.energyAttachmentsThisTurn >= 1) {
    attachEnergy(state, side, side.active);
    return true;
  }
  if (!hasEnoughEnergy(side.active, getPrimaryAttack(getPokemonCard(side.active)).cost)) {
    attachEnergy(state, side, side.active);
    return true;
  }
  const target = side.bench.find((pokemon) => !hasEnoughEnergy(pokemon, getPrimaryAttack(getPokemonCard(pokemon)).cost));
  attachEnergy(state, side, target || side.active);
  return true;
}

function aiPlayOneTrainer(
  state: GameState,
  side: SideState,
  pendingChoiceResume: Extract<PendingPlayerChoice, { kind: "switchAfterGust" }>["resume"],
): boolean {
  const index = side.hand.findIndex((cardId) => shouldAiPlayTrainer(state, side, getCard(cardId)));
  if (index === -1) return false;
  const cardId = side.hand.splice(index, 1)[0];
  if (!cardId) return false;
  const card = getCard(cardId);
  if (card.kind !== "trainer") return false;
  if (card.trainerType === "stadium") {
    playStadium(state, side, card);
    refreshContinuousEffects(state);
    return true;
  }
  applyTrainer(state, side, card, {}, pendingChoiceResume);
  if (card.trainerType === "supporter") side.usedSupporterThisTurn = true;
  side.discard.push(card.id);
  log(state, `${actorName(side)} played ${card.name}.`);
  return true;
}

function shouldAiPlayTrainer(state: GameState, side: SideState, card: Card): boolean {
  if (card.kind !== "trainer") return false;
  if (!getPlayableAction(state, side, card.id).canPlay) return false;
  if (card.effect.gustOpponent) return getOpposingSide(state, side.id).bench.length > 0;
  if (card.effect.activeAttackDamageBonus) return true;
  if (card.effect.extraEnergyAttach) return true;
  if (card.effect.retreatCostReduction) {
    const active = side.active;
    if (!active) return false;
    return side.bench.length > 0 && attachedEnergyCount(active) + card.effect.retreatCostReduction >= effectiveRetreatCost(state, side) && !canRetreat(state, side);
  }
  if (card.effect.heal && !hasDamagedHealingTarget(side, card)) return Boolean(card.effect.draw && side.hand.length < MAX_HAND);
  if (card.effect.draw && side.hand.length >= MAX_HAND) return false;
  if (card.effect.searchPokemon || card.effect.searchRandomBasicPokemon) return side.hand.length < MAX_HAND;
  return true;
}

function getOpposingSide(state: GameState, sideId: SideId): SideState {
  return state.sides[sideId === "player" ? "opponent" : "player"];
}

function refreshContinuousEffects(state: GameState): void {
  refreshContinuousHp(state);
  resolveContinuousKnockouts(state);
}

function refreshContinuousHp(state: GameState): void {
  normalizeBoardState(state);
  const basicHpBonus = getStadiumBasicHpBonus(state);
  refreshSideContinuousEffects(state.sides.player, basicHpBonus);
  refreshSideContinuousEffects(state.sides.opponent, basicHpBonus);
}

function resolveContinuousKnockouts(state: GameState): void {
  let resolvedKnockout = true;
  while (resolvedKnockout && !state.gameOver) {
    resolvedKnockout = false;
    for (const sideId of ["player", "opponent"] as const) {
      const side = state.sides[sideId];
      const knockedOut = getAllPokemon(side).find((pokemon) => pokemon.hp <= 0);
      if (!knockedOut) continue;
      const scoringSideId: SideId = sideId === "player" ? "opponent" : "player";
      resolvedKnockout = knockOutPokemon(state, scoringSideId, sideId, knockedOut);
      if (resolvedKnockout) refreshContinuousHp(state);
      break;
    }
  }
}

function normalizeBoardState(state: GameState): void {
  normalizeSideBoard(state.sides.player);
  normalizeSideBoard(state.sides.opponent);
}

function normalizeSideBoard(side: SideState): void {
  const activeUid = side.active?.uid;
  const seen = new Set<number>();
  const cleanBench: PokemonInstance[] = [];
  const overflow: PokemonInstance[] = [];

  side.bench.forEach((pokemon) => {
    if (pokemon.uid === activeUid || seen.has(pokemon.uid)) return;
    seen.add(pokemon.uid);
    if (cleanBench.length < MAX_BENCH) {
      cleanBench.push(pokemon);
      return;
    }
    overflow.push(pokemon);
  });

  if (overflow.length > 0) {
    overflow.forEach((pokemon) => side.discard.push(pokemon.cardId));
  }
  side.bench = cleanBench;
}

function getStadiumBasicHpBonus(state: GameState): number {
  if (!state.stadium) return 0;
  const stadium = getCard(state.stadium.cardId);
  if (stadium.kind !== "trainer") return 0;
  return stadium.effect.basicHpBonus ?? 0;
}

function refreshSideContinuousEffects(side: SideState, basicHpBonus: number): void {
  const activeHpBonus = getAllPokemon(side).reduce((best, pokemon) => {
    const bonus = getPokemonCard(pokemon).ability?.activeHpBonus ?? 0;
    return Math.max(best, bonus);
  }, 0);

  getAllPokemon(side).forEach((pokemon) => {
    const card = getPokemonCard(pokemon);
    const printedHp = card.hp;
    const stadiumHpBonus = card.stage === 0 ? basicHpBonus : 0;
    const targetMaxHp = printedHp + stadiumHpBonus + (pokemon.uid === side.active?.uid ? activeHpBonus : 0);
    const damage = pokemon.maxHp - pokemon.hp;
    pokemon.maxHp = targetMaxHp;
    pokemon.hp = Math.max(0, Math.min(targetMaxHp, targetMaxHp - damage));
  });
}

function switchOutOpponentActive(
  state: GameState,
  actingSideId: SideId,
  pendingChoiceResume: Extract<PendingPlayerChoice, { kind: "switchAfterGust" }>["resume"] = "none",
): void {
  const opponent = getOpposingSide(state, actingSideId);
  if (!opponent.active) return;
  if (opponent.id === "player") {
    if (opponent.bench.length === 0) return;
    state.pendingPlayerChoice = {
      kind: "switchAfterGust",
      resume: pendingChoiceResume,
    };
    log(state, "Choose the benched Umamusume to switch in.");
    return;
  }
  const replacementIndex = choosePreferredActiveIndex(opponent);
  if (replacementIndex < 0) return;
  const replacement = opponent.bench.splice(replacementIndex, 1)[0];
  if (!replacement) return;
  const switchedOut = opponent.active;
  opponent.bench.push(switchedOut);
  opponent.active = replacement;
  log(state, `${actorName(opponent)} switched to ${formatPokemonInstanceName(replacement)}.`);
}

function choosePreferredActiveIndex(side: SideState): number {
  let bestIndex = -1;
  let bestScore = Number.NEGATIVE_INFINITY;

  side.bench.forEach((pokemon, index) => {
    const card = getPokemonCard(pokemon);
    const attack = getPrimaryAttack(card);
    const score = pokemon.hp + attachedEnergyCount(pokemon) * 20 + attack.damage - retreatCost(card.retreat) * 6;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function hasDamagedHealingTarget(side: SideState, card: TrainerCard): boolean {
  const targets = (card.effect.healTarget === "any" ? [side.active, ...side.bench] : [side.active]).filter((pokemon): pokemon is PokemonInstance => Boolean(pokemon));
  return targets.some((pokemon) => pokemon.hp < pokemon.maxHp);
}

function log(state: GameState, message: string): void {
  state.log.unshift(message);
  state.log = state.log.slice(0, 12);
}
