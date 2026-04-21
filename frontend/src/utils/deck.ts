import { defaultPlayerDeckId, premadeDecks } from "../../../shared/src/gameData";
import { getCard } from "../game/engine";
import type { EnergyType, UmamusumeType } from "../../../shared/src/types";
import type { PremadeDeck } from "../types/ui";

const EQUIPPED_DECK_STORAGE_KEY = "umamusume-tcg-pocket-equipped-deck";
export const LOCAL_DECK_CACHE_STORAGE_KEY = "umamusume-tcg-pocket-local-decks-cache";
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
    ?? readCachedLocalDecks().find((deck) => deck.id === resolvedDeckId)
    ?? premadeDecks.find((deck) => deck.id === defaultPlayerDeckId)
    ?? premadeDecks[0]
    ?? { id: defaultPlayerDeckId, name: "Deck", coverCardId: "mihonoBourbonStage2", cardIds: [] };
}

export function readEquippedDeckId(): string {
  if (typeof window === "undefined") return defaultPlayerDeckId;
  const stored = window.localStorage.getItem(EQUIPPED_DECK_STORAGE_KEY);
  if (!stored) return defaultPlayerDeckId;
  const resolvedDeckId = LEGACY_DECK_ID_MAP[stored] ?? stored;
  const exists = premadeDecks.some((deck) => deck.id === resolvedDeckId)
    || readCachedLocalDecks().some((deck) => deck.id === resolvedDeckId);
  return exists ? resolvedDeckId : defaultPlayerDeckId;
}

export function writeEquippedDeckId(deckId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EQUIPPED_DECK_STORAGE_KEY, deckId);
}

export function pickRandomOpponentDeck(): PremadeDeck {
  return premadeDecks[Math.floor(Math.random() * premadeDecks.length)] ?? premadeDecks[0]!;
}

export function getDeckCoverCard(deck: PremadeDeck) {
  const explicit = tryGetCard(deck.coverCardId);
  if (explicit) return explicit;

  for (const cardId of deck.cardIds) {
    const candidate = tryGetCard(cardId);
    if (candidate) return candidate;
  }

  const fallbackCoverCardId = premadeDecks[0]?.coverCardId;
  if (fallbackCoverCardId) {
    const fallbackCard = tryGetCard(fallbackCoverCardId);
    if (fallbackCard) return fallbackCard;
  }

  return getCard("mihonoBourbonStage2");
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

function readCachedLocalDecks(): PremadeDeck[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(LOCAL_DECK_CACHE_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{ id: string; name: string; coverCardId: string; cardIds: string[] }>;
    return parsed.filter((deck) => Boolean(deck.id) && Boolean(deck.name) && Boolean(deck.coverCardId) && Array.isArray(deck.cardIds));
  } catch {
    return [];
  }
}

function tryGetCard(cardId: string) {
  try {
    return getCard(cardId);
  } catch {
    return null;
  }
}
