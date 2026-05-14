import { CARD_RARITY_LABELS, getCardRarity } from "../../../../shared/src/cardRarity";
import { allCards, ownedStarterCardIds } from "../../../../shared/src/gameData";
import type { Card, CardRarity, EnergyType } from "../../../../shared/src/types";
import { formatCardName } from "../../game/engine/core/labels";

export type CategoryFilter = "umamusume" | "trainer" | "item" | "tool" | "stadium";
export type StageFilter = 0 | 1 | 2;
export type ArtFilter = "normal" | "fullArt";
export type OwnershipFilter = "owned" | "unowned";
export type RarityFilter = CardRarity;

export const categoryFilters: Array<{ id: CategoryFilter; label: string }> = [
  { id: "umamusume", label: "Umamusume" },
  { id: "trainer", label: "Supporter" },
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

export const stageFilters: Array<{ id: StageFilter; label: string }> = [
  { id: 0, label: "Basic" },
  { id: 1, label: "Stage 1" },
  { id: 2, label: "Stage 2" },
];

export const artFilters: Array<{ id: ArtFilter; label: string }> = [
  { id: "normal", label: "Normal Art" },
  { id: "fullArt", label: "Full Art" },
];

export const ownershipFilters: Array<{ id: OwnershipFilter; label: string }> = [
  { id: "owned", label: "Owned" },
  { id: "unowned", label: "Unowned" },
];

export const rarityFilters: Array<{ id: RarityFilter; label: string }> = [
  { id: "common", label: CARD_RARITY_LABELS.common },
  { id: "uncommon", label: CARD_RARITY_LABELS.uncommon },
  { id: "uncommonPlus", label: CARD_RARITY_LABELS.uncommonPlus },
  { id: "rare", label: CARD_RARITY_LABELS.rare },
  { id: "ultraRare", label: CARD_RARITY_LABELS.ultraRare },
  { id: "artRare", label: CARD_RARITY_LABELS.artRare },
  { id: "specialArtRare", label: CARD_RARITY_LABELS.specialArtRare },
  { id: "secretRare", label: CARD_RARITY_LABELS.secretRare },
];

export const cardEntries = Object.values(allCards).sort((left, right) => {
  const groupSort = getCardSortGroup(left) - getCardSortGroup(right);
  if (groupSort !== 0) return groupSort;
  return formatCardName(left).localeCompare(formatCardName(right));
});

export const starterCardCounts = Array.from(ownedStarterCardIds).reduce<Record<string, number>>((counts, cardId) => {
  counts[cardId] = 2;
  return counts;
}, {});

export const HOVER_PREVIEW_ACTION_HEIGHT = 56;

export const HOVER_PREVIEW_MAX_WIDTH = 440;
const HOVER_PREVIEW_VIEWPORT_WIDTH_PADDING = 36;
const HOVER_PREVIEW_GAP = 12;
const HOVER_PREVIEW_VIEWPORT_PAD = 10;
const HOVER_PREVIEW_HEIGHT_PER_WIDTH = 1040 / 745;

export function getHoverPreviewPosition(rect: DOMRect, extraHeight = 0): { left: number; top: number; width: number } {
  const viewportWidth = Math.max(120, window.innerWidth - HOVER_PREVIEW_VIEWPORT_WIDTH_PADDING);
  const viewportHeight = Math.max(120, window.innerHeight - (HOVER_PREVIEW_VIEWPORT_PAD * 2) - extraHeight);
  const heightConstrainedWidth = viewportHeight / HOVER_PREVIEW_HEIGHT_PER_WIDTH;
  const popupWidth = Math.min(HOVER_PREVIEW_MAX_WIDTH, viewportWidth, Math.max(120, heightConstrainedWidth));
  const popupHeight = (popupWidth * HOVER_PREVIEW_HEIGHT_PER_WIDTH) + extraHeight;
  const rightCandidate = rect.right + HOVER_PREVIEW_GAP;
  const leftCandidate = rect.left - HOVER_PREVIEW_GAP - popupWidth;
  const prefersRight = rightCandidate + popupWidth + HOVER_PREVIEW_VIEWPORT_PAD <= window.innerWidth;
  const unclampedLeft = prefersRight ? rightCandidate : leftCandidate;
  const maxLeft = Math.max(HOVER_PREVIEW_VIEWPORT_PAD, window.innerWidth - HOVER_PREVIEW_VIEWPORT_PAD - popupWidth);
  const left = Math.max(HOVER_PREVIEW_VIEWPORT_PAD, Math.min(maxLeft, unclampedLeft));
  const preferredCenterY = rect.top + rect.height / 2;
  const halfHeight = popupHeight / 2;
  const minCenterY = HOVER_PREVIEW_VIEWPORT_PAD + halfHeight;
  const maxCenterY = window.innerHeight - HOVER_PREVIEW_VIEWPORT_PAD - halfHeight;
  const top = minCenterY <= maxCenterY
    ? Math.max(minCenterY, Math.min(maxCenterY, preferredCenterY))
    : window.innerHeight / 2;
  return { left, top, width: popupWidth };
}

function getCardSortGroup(card: Card): number {
  if (card.kind === "umamusume") return 0;
  if (card.trainerType === "item") return 1;
  if (card.trainerType === "tool") return 2;
  if (card.trainerType === "supporter") return 3;
  return 4;
}
