import type { Card } from "./types";

export const LOCAL_DECK_FORMAT_VERSION = 1;
export const DECK_CARD_COUNT = 20;

export type LocalDeck = {
  id: string;
  name: string;
  coverCardId: string;
  cardIds: string[];
  formatVersion: typeof LOCAL_DECK_FORMAT_VERSION;
  createdAt: string;
  updatedAt: string;
};

export type LocalDeckInput = {
  name: string;
  coverCardId?: string;
  cardIds: string[];
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

  return {
    id: deckId,
    name: input.name.trim(),
    coverCardId: resolvedCoverCardId,
    cardIds: [...input.cardIds],
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
  if (deck.cardIds.length !== DECK_CARD_COUNT) return { ok: false, reason: `Deck must contain exactly ${DECK_CARD_COUNT} cards.` };
  if (!allCards[deck.coverCardId]) return { ok: false, reason: "Deck coverCardId does not reference a known card." };

  for (const cardId of deck.cardIds) {
    if (!allCards[cardId]) return { ok: false, reason: `Unknown card id in deck: ${cardId}` };
  }

  if (deck.formatVersion !== LOCAL_DECK_FORMAT_VERSION) {
    return { ok: false, reason: `Unsupported deck format version: ${deck.formatVersion}` };
  }

  return { ok: true };
}

