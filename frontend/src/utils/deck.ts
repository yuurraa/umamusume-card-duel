import { defaultPlayerDeckId, premadeDecks } from "../../../shared/src/gameData";
import { getCard } from "../game/engine";
import type { EnergyType, PokemonType } from "../../../shared/src/types";
import type { PremadeDeck } from "../types/ui";

const EQUIPPED_DECK_STORAGE_KEY = "umamusume-tcg-pocket-equipped-deck";

const DECK_TYPE_TO_ENERGY: Record<PokemonType, EnergyType> = {
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

export function getDeckById(deckId: string): PremadeDeck {
  return premadeDecks.find((deck) => deck.id === deckId)
    ?? premadeDecks.find((deck) => deck.id === defaultPlayerDeckId)
    ?? premadeDecks[0]
    ?? { id: defaultPlayerDeckId, name: "Deck", coverCardId: "mihonoBourbonStage2", cardIds: [] };
}

export function readEquippedDeckId(): string {
  if (typeof window === "undefined") return defaultPlayerDeckId;
  const stored = window.localStorage.getItem(EQUIPPED_DECK_STORAGE_KEY);
  return stored && premadeDecks.some((deck) => deck.id === stored) ? stored : defaultPlayerDeckId;
}

export function writeEquippedDeckId(deckId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EQUIPPED_DECK_STORAGE_KEY, deckId);
}

export function pickRandomOpponentDeck(): PremadeDeck {
  return premadeDecks[Math.floor(Math.random() * premadeDecks.length)] ?? premadeDecks[0]!;
}

export function getDeckCoverCard(deck: PremadeDeck) {
  const card = getCard(deck.coverCardId);
  if (card.kind !== "pokemon") throw new Error(`Deck cover card must be a pokemon: ${deck.coverCardId}`);
  return card;
}

export function getDeckEnergyTypes(deck: PremadeDeck): EnergyType[] {
  const types = new Set<EnergyType>();
  const displayOrder: EnergyType[] = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "steel", "colorless", "dragon"];
  deck.cardIds.forEach((cardId) => {
    const card = getCard(cardId);
    if (card.kind === "pokemon") types.add(DECK_TYPE_TO_ENERGY[card.type]);
  });
  return displayOrder.filter((type) => types.has(type));
}
