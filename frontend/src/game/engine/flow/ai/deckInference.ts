import { getCard } from "../../core/catalog";
import { getAllUmamusume } from "../../core/umamusume";
import type { SideState } from "../../../../../../shared/src/types";

export type KnownRemainingDeckCounts = {
  basicUmamusume: number;
  evolutionUmamusume: number;
  trainer: number;
};

// Estimate known remaining composition from only legal, own-side information.
// We track exact cards currently in deck, plus what has already been consumed
// from hand/discard/in-play as a coarse prior for draw quality decisions.
export function getKnownRemainingDeckCounts(side: SideState): KnownRemainingDeckCounts {
  let basicUmamusume = 0;
  let evolutionUmamusume = 0;
  let trainer = 0;

  for (const cardId of side.deck) {
    const card = getCard(cardId);
    if (card.kind === "trainer") {
      trainer += 1;
      continue;
    }
    if (card.stage === 0) basicUmamusume += 1;
    else evolutionUmamusume += 1;
  }

  return { basicUmamusume, evolutionUmamusume, trainer };
}

export function countConsumedBasics(side: SideState): number {
  const consumedCardIds = [
    ...side.hand,
    ...side.discard,
    ...getAllUmamusume(side).map((umamusume) => umamusume.cardId),
  ];
  return consumedCardIds.reduce((count, cardId) => {
    const card = getCard(cardId);
    return count + (card.kind === "umamusume" && card.stage === 0 ? 1 : 0);
  }, 0);
}
