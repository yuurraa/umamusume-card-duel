import type { Card } from "../../../shared/src/types";
import { getCardRarity, isFullArtCard } from "../../../shared/src/cardRarity";
import { formatCardName } from "../game/engine/core/labels";

export type CardSortKey = "default" | "alphabetical" | "rarity";
export type CardSortDirection = "asc" | "desc";
export type CardSortOption = {
  key: CardSortKey;
  direction: CardSortDirection;
};

export const DEFAULT_CARD_SORT: CardSortOption = { key: "default", direction: "asc" };

export function sortCardsForCollection<T extends Card>(
  cards: readonly T[],
  option: CardSortOption,
  isOwned: (card: T) => boolean,
): T[] {
  return [...cards]
    .map((card, index) => ({ card, index }))
    .sort((left, right) => {
      if (option.key === "default") {
        const ownershipSort = Number(isOwned(right.card)) - Number(isOwned(left.card));
        const fullArtSort = Number(isFullArtCard(left.card)) - Number(isFullArtCard(right.card));
        const categorySort = getCategoryRank(left.card) - getCategoryRank(right.card);
        return ownershipSort || fullArtSort || categorySort || compareByName(left.card, right.card) || left.index - right.index;
      }

      const direction = option.direction === "asc" ? 1 : -1;
      const valueSort = compareBySortKey(left.card, right.card, option.key) * direction;
      return valueSort || (left.index - right.index) * direction;
    })
    .map(({ card }) => card);
}

function compareBySortKey(left: Card, right: Card, key: Exclude<CardSortKey, "default">): number {
  if (key === "alphabetical") return compareByName(left, right);
  return getRarityRank(left) - getRarityRank(right) || compareByName(left, right);
}

function getRarityRank(card: Card): number {
  return getRarityTierRank(card) * 100 + getCategoryRank(card);
}

function getCategoryRank(card: Card): number {
  if (card.kind === "umamusume") return 10;
  if (card.trainerType === "item") return 20;
  if (card.trainerType === "tool") return 30;
  if (card.trainerType === "supporter") return 40;
  return 50;
}

function getRarityTierRank(card: Card): number {
  const rarity = getCardRarity(card);
  if (rarity === "common") return 10;
  if (rarity === "uncommon") return 20;
  if (rarity === "rare") return 30;
  return 40;
}

function compareByName(left: Card, right: Card): number {
  return formatCardName(left).localeCompare(formatCardName(right)) || left.id.localeCompare(right.id);
}
