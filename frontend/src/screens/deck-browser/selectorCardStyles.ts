import type { CSSProperties } from "react";
import type { CardRarity } from "../../../../shared/src/types";
import { CARD_ASPECT_RATIO, colors, radius, transitions, uiTextShadow } from "../../styles/shared";

export const cardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(10, minmax(146px, 1fr))",
  gap: 8,
  alignItems: "start",
};

export function cardTileStyle(hovered: boolean, disabled: boolean, unowned = false): CSSProperties {
  const disabledFilter = unowned
    ? "grayscale(0.18) saturate(0.82) brightness(0.94)"
    : "grayscale(0.5)";
  const disabledOpacity = unowned ? 0.74 : 0.52;
  return {
    display: "block",
    position: "relative",
    overflow: "hidden",
    minWidth: 0,
    border: 0,
    borderRadius: radius.md,
    background: "transparent",
    padding: 0,
    cursor: "pointer",
    opacity: disabled ? disabledOpacity : 1,
    filter: disabled
      ? disabledFilter
      : hovered
        ? "drop-shadow(0 18px 26px rgba(17, 24, 39, 0.24))"
        : "drop-shadow(0 10px 18px rgba(17, 24, 39, 0.14))",
    transform: disabled ? "translateY(0) rotate(0deg) scale(1)" : hovered ? "translateY(-6px) rotate(0.6deg) scale(1.018)" : "translateY(0) rotate(0deg) scale(1)",
    transition: `transform ${transitions.slow}, filter ${transitions.slow}`,
  };
}

export const cardImageStyle: CSSProperties = {
  width: "100%",
  aspectRatio: CARD_ASPECT_RATIO,
  objectFit: "contain",
  display: "block",
  borderRadius: radius.md,
};

export function rarityBadgeStyle(rarity: CardRarity): CSSProperties {
  const palette: Record<CardRarity, { border: string; background: string; color: string }> = {
    common: {
      border: "1px solid rgba(255, 255, 255, 0.64)",
      background: "rgba(31, 41, 55, 0.76)",
      color: colors.white,
    },
    uncommon: {
      border: "1px solid rgba(52, 211, 153, 0.72)",
      background: "rgba(6, 95, 70, 0.86)",
      color: colors.white,
    },
    uncommonPlus: {
      border: "1px solid rgba(103, 232, 249, 0.82)",
      background: "rgba(15, 118, 110, 0.9)",
      color: "#ecfeff",
    },
    rare: {
      border: "1px solid rgba(96, 165, 250, 0.78)",
      background: "rgba(30, 64, 175, 0.86)",
      color: colors.white,
    },
    artRare: {
      border: "1px solid rgba(244, 114, 182, 0.78)",
      background: "rgba(157, 23, 77, 0.88)",
      color: "#fff1f7",
    },
    specialArtRare: {
      border: "1px solid rgba(216, 180, 254, 0.84)",
      background: "rgba(91, 33, 182, 0.88)",
      color: "#faf5ff",
    },
    secretRare: {
      border: "1px solid rgba(250, 204, 21, 0.9)",
      background: "rgba(133, 77, 14, 0.92)",
      color: "#fff7cc",
    },
    ultraRare: {
      border: "1px solid rgba(248, 113, 113, 0.9)",
      background: "rgba(127, 29, 29, 0.92)",
      color: "#fff1f2",
    },
  };
  const color = palette[rarity];
  return {
    position: "absolute",
    right: 8,
    bottom: 8,
    minWidth: 24,
    borderRadius: radius.pill,
    border: color.border,
    background: color.background,
    color: color.color,
    textShadow: uiTextShadow,
    padding: "4px 7px",
    fontSize: 10,
    fontWeight: 950,
    textTransform: "uppercase",
    pointerEvents: "none",
    boxShadow: "0 8px 18px rgba(17, 24, 39, 0.24)",
  };
}
