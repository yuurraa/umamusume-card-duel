import { aiPremadeDecks, defaultPlayerDeckId, premadeDecks } from "../../../shared/src/gameData";
import { getCard } from "../game/engine";
import type { EnergyType, UmamusumeType } from "../../../shared/src/types";
import type { PremadeDeck } from "../types/ui";
import { devUnlocksEnabled } from "../config/devUnlocks";

const EQUIPPED_DECK_STORAGE_KEY = "umamusume-tcg-pocket-equipped-deck";
export const LOCAL_DECK_CACHE_STORAGE_KEY = "umamusume-tcg-pocket-local-decks-cache";
const LEGACY_DECK_ID_MAP: Record<string, string> = {
  matikanetannhauserNiceNature: "matikanetannhauser",
  riceShowerHaruUrara: "riceShower",
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
  const selectablePremadeDecks = devUnlocksEnabled ? aiPremadeDecks : premadeDecks;
  const defaultSelectableDeckId = selectablePremadeDecks.find((deck) => deck.id === defaultPlayerDeckId)?.id
    ?? selectablePremadeDecks[0]?.id
    ?? defaultPlayerDeckId;
  const localDecks = devUnlocksEnabled ? readCachedLocalDecks() : [];
  return selectablePremadeDecks.find((deck) => deck.id === resolvedDeckId)
    ?? localDecks.find((deck) => deck.id === resolvedDeckId)
    ?? selectablePremadeDecks.find((deck) => deck.id === defaultSelectableDeckId)
    ?? selectablePremadeDecks[0]
    ?? { id: defaultPlayerDeckId, name: "Deck", coverCardId: "matikanetannhauserStage2", cardIds: [] };
}

export function readEquippedDeckId(): string {
  const selectablePremadeDecks = devUnlocksEnabled ? aiPremadeDecks : premadeDecks;
  const defaultSelectableDeckId = selectablePremadeDecks.find((deck) => deck.id === defaultPlayerDeckId)?.id
    ?? selectablePremadeDecks[0]?.id
    ?? defaultPlayerDeckId;
  if (typeof window === "undefined") return defaultSelectableDeckId;
  const stored = window.localStorage.getItem(EQUIPPED_DECK_STORAGE_KEY);
  if (!stored) return defaultSelectableDeckId;
  const resolvedDeckId = LEGACY_DECK_ID_MAP[stored] ?? stored;
  const localDecks = devUnlocksEnabled ? readCachedLocalDecks() : [];
  const exists = selectablePremadeDecks.some((deck) => deck.id === resolvedDeckId)
    || localDecks.some((deck) => deck.id === resolvedDeckId);
  return exists ? resolvedDeckId : defaultSelectableDeckId;
}

export function writeEquippedDeckId(deckId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EQUIPPED_DECK_STORAGE_KEY, deckId);
}

export function pickRandomOpponentDeck(): PremadeDeck {
  return aiPremadeDecks[Math.floor(Math.random() * aiPremadeDecks.length)] ?? aiPremadeDecks[0] ?? premadeDecks[0]!;
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

  return getCard("matikanetannhauserStage2");
}

export function getDeckEnergyTypes(deck: PremadeDeck): EnergyType[] {
  const selectedTypes = normalizeDeckEnergyTypes(deck.energyTypes);
  if (selectedTypes.length > 0) return selectedTypes;
  return inferDeckEnergyTypes(deck.cardIds);
}

export function inferDeckEnergyTypes(cardIds: string[]): EnergyType[] {
  const types = new Set<EnergyType>();
  const displayOrder: EnergyType[] = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "steel", "dragon"];
  cardIds.forEach((cardId) => {
    const card = getCard(cardId);
    if (card.kind === "umamusume") types.add(DECK_TYPE_TO_ENERGY[card.type]);
  });
  const inferredTypes = displayOrder.filter((type) => types.has(type)).slice(0, 3);
  return inferredTypes.length > 0 ? inferredTypes : ["psychic"];
}

export function normalizeDeckEnergyTypes(energyTypes: readonly EnergyType[] | undefined): EnergyType[] {
  if (!energyTypes) return [];
  const displayOrder: EnergyType[] = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "steel", "dragon"];
  const selected = new Set(energyTypes);
  return displayOrder.filter((type) => selected.has(type)).slice(0, 3);
}

function readCachedLocalDecks(): PremadeDeck[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(LOCAL_DECK_CACHE_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{ id: string; name: string; coverCardId: string; cardIds: string[]; energyTypes?: EnergyType[] }>;
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
