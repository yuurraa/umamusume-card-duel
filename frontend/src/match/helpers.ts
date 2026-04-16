import type { GameState, PokemonInstance, SideState } from "../../../shared/src/types";
import { canAttachEnergyToPokemon, getAllPokemon, getCard, getDamagedPokemon, getEvolutionTargets } from "../game/engine";
import type { ActionNoticeSource, PendingSelection } from "../types/ui";
import { formatCardDisplayName, formatNameList } from "../utils/format";

export function createSetupPreviewSide(side: SideState, activeIndex: number | null, benchIndexes: number[]): SideState {
  const activeCardId = activeIndex === null ? null : getSetupPreviewPokemonCardId(side.hand[activeIndex]);
  return {
    ...side,
    active: activeCardId ? createSetupPreviewPokemon(activeCardId, -1) : null,
    bench: benchIndexes
      .map((index, order) => {
        const cardId = getSetupPreviewPokemonCardId(side.hand[index]);
        return cardId ? createSetupPreviewPokemon(cardId, -(order + 2)) : null;
      })
      .filter((pokemon): pokemon is PokemonInstance => Boolean(pokemon)),
  };
}

export function createSetupHiddenOpponentSide(side: SideState): SideState {
  return { ...side, bench: [] };
}

function getSetupPreviewPokemonCardId(cardId?: string): string | null {
  if (!cardId) return null;
  const card = getCard(cardId);
  return card.kind === "pokemon" ? cardId : null;
}

function createSetupPreviewPokemon(cardId: string, uid: number): PokemonInstance {
  const card = getCard(cardId);
  if (card.kind !== "pokemon") throw new Error(`Expected pokemon card for setup preview: ${cardId}`);
  return {
    uid,
    cardId,
    species: card.species,
    stage: card.stage,
    hp: card.hp,
    maxHp: card.hp,
    energies: { grass: 0, fire: 0, water: 0, lightning: 0, psychic: 0, fighting: 0, darkness: 0, steel: 0, colorless: 0, dragon: 0 },
    enteredTurn: 0,
    evolvedTurn: null,
    tookDamageLastTurn: false,
    tookDamageThisTurn: false,
    nextTurnDamageReduction: 0,
    usedAbilityThisTurn: false,
  };
}

export function getSelectablePokemonUids(game: GameState, pending: PendingSelection | null): Set<number> | undefined {
  if (!pending) return undefined;
  const player = game.sides.player;
  if (pending.kind === "attachEnergy") {
    return new Set(
      getAllPokemon(player)
        .filter((pokemon) => canAttachEnergyToPokemon(game, player, pokemon))
        .map((pokemon) => pokemon.uid),
    );
  }
  if (pending.kind === "attackHealTarget") return new Set(getDamagedPokemon(player).map((pokemon) => pokemon.uid));
  if (pending.kind === "moveEnergyAbility") return undefined;
  if (pending.kind === "retreatTarget") return new Set(player.bench.map((pokemon) => pokemon.uid));
  if (pending.kind === "replaceActive") return new Set(player.bench.map((pokemon) => pokemon.uid));
  if (pending.kind === "healTarget") {
    const cardId = player.hand[pending.handIndex];
    const card = cardId ? getCard(cardId) : undefined;
    if (!card || card.kind !== "trainer") return undefined;
    const targets = card.effect.healTarget === "active" ? (player.active ? [player.active] : []) : getAllPokemon(player);
    return new Set(targets.map((pokemon) => pokemon.uid));
  }
  if (pending.kind === "evolveTarget") {
    const cardId = player.hand[pending.handIndex];
    const card = cardId ? getCard(cardId) : undefined;
    if (!card || card.kind !== "pokemon") return undefined;
    return new Set(getEvolutionTargets(game, player, card).map((pokemon) => pokemon.uid));
  }
  return undefined;
}

export function getOpponentStepDelay(game: GameState): number {
  if (game.opponentTurnStep === "attack" || game.opponentTurnStep === "finish") return 1400;
  return 1260;
}

export function getOpponentBannerMessage(game: GameState): string {
  if (game.pendingPlayerChoice) return game.log[0] ?? "Opponent waited for your choice.";
  const latest = game.log[0];
  if (latest && (latest.includes("Opponent") || latest.includes("coin flip"))) return latest;
  return "Opponent planned their turn.";
}

export function getOpponentAttackNotice(game: GameState): string | null {
  return game.log.find((entry) => entry.startsWith("Opponent attacked with ") || entry === "Opponent did not attack.") ?? null;
}

export function getActionNotice(previous: GameState, next: GameState, source: ActionNoticeSource): string | null {
  const gainedCards = getHandAdditions(previous.sides.player.hand, next.sides.player.hand).map((cardId) => formatCardDisplayName(getCard(cardId)));
  if (source.kind === "makeDebutScout") {
    return gainedCards.length > 0
      ? `You discarded ${source.discardedCardName} and obtained ${formatNameList(gainedCards)}.`
      : `You discarded ${source.discardedCardName} and obtained no Umamusume.`;
  }
  if (gainedCards.length > 0) return `You obtained ${formatNameList(gainedCards)}.`;
  if (source.kind === "traineeScoutTicket") return "You have no more Basic Umamusume in your deck.";
  return null;
}

function getHandAdditions(previousHand: string[], nextHand: string[]): string[] {
  const previousCounts = new Map<string, number>();
  previousHand.forEach((cardId) => previousCounts.set(cardId, (previousCounts.get(cardId) ?? 0) + 1));
  return nextHand.filter((cardId) => {
    const remaining = previousCounts.get(cardId) ?? 0;
    if (remaining > 0) {
      previousCounts.set(cardId, remaining - 1);
      return false;
    }
    return true;
  });
}
