import type { Card } from "../../../shared/src/types";
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
        return ownershipSort || left.index - right.index;
      }

      const direction = option.direction === "asc" ? 1 : -1;
      const valueSort = compareBySortKey(left.card, right.card, option.key) * direction;
      return valueSort || left.index - right.index;
    })
    .map(({ card }) => card);
}

function compareBySortKey(left: Card, right: Card, key: Exclude<CardSortKey, "default">): number {
  if (key === "alphabetical") return formatCardName(left).localeCompare(formatCardName(right));
  return getRarityRank(left) - getRarityRank(right) || formatCardName(left).localeCompare(formatCardName(right));
}

function getRarityRank(card: Card): number {
  const fullArtBonus = card.id.endsWith("FullArt") ? 100 : 0;
  if (card.kind === "umamusume") return fullArtBonus + 20 + card.stage;
  if (card.trainerType === "supporter") return fullArtBonus + 14;
  if (card.trainerType === "stadium") return fullArtBonus + 13;
  if (card.trainerType === "tool") return fullArtBonus + 12;
  return fullArtBonus + 11;
}
