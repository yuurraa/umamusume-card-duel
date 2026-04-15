import type { Card, PokemonType } from "../../../shared/src/types";
import type { PreviewTone } from "../types/ui";

export const typeAccentColors: Record<PokemonType, string> = {
  Grass: "#7bc03e",
  Fire: "#e8885a",
  Water: "#5aa8e8",
  Lightning: "#dbb94a",
  Psychic: "#b882d8",
  Fighting: "#b88a60",
  Darkness: "#445063",
  Metal: "#7f8c9b",
};

export const neutralPreviewTone: PreviewTone = {
  accent: "#94a3b8",
};

export function getPreviewTone(card: Card): PreviewTone {
  if (card.kind !== "pokemon") return neutralPreviewTone;
  return { accent: typeAccentColors[card.type] };
}

export function alphaColor(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
