import { isCardDisabled, toBaseCardId } from "./cardRarity";
import type { Card, EnergyType } from "./types";

export const LOCAL_DECK_FORMAT_VERSION = 1;
export const DECK_CARD_COUNT = 20;

export type LocalDeck = {
  id: string;
  name: string;
  coverCardId: string;
  cardIds: string[];
  energyTypes?: EnergyType[];
  formatVersion: typeof LOCAL_DECK_FORMAT_VERSION;
  createdAt: string;
  updatedAt: string;
};

export type LocalDeckInput = {
  name: string;
  coverCardId?: string;
  cardIds: string[];
  energyTypes?: EnergyType[];
};

export function normalizeDeckId(rawId: string): string {
  return rawId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createDeckIdFromName(name: string): string {
  const normalized = normalizeDeckId(name);
  return normalized.length > 0 ? normalized : "deck";
}

export function buildLocalDeck(
  deckId: string,
  input: LocalDeckInput,
  nowIso: string,
  previous?: LocalDeck,
): LocalDeck {
  const resolvedCoverCardId = input.coverCardId && input.coverCardId.length > 0
    ? input.coverCardId
    : (input.cardIds[0] ?? "");

  const energyTypes = input.energyTypes ? normalizeEnergyTypes(input.energyTypes) : previous?.energyTypes;

  return {
    id: deckId,
    name: input.name.trim(),
    coverCardId: resolvedCoverCardId,
    cardIds: [...input.cardIds],
    ...(energyTypes ? { energyTypes } : {}),
    formatVersion: LOCAL_DECK_FORMAT_VERSION,
    createdAt: previous?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
}

export function validateLocalDeck(
  deck: LocalDeck,
  allCards: Record<string, Card>,
): { ok: true } | { ok: false; reason: string } {
  if (!deck.id || normalizeDeckId(deck.id).length === 0) return { ok: false, reason: "Deck id is invalid." };
  if (!deck.name || deck.name.trim().length === 0) return { ok: false, reason: "Deck name is required." };
  if (!Array.isArray(deck.cardIds)) return { ok: false, reason: "Deck cardIds must be an array." };
  if (deck.energyTypes !== undefined) {
    const energyValidity = validateEnergyTypes(deck.energyTypes);
    if (!energyValidity.ok) return energyValidity;
  }
  if (deck.cardIds.length !== DECK_CARD_COUNT) return { ok: false, reason: `Deck must contain exactly ${DECK_CARD_COUNT} cards.` };
  const coverCard = resolveDeckCard(deck.coverCardId, allCards);
  if (!coverCard) return { ok: false, reason: `Unknown deck cover card id: ${deck.coverCardId}` };
  if (isCardDisabled(coverCard)) return { ok: false, reason: `${coverCard.name} is not available for decks yet.` };

  let hasBasicUmamusume = false;
  const countsByKey = new Map<string, number>();
  for (const cardId of deck.cardIds) {
    const card = resolveDeckCard(cardId, allCards);
    if (!card) return { ok: false, reason: `Unknown card id in deck: ${cardId}` };
    if (isCardDisabled(card)) return { ok: false, reason: `${card.name} is not available for decks yet.` };
    if (card.kind === "umamusume" && card.stage === 0) hasBasicUmamusume = true;
    const key = toDeckCountKey(cardId);
    const nextCount = (countsByKey.get(key) ?? 0) + 1;
    if (nextCount > 2) return { ok: false, reason: `Deck cannot contain more than 2 copies of ${card.name}.` };
    countsByKey.set(key, nextCount);
  }
  if (!hasBasicUmamusume) return { ok: false, reason: "Deck must contain at least 1 Basic Umamusume." };

  if (deck.formatVersion !== LOCAL_DECK_FORMAT_VERSION) {
    return { ok: false, reason: `Unsupported deck format version: ${deck.formatVersion}` };
  }

  return { ok: true };
}

function normalizeEnergyTypes(energyTypes: EnergyType[]): EnergyType[] {
  return [...new Set(energyTypes)].filter((type) => VALID_ENERGY_TYPES.has(type));
}

function validateEnergyTypes(energyTypes: unknown): { ok: true } | { ok: false; reason: string } {
  if (!Array.isArray(energyTypes)) return { ok: false, reason: "Deck energyTypes must be an array." };
  if (energyTypes.length < 1 || energyTypes.length > 3) return { ok: false, reason: "Deck must select 1 to 3 Energy types." };
  const seen = new Set<EnergyType>();
  for (const energyType of energyTypes) {
    if (typeof energyType !== "string" || !VALID_ENERGY_TYPES.has(energyType as EnergyType)) {
      return { ok: false, reason: `Unknown deck Energy type: ${String(energyType)}` };
    }
    if (seen.has(energyType as EnergyType)) return { ok: false, reason: "Deck Energy types must be unique." };
    seen.add(energyType as EnergyType);
  }
  return { ok: true };
}

const VALID_ENERGY_TYPES = new Set<EnergyType>([
  "grass",
  "fire",
  "water",
  "lightning",
  "psychic",
  "fighting",
  "darkness",
  "steel",
  "dragon",
]);

function toDeckCountKey(cardId: string): string {
  const normalized = toBaseCardId(cardId);
  return COUNT_KEY_ALIASES[normalized] ?? normalized;
}

function resolveDeckCard(cardId: string, allCards: Record<string, Card>): Card | undefined {
  const direct = allCards[cardId];
  if (direct) return direct;

  const alias = CARD_ID_ALIASES[cardId];
  if (!alias) return undefined;
  return allCards[alias];
}

const CARD_ID_ALIASES: Record<string, string> = {
  makeDebutScout: "3starMakeDebutScout",
  makeDebutScoutFullArt: "3starMakeDebutScoutFullArtGold",
  makeDebutScoutFullArtGold: "3starMakeDebutScoutFullArtGold",
  "3starMakeDebutScout": "makeDebutScout",
  "3starMakeDebutScoutFullArt": "3starMakeDebutScoutFullArtGold",
  "3starMakeDebutScoutFullArtGold": "makeDebutScoutFullArtGold",
  "rainbowUncapCrystalFullArt": "rainbowUncapCrystalFullArtGold",
};

const COUNT_KEY_ALIASES: Record<string, string> = {
  makeDebutScout: "3starMakeDebutScout",
};
