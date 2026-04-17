import { defaultPlayerDeckId, premadeDecks } from "../../../shared/src/gameData";
import { getCard } from "../game/engine";
import type { EnergyType, UmamusumeType } from "../../../shared/src/types";
import type { PremadeDeck } from "../types/ui";

const EQUIPPED_DECK_STORAGE_KEY = "umamusume-tcg-pocket-equipped-deck";
const LEGACY_DECK_ID_MAP: Record<string, string> = {
  agnesTachyon: "agnesDigital",
};

const DECK_TYPE_TO_ENERGY: Record<UmamusumeType, EnergyType> = {
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
  const resolvedDeckId = LEGACY_DECK_ID_MAP[deckId] ?? deckId;
  return premadeDecks.find((deck) => deck.id === resolvedDeckId)
    ?? premadeDecks.find((deck) => deck.id === defaultPlayerDeckId)
    ?? premadeDecks[0]
    ?? { id: defaultPlayerDeckId, name: "Deck", coverCardId: "mihonoBourbonStage2", cardIds: [] };
}

export function readEquippedDeckId(): string {
  if (typeof window === "undefined") return defaultPlayerDeckId;
  const stored = window.localStorage.getItem(EQUIPPED_DECK_STORAGE_KEY);
  if (!stored) return defaultPlayerDeckId;
  const resolvedDeckId = LEGACY_DECK_ID_MAP[stored] ?? stored;
  return premadeDecks.some((deck) => deck.id === resolvedDeckId) ? resolvedDeckId : defaultPlayerDeckId;
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
  if (card.kind !== "umamusume") throw new Error(`Deck cover card must be a umamusume: ${deck.coverCardId}`);
  return card;
}

export function getDeckEnergyTypes(deck: PremadeDeck): EnergyType[] {
  const types = new Set<EnergyType>();
  const displayOrder: EnergyType[] = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "steel", "colorless", "dragon"];
  deck.cardIds.forEach((cardId) => {
    const card = getCard(cardId);
    if (card.kind === "umamusume") types.add(DECK_TYPE_TO_ENERGY[card.type]);
  });
  return displayOrder.filter((type) => types.has(type));
}
