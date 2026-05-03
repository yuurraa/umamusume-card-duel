import type { Card, CardPrintVariant, CardRarity } from "./types";

export const CARD_RARITY_LABELS: Record<CardRarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  uncommonPlus: "Uncommon+",
  rare: "Rare",
  artRare: "Art Rare",
  specialArtRare: "Special Art Rare",
  secretRare: "Secret Rare",
  ultraRare: "Ultra Rare",
};

export const CARD_RARITY_SHORT_LABELS: Record<CardRarity, string> = {
  common: "C",
  uncommon: "UC",
  uncommonPlus: "UC+",
  rare: "R",
  artRare: "AR",
  specialArtRare: "SAR",
  secretRare: "SR",
  ultraRare: "UR",
};

export const CARD_PRINT_VARIANT_LABELS: Record<CardPrintVariant, string> = {
  standard: "Standard",
  holographic: "Holographic",
};

export function getCardRarity(card: Card): CardRarity {
  if (isExCard(card)) return "ultraRare";
  if (isUncommonPlusCard(card)) return "uncommonPlus";
  if (isGoldFullArtCard(card)) return "secretRare";
  if (isFullArtCard(card)) return card.kind === "umamusume" ? "artRare" : "specialArtRare";
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
  return card.id.endsWith("FullArt") || isGoldFullArtCard(card);
}

export function isGoldFullArtCard(card: Card): boolean {
  return card.id.endsWith("FullArtGold");
}

export function isUncommonPlusCard(card: Card): boolean {
  return card.id.endsWith("UncommonPlus");
}

export function isExCard(card: Card): boolean {
  return card.kind === "umamusume" && card.id.endsWith("Ex");
}

export function isCardDisabled(card: Card): boolean {
  return card.implemented === false;
}

export function toBaseCardId(cardId: string): string {
  if (cardId.endsWith("UncommonPlus")) return cardId.slice(0, -"UncommonPlus".length);
  if (cardId.endsWith("FullArtGold")) return cardId.slice(0, -"FullArtGold".length);
  if (cardId.endsWith("FullArt")) return cardId.slice(0, -"FullArt".length);
  if (cardId.endsWith("Ex")) return cardId.slice(0, -"Ex".length);
  return cardId;
}
