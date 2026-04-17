import { cards } from "../../../../../shared/src/gameData";
import type { Card, UmamusumeCard, UmamusumeInstance } from "../../../../../shared/src/types";

export function getCard(cardId: string): Card {
  const card = cards[cardId];
  if (!card) throw new Error(`Unknown card: ${cardId}`);
  return card;
}

export function getUmamusumeCard(umamusume: UmamusumeInstance): UmamusumeCard {
  const card = getCard(umamusume.cardId);
  if (card.kind !== "umamusume") throw new Error(`Expected Umamusume card: ${umamusume.cardId}`);
  return card;
}

export function getPrimaryAttack(card: UmamusumeCard) {
  const attack = card.attacks[0];
  if (!attack) throw new Error(`Umamusume has no attacks: ${card.id}`);
  return attack;
}

export function isUmamusumeInDeck(cardId: string): boolean {
  return getCard(cardId).kind === "umamusume";
}

export function isBasicUmamusumeInDeck(cardId: string): boolean {
  const card = getCard(cardId);
  return card.kind === "umamusume" && card.stage === 0;
}
