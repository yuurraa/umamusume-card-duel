import { createDeckIdFromName, type LocalDeck } from "../../../../shared/src/localDecks";
import type { EnergyType } from "../../../../shared/src/types";
import type { PremadeDeck } from "../../types/ui";
import { getCard } from "../../game/engine";
import { energyLabel } from "../../game/engine/core/labels";
import { getDeckEnergyTypes, normalizeDeckEnergyTypes } from "../../utils/deck";
import { DECK_CARD_COUNT, type DeckEntity, getSearchText } from "./helpers";

const CREATE_DECK_DRAFTS_STORAGE_KEY = "umamusume-deck-editor-draft-create-list";
const EDIT_DECK_DRAFT_STORAGE_KEY = "umamusume-deck-editor-draft-edit";
const FAVORITE_DECKS_STORAGE_KEY = "umamusume-deck-browser-favorite-decks";
const EDITED_PREMADE_DECK_ID_SUFFIX = "-edited";

export type DeckSource = "premade" | "premadeEdited" | "local" | "draft";
export type DeckRef = { id: string; source: DeckSource };
export type DeckListFilter = "favorites" | "premade" | "created" | "drafts";
export type DeckListSortKey = "recommended" | "name" | "updated";

export const deckListFilters: Array<{ id: DeckListFilter; label: string }> = [
  { id: "favorites", label: "Favorites" },
  { id: "premade", label: "Premade" },
  { id: "created", label: "Created" },
  { id: "drafts", label: "Drafts" },
];

export const deckListSorts: Array<{ id: DeckListSortKey; label: string }> = [
  { id: "recommended", label: "Recommended" },
  { id: "name", label: "Name" },
  { id: "updated", label: "Updated" },
];

export type DeckEditorDraft = {
  name: string;
  cardIds: Array<string | null>;
  selectedCoverCardId: string | null;
  energyTypes: EnergyType[];
};

export type DeckEditorSnapshot = {
  name: string;
  cardIds: Array<string | null>;
  selectedCoverCardId: string | null;
  energyTypes: EnergyType[];
};

export function readCreateDraftDecks(): LocalDeck[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(CREATE_DECK_DRAFTS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LocalDeck[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((deck) => {
      if (!deck || typeof deck !== "object") return false;
      if (typeof deck.id !== "string" || deck.id.length === 0) return false;
      if (typeof deck.name !== "string" || deck.name.length === 0) return false;
      if (typeof deck.coverCardId !== "string" || deck.coverCardId.length === 0) return false;
      if (!Array.isArray(deck.cardIds) || deck.cardIds.some((cardId) => typeof cardId !== "string")) return false;
      if (deck.energyTypes !== undefined && !Array.isArray(deck.energyTypes)) return false;
      if (typeof deck.createdAt !== "string" || typeof deck.updatedAt !== "string") return false;
      return true;
    });
  } catch {
    return [];
  }
}

export function writeCreateDraftDecks(drafts: LocalDeck[]): void {
  if (typeof window === "undefined") return;
  if (drafts.length === 0) {
    window.localStorage.removeItem(CREATE_DECK_DRAFTS_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(CREATE_DECK_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
}

export function readFavoriteDeckKeys(): Set<string> {
  if (typeof window === "undefined") return new Set();
  const raw = window.localStorage.getItem(FAVORITE_DECKS_STORAGE_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === "string" && value.length > 0));
  } catch {
    return new Set();
  }
}

export function writeFavoriteDeckKeys(deckKeys: Set<string>): void {
  if (typeof window === "undefined") return;
  if (deckKeys.size === 0) {
    window.localStorage.removeItem(FAVORITE_DECKS_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(FAVORITE_DECKS_STORAGE_KEY, JSON.stringify([...deckKeys]));
}

export function readEditDeckDrafts(): Record<string, DeckEditorDraft> {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(EDIT_DECK_DRAFT_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, DeckEditorDraft>;
    if (!parsed || typeof parsed !== "object") return {};
    const next: Record<string, DeckEditorDraft> = {};
    for (const [deckId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      if (typeof value.name !== "string") continue;
      if (!Array.isArray(value.cardIds) || value.cardIds.length !== DECK_CARD_COUNT) continue;
      if (value.cardIds.some((cardId) => cardId !== null && typeof cardId !== "string")) continue;
      if (value.selectedCoverCardId !== null && typeof value.selectedCoverCardId !== "string") continue;
      if (value.energyTypes !== undefined && !Array.isArray(value.energyTypes)) continue;
      const energyTypes = normalizeDeckEnergyTypes(
        value.energyTypes?.filter((energyType): energyType is EnergyType => typeof energyType === "string"),
      );
      next[deckId] = {
        name: value.name,
        cardIds: [...value.cardIds],
        selectedCoverCardId: value.selectedCoverCardId,
        energyTypes: energyTypes.length > 0 ? energyTypes : ["psychic"],
      };
    }
    return next;
  } catch {
    return {};
  }
}

export function writeEditDeckDrafts(drafts: Record<string, DeckEditorDraft>): void {
  if (typeof window === "undefined") return;
  if (Object.keys(drafts).length === 0) {
    window.localStorage.removeItem(EDIT_DECK_DRAFT_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(EDIT_DECK_DRAFT_STORAGE_KEY, JSON.stringify(drafts));
}

export function normalizeDeckNameForCompare(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function resolveDraftCoverCardId(draft: DeckEditorDraft): string {
  return draft.selectedCoverCardId
    ?? draft.cardIds.find((cardId): cardId is string => Boolean(cardId))
    ?? "matikanetannhauserStage2";
}

export function sameEnergyTypes(left: EnergyType[], right: EnergyType[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((type, index) => type === right[index]);
}

export function normalizeEditDraftEnergyTypes(drafts: Record<string, DeckEditorDraft>): Record<string, DeckEditorDraft> {
  return Object.fromEntries(Object.entries(drafts).map(([deckId, draft]) => {
    const energyTypes = normalizeDeckEnergyTypes(draft.energyTypes);
    return [deckId, { ...draft, energyTypes: energyTypes.length > 0 ? energyTypes : ["psychic"] }];
  }));
}

export function buildCreateDraftDeckId(
  deckName: string,
  createDraftDecks: LocalDeck[],
  editDraftByDeckId: Record<string, DeckEditorDraft>,
): string {
  const existingIds = new Set([
    ...createDraftDecks.map((deck) => deck.id),
    ...Object.keys(editDraftByDeckId),
  ]);
  const base = createDeckIdFromName(deckName);
  let candidate = base;
  let suffix = 1;
  while (existingIds.has(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

export function getEditedPremadeDeckId(deckId: string): string {
  return `${deckId}${EDITED_PREMADE_DECK_ID_SUFFIX}`;
}

export function getEditDraftKeyForDeck(deck: DeckEntity & { source: DeckSource }): string {
  return deck.source === "premade" ? getEditedPremadeDeckId(deck.id) : deck.id;
}

export function getPremadeDeckIdFromEditedDeckId(deckId: string): string {
  return deckId.endsWith(EDITED_PREMADE_DECK_ID_SUFFIX)
    ? deckId.slice(0, -EDITED_PREMADE_DECK_ID_SUFFIX.length)
    : deckId;
}

export function isEditedPremadeDeckId(deckId: string, premadeDecks: PremadeDeck[]): boolean {
  return premadeDecks.some((deck) => getEditedPremadeDeckId(deck.id) === deckId);
}

export function toDeckFavoriteKey(deck: DeckEntity & { source: DeckSource }): string {
  if (deck.source === "premadeEdited") return `premade:${getPremadeDeckIdFromEditedDeckId(deck.id)}`;
  return `${deck.source}:${deck.id}`;
}

export function getDeckSearchText(deck: DeckEntity & { source: DeckSource }): string {
  const sourceLabel = deck.source === "premade" || deck.source === "premadeEdited" ? "premade" : deck.source === "local" ? "created custom" : "draft";
  return [
    deck.name,
    sourceLabel,
    getDeckEnergyTypes(deck).map(energyLabel).join(" "),
    ...deck.cardIds.map((cardId) => {
      try {
        return getSearchText(getCard(cardId));
      } catch {
        return cardId;
      }
    }),
  ].join(" ").toLowerCase();
}

export function sortDeckBrowserDecks<T extends DeckEntity & { source: DeckSource }>(
  decks: T[],
  favoriteDeckKeys: Set<string>,
  sortKey: DeckListSortKey,
  direction: "asc" | "desc",
): T[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...decks].sort((left, right) => {
    const favoriteSort = Number(favoriteDeckKeys.has(toDeckFavoriteKey(right))) - Number(favoriteDeckKeys.has(toDeckFavoriteKey(left)));
    if (favoriteSort !== 0) return favoriteSort;
    if (sortKey === "name") return left.name.localeCompare(right.name) * multiplier;
    if (sortKey === "updated") return (getDeckUpdatedAt(left).localeCompare(getDeckUpdatedAt(right)) || left.name.localeCompare(right.name)) * multiplier;
    return getDeckRecommendedRank(left) - getDeckRecommendedRank(right)
      || getDeckSourceRank(left.source) - getDeckSourceRank(right.source)
      || left.name.localeCompare(right.name);
  });
}

function getDeckRecommendedRank(deck: DeckEntity & { source: DeckSource }): number {
  if (deck.source === "local") return 0;
  if (deck.source === "draft") return 1;
  if (deck.source === "premadeEdited") return 2;
  return 2;
}

function getDeckUpdatedAt(deck: DeckEntity & { source: DeckSource }): string {
  return "updatedAt" in deck ? deck.updatedAt : "";
}

function getDeckSourceRank(source: DeckSource): number {
  if (source === "premade") return 0;
  if (source === "premadeEdited") return 0;
  if (source === "local") return 1;
  return 2;
}
