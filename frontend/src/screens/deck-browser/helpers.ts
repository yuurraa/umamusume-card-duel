import { CARD_RARITY_LABELS, getCardRarity, isCardDisabled, toBaseCardId } from "../../../../shared/src/cardRarity";
import { cards } from "../../../../shared/src/gameData";
import type { Card, CardRarity, EnergyType, TrainerType, UmamusumeType } from "../../../../shared/src/types";
import type { LocalDeck } from "../../../../shared/src/localDecks";
import type { PremadeDeck } from "../../types/ui";
import { inferDeckEnergyTypes, LOCAL_DECK_CACHE_STORAGE_KEY, normalizeDeckEnergyTypes } from "../../utils/deck";
import { getCard } from "../../game/engine";
import { formatCardName } from "../../game/engine/core/labels";

export const SELECTED_TICK = "\u2713";
export const DECK_CARD_COUNT = 20;
export const deckRows: number[][] = [
  [0, 1, 2, 3, 4, 5, 6],
  [7, 8, 9, 10, 11, 12, 13],
  [14, 15, 16, 17, 18, 19],
];
export type DeckEntity = PremadeDeck | LocalDeck;
export type DeckJsonPayload = { name: string; cardIds: string[]; coverCardId: string; energyTypes: EnergyType[] };

export type CategoryFilter = "umamusume" | "trainer" | "item" | "tool" | "stadium";
export type StageFilter = 0 | 1 | 2;
export type ArtFilter = "normal" | "fullArt";
export type RarityFilter = CardRarity;

export const categoryFilters: Array<{ id: CategoryFilter; label: string }> = [
  { id: "umamusume", label: "Umamusume" },
  { id: "trainer", label: "Trainer" },
  { id: "item", label: "Item" },
  { id: "tool", label: "Tool" },
  { id: "stadium", label: "Stadium" },
];

export const energyTypes: EnergyType[] = [
  "grass",
  "fire",
  "water",
  "lightning",
  "psychic",
  "fighting",
  "darkness",
  "steel",
  "colorless",
  "dragon",
];

export const generatedEnergyTypes: EnergyType[] = energyTypes.filter((type) => type !== "colorless");

export const stageFilters: Array<{ id: StageFilter; label: string }> = [
  { id: 0, label: "Basic" },
  { id: 1, label: "Stage 1" },
  { id: 2, label: "Stage 2" },
];

export const artFilters: Array<{ id: ArtFilter; label: string }> = [
  { id: "normal", label: "Normal Art" },
  { id: "fullArt", label: "Full Art" },
];

export const rarityFilters: Array<{ id: RarityFilter; label: string }> = [
  { id: "common", label: CARD_RARITY_LABELS.common },
  { id: "uncommon", label: CARD_RARITY_LABELS.uncommon },
  { id: "uncommonPlus", label: CARD_RARITY_LABELS.uncommonPlus },
  { id: "rare", label: CARD_RARITY_LABELS.rare },
  { id: "artRare", label: CARD_RARITY_LABELS.artRare },
  { id: "specialArtRare", label: CARD_RARITY_LABELS.specialArtRare },
  { id: "secretRare", label: CARD_RARITY_LABELS.secretRare },
  { id: "ultraRare", label: CARD_RARITY_LABELS.ultraRare },
];

export const cardEntries = Object.values(cards).sort((left, right) => {
  const groupSort = getCardSortGroup(left) - getCardSortGroup(right);
  if (groupSort !== 0) return groupSort;
  return formatCardName(left).localeCompare(formatCardName(right));
});

export function writeLocalDeckCache(localDecks: LocalDeck[]): void {
  if (typeof window === "undefined") return;
  const cache = localDecks.map((deck) => ({
    id: deck.id,
    name: deck.name,
    coverCardId: deck.coverCardId,
    cardIds: deck.cardIds,
    energyTypes: normalizeDeckEnergyTypes(deck.energyTypes),
  }));
  window.localStorage.setItem(LOCAL_DECK_CACHE_STORAGE_KEY, JSON.stringify(cache));
}

export function buildDeckJson(deck: DeckEntity): string {
  return `${JSON.stringify({ name: deck.name, cardIds: deck.cardIds, coverCardId: deck.coverCardId, energyTypes: getDeckSelectedEnergyTypes(deck) }, null, 2)}\n`;
}

export function parseDeckJson(text: string): { ok: true; payload: DeckJsonPayload } | { ok: false; error: string } {
  const raw = text.trim();
  if (!raw) return { ok: false, error: "JSON input is required." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Invalid JSON." };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "JSON root must be an object." };
  }

  const candidate = parsed as Record<string, unknown>;
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  if (!name) return { ok: false, error: "Deck name is required." };

  if (!Array.isArray(candidate.cardIds)) return { ok: false, error: "cardIds must be an array of card ids." };
  const cardIds = candidate.cardIds.filter((value): value is string => typeof value === "string" && value.length > 0);
  if (cardIds.length !== candidate.cardIds.length) return { ok: false, error: "cardIds must contain only non-empty strings." };
  if (cardIds.length !== DECK_CARD_COUNT) return { ok: false, error: `Deck must contain exactly ${DECK_CARD_COUNT} cards.` };

  for (const cardId of cardIds) {
    const card = cards[cardId];
    if (!card) return { ok: false, error: `Unknown card id: ${cardId}` };
    if (isCardDisabled(card)) return { ok: false, error: `${card.name} is not available for decks yet.` };
  }

  if (!cardIds.some((cardId) => {
    const card = cards[cardId];
    return card?.kind === "umamusume" && card.stage === 0;
  })) {
    return { ok: false, error: "Deck must contain at least 1 Basic Umamusume." };
  }

  const duplicateName = getDuplicateOverflowCardName(cardIds);
  if (duplicateName) return { ok: false, error: `Deck cannot contain more than 2 copies of ${duplicateName}.` };

  const candidateCover = typeof candidate.coverCardId === "string" ? candidate.coverCardId : "";
  const resolvedCoverCardId = candidateCover.length > 0 ? candidateCover : (cardIds[0] ?? "");
  if (!resolvedCoverCardId) return { ok: false, error: "Deck must contain at least 1 card." };
  const coverCard = cards[resolvedCoverCardId];
  if (!coverCard) return { ok: false, error: `Unknown card id: ${resolvedCoverCardId}` };
  if (isCardDisabled(coverCard)) return { ok: false, error: `${coverCard.name} is not available for decks yet.` };

  const energyTypes = parseDeckEnergyTypes(candidate.energyTypes, cardIds);
  if (!energyTypes.ok) return { ok: false, error: energyTypes.error };

  return { ok: true, payload: { name, cardIds, coverCardId: resolvedCoverCardId, energyTypes: energyTypes.value } };
}

export function getDeckSelectedEnergyTypes(deck: DeckEntity): EnergyType[] {
  const selected = normalizeDeckEnergyTypes(deck.energyTypes);
  return selected.length > 0 ? selected : inferDeckEnergyTypes(deck.cardIds);
}

function parseDeckEnergyTypes(value: unknown, cardIds: string[]): { ok: true; value: EnergyType[] } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: inferDeckEnergyTypes(cardIds) };
  if (!Array.isArray(value)) return { ok: false, error: "energyTypes must be an array of Energy type ids." };
  if (value.some((energyType) => typeof energyType !== "string")) return { ok: false, error: "energyTypes must contain only Energy type ids." };
  const normalized = normalizeDeckEnergyTypes(value as EnergyType[]);
  if (normalized.length !== value.length) return { ok: false, error: "energyTypes contains an unknown or duplicate Energy type." };
  if (normalized.length < 1 || normalized.length > 3) return { ok: false, error: "Deck must select 1 to 3 Energy types." };
  return { ok: true, value: normalized };
}

export function toEditableDeckSlots(cardIds: string[]): Array<string | null> {
  return Array.from({ length: DECK_CARD_COUNT }, (_, index) => cardIds[index] ?? null);
}

export function toggleSetValue<T>(selected: Set<T>, value: T): Set<T> {
  const next = new Set(selected);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

export function matchesAnyCategoryFilter(card: Card, filters: Set<CategoryFilter>): boolean {
  for (const filter of filters) {
    if (matchesCategoryFilter(card, filter)) return true;
  }
  return false;
}

function matchesCategoryFilter(card: Card, filter: CategoryFilter): boolean {
  if (filter === "umamusume") return card.kind === "umamusume";
  if (filter === "trainer") return card.kind === "trainer";
  return card.kind === "trainer" && card.trainerType === filter;
}

export function matchesAnyEnergyFilter(card: Card, filters: Set<EnergyType>): boolean {
  if (card.kind !== "umamusume") return true;
  return filters.has(toEnergyType(card.type));
}

export function matchesAnyStageFilter(card: Card, filters: Set<StageFilter>): boolean {
  if (card.kind !== "umamusume") return true;
  return filters.has(card.stage as StageFilter);
}

export function matchesAnyArtFilter(card: Card, filters: Set<ArtFilter>): boolean {
  return filters.has(isFullArtCard(card) ? "fullArt" : "normal");
}

export function matchesAnyRarityFilter(card: Card, filters: Set<RarityFilter>): boolean {
  return filters.has(getCardRarity(card));
}

function isFullArtCard(card: Card): boolean {
  const image = getCardImage(card);
  return card.id.endsWith("FullArt") || card.id.endsWith("FullArtGold") || image.includes("-fullart.") || image.includes("-fullart-gold.");
}

export function getCardImage(card: Card): string {
  return card.kind === "umamusume" ? card.portrait : card.image;
}

function getCardSortGroup(card: Card): number {
  if (card.kind === "umamusume") return 0;
  if (card.trainerType === "item") return 1;
  if (card.trainerType === "tool") return 2;
  if (card.trainerType === "supporter") return 3;
  return 4;
}

export function sortDeckCardIds(cardIds: string[]): string[] {
  return [...cardIds].sort((leftId, rightId) => {
    const left = cards[leftId];
    const right = cards[rightId];
    if (!left || !right) return asciiCompare(leftId, rightId);

    const groupSort = getCardSortGroup(left) - getCardSortGroup(right);
    if (groupSort !== 0) return groupSort;

    if (left.kind === "umamusume" && right.kind === "umamusume") {
      const speciesSort = asciiCompare(left.species, right.species);
      if (speciesSort !== 0) return speciesSort;

      const stageSort = left.stage - right.stage; // Basic -> Stage 1 -> Stage 2
      if (stageSort !== 0) return stageSort;

      const artSort = Number(isFullArtCard(left)) - Number(isFullArtCard(right)); // Normal -> Full Art
      if (artSort !== 0) return artSort;
    }

    // Alphabetical fallback (numbers sort before letters in ASCII, e.g. 3star... before A...)
    return asciiCompare(leftId, rightId);
  });
}

export function getSearchText(card: Card): string {
  if (card.kind === "trainer") {
    return [
      card.name,
      card.label,
      card.trainerType,
      trainerTypeLabel(card.trainerType),
      CARD_RARITY_LABELS[getCardRarity(card)],
      card.text,
    ].join(" ").toLowerCase();
  }

  return [
    card.name,
    card.label,
    card.species,
    card.type,
    CARD_RARITY_LABELS[getCardRarity(card)],
    card.evolvesFrom ?? "",
    card.ability?.name ?? "",
    card.ability?.text ?? "",
    card.attacks.map((attack) => `${attack.name} ${attack.text}`).join(" "),
  ].join(" ").toLowerCase();
}

function asciiCompare(left: string, right: string): number {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  return 0;
}

function trainerTypeLabel(type: TrainerType): string {
  if (type === "supporter") return "Supporter";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function toEnergyType(type: UmamusumeType): EnergyType {
  return type.toLowerCase() as EnergyType;
}

export function toDeckCountKey(cardId: string): string {
  return toBaseCardId(cardId);
}

export function getDuplicateOverflowCardName(cardIds: string[]): string | null {
  const counts = new Map<string, number>();
  for (const cardId of cardIds) {
    const key = toDeckCountKey(cardId);
    const nextCount = (counts.get(key) ?? 0) + 1;
    if (nextCount > 2) return getCard(cardId).name;
    counts.set(key, nextCount);
  }
  return null;
}
