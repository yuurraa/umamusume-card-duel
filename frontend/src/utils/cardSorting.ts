import type { Card } from "../../../shared/src/types";
import { getCardRarity } from "../../../shared/src/cardRarity";
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
  _isOwned: (card: T) => boolean,
): T[] {
  return [...cards]
    .map((card, index) => ({ card, index }))
    .sort((left, right) => {
      if (option.key === "default") {
        const specialRaritySort = getDefaultSpecialRarityRank(left.card) - getDefaultSpecialRarityRank(right.card);
        const categorySort = getCategoryRank(left.card) - getCategoryRank(right.card);
        const nameSort = compareByName(left.card, right.card);
        const raritySort = getRarityTierRank(left.card) - getRarityTierRank(right.card);
        return specialRaritySort || categorySort || nameSort || raritySort || left.index - right.index;
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

function getDefaultSpecialRarityRank(card: Card): number {
  const rarity = getCardRarity(card);
  if (rarity === "artRare") return 100;
  if (rarity === "specialArtRare") return 110;
  if (rarity === "secretRare") return 120;
  return 0;
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
  if (rarity === "uncommonPlus") return 25;
  if (rarity === "rare") return 30;
  if (rarity === "artRare") return 40;
  if (rarity === "specialArtRare") return 45;
  if (rarity === "secretRare") return 50;
  return 60;
}

function compareByName(left: Card, right: Card): number {
  return formatCardName(left).localeCompare(formatCardName(right)) || left.id.localeCompare(right.id);
}
