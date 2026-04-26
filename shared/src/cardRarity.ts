import type { Card, CardPrintVariant, CardRarity } from "./types";

export const CARD_RARITY_LABELS: Record<CardRarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  doubleRare: "Ultra Rare",
};

export const CARD_RARITY_SHORT_LABELS: Record<CardRarity, string> = {
  common: "C",
  uncommon: "UC",
  rare: "R",
  doubleRare: "UR",
};

export const CARD_PRINT_VARIANT_LABELS: Record<CardPrintVariant, string> = {
  standard: "Standard",
  holographic: "Holographic",
};

export function getCardRarity(card: Card): CardRarity {
  if (isFullArtCard(card)) return "doubleRare";
  if (card.kind === "umamusume") {
    if (card.stage >= 2) return "rare";
    if (card.stage === 1) return "uncommon";
  }
  if (card.kind === "trainer" && card.trainerType === "tool") return "uncommon";
  return "common";
}

export function getCardDropRarity(card: Card, variant: CardPrintVariant = "standard"): CardRarity {
  const baseRarity = getCardRarity(card);
  if (variant === "holographic" && baseRarity === "common") return "uncommon";
  return baseRarity;
}

export function isFullArtCard(card: Card): boolean {
  return card.id.endsWith("FullArt");
}
