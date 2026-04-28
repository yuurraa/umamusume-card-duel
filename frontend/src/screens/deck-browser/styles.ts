import type { CSSProperties } from "react";
import { APP_BACKGROUND_FALLBACK, CARD_ASPECT_RATIO, GLASS_TILE_BACKGROUND, GLASS_TILE_BACKDROP_FILTER, borders, colors, glassPanelStyle, overlayBackdropStyle, overlayButtonStyle, overlaySurfaceStyle, previewKickerStyle, radius, shadows, transitions, uiTextColor, uiTextShadow } from "../../styles/shared";

export const menuKickerStyle: CSSProperties = {
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: 0.2,
  textTransform: "uppercase",
};

export const deckBrowserShellStyle: CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  display: "grid",
  gap: 22,
  padding: "24px 0 40px",
};

export const deckBrowserHeaderStyle: CSSProperties = {
  ...glassPanelStyle,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  padding: 18,
};

export const deckBrowserTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 36,
  lineHeight: 1,
  fontWeight: 950,
};

export const deckBrowserSubtitleStyle: CSSProperties = {
  margin: "10px 0 0",
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 15,
  fontWeight: 800,
};

export const deckBrowserBackButtonStyle: CSSProperties = {
  padding: "0 16px",
  height: 44,
};

export const deckBrowserGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 22,
};

export function deckBrowserCardStyle(equipped: boolean, hovered: boolean): CSSProperties {
  return {
    position: "relative",
    minHeight: 482,
    border: equipped
      ? "2px solid rgba(0, 0, 0, 0.62)"
      : hovered
        ? "1px solid rgba(0, 0, 0, 0.36)"
        : borders.neutralStrong,
    borderRadius: radius.md,
    background: GLASS_TILE_BACKGROUND,
    boxShadow: equipped
      ? "0 22px 60px rgba(17, 24, 39, 0.16)"
      : hovered
        ? "0 22px 56px rgba(17, 24, 39, 0.14)"
        : "0 16px 44px rgba(17, 24, 39, 0.1)",
    padding: 16,
    textAlign: "left",
    color: uiTextColor,
    textShadow: uiTextShadow,
    cursor: "pointer",
    transform: hovered && !equipped ? "translateY(-4px)" : "translateY(0)",
    transition: `transform ${transitions.board}, box-shadow ${transitions.board}, border-color ${transitions.board}, background ${transitions.board}`,
    backdropFilter: GLASS_TILE_BACKDROP_FILTER,
  };
}

export const deckBrowserLockedEditCardStyle: CSSProperties = {
  ...deckBrowserCardStyle(false, false),
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 14,
  cursor: "not-allowed",
  opacity: 0.85,
  transform: "translateY(0)",
};

export function deckBrowserCreateCardStyle(hovered: boolean): CSSProperties {
  return {
    ...deckBrowserCardStyle(false, hovered),
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    cursor: "pointer",
    opacity: 1,
    transform: hovered ? "translateY(-4px)" : "translateY(0)",
  };
}

export const deckBrowserLockedEditIconStyle: CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: radius.circle,
  border: borders.neutral,
  background: "rgba(238, 243, 238, 0.68)",
  display: "grid",
  placeItems: "center",
  color: colors.black,
  textShadow: "none",
  fontSize: 26,
  fontWeight: 900,
  lineHeight: 1,
  transform: "scaleX(-1)",
};

export function deckSummaryNameStyle(compact: boolean): CSSProperties {
  return {
    color: uiTextColor,
    textShadow: uiTextShadow,
    fontSize: compact ? 20 : 28,
    lineHeight: 1.05,
    fontWeight: 950,
  };
}

export const deckBrowserLockedEditLabelStyle: CSSProperties = {
  ...deckSummaryNameStyle(false),
};

export function deckSummaryCardStyle(compact: boolean, framed: boolean): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: compact ? 10 : 14,
    alignItems: "center",
    borderRadius: radius.md,
    border: framed ? borders.neutralStrong : 0,
    background: framed ? GLASS_TILE_BACKGROUND : "transparent",
    boxShadow: framed ? "0 16px 42px rgba(17, 24, 39, 0.12)" : shadows.none,
    padding: framed ? (compact ? 12 : 14) : 0,
  };
}

export const deckSummaryTextStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 6,
  justifyItems: "center",
  textAlign: "center",
};

export const deckSummaryLabelStyle: CSSProperties = {
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.16,
  textTransform: "uppercase",
};

export const deckEnergyRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  flexWrap: "wrap",
};

export const deckEnergyIconWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  borderRadius: radius.circle,
  border: "1px solid rgba(255, 255, 255, 0.9)",
  boxSizing: "border-box",
};

export function deckCoverImageStyle(compact: boolean): CSSProperties {
  return {
    width: "100%",
    maxWidth: compact ? 132 : 256,
    justifySelf: "center",
    borderRadius: radius.md,
    display: "block",
    objectFit: "contain",
    filter: "drop-shadow(0 18px 28px rgba(17, 24, 39, 0.2))",
  };
}

export function deckCoverAuroraSleeveStyle(compact: boolean): CSSProperties {
  return {
    width: "100%",
    maxWidth: compact ? 132 : 256,
    justifySelf: "center",
    aspectRatio: CARD_ASPECT_RATIO,
    borderRadius: radius.md,
    display: "grid",
    placeItems: "center",
    border: "1px solid rgba(217, 225, 218, 0.82)",
    background: `linear-gradient(145deg, #17211c 0%, ${APP_BACKGROUND_FALLBACK} 48%, #d6519d 100%)`,
    boxShadow: "0 14px 30px rgba(17, 24, 39, 0.14)",
  };
}

export const deckCoverAuroraSleeveMarkStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: radius.circle,
  display: "grid",
  placeItems: "center",
  background: colors.glassStrong,
  color: colors.black,
  textShadow: "none",
  fontSize: 20,
  fontWeight: 950,
  lineHeight: 1,
};

export const deckSelectedBadgeStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  zIndex: 1,
  width: 34,
  height: 34,
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  border: "1px solid rgba(0, 0, 0, 0.18)",
  background: colors.black,
  color: colors.white,
  fontSize: 18,
  fontWeight: 950,
  boxShadow: "0 10px 20px rgba(17, 24, 39, 0.18)",
};

export const deckModalBackdropStyle: CSSProperties = {
  ...overlayBackdropStyle,
  zIndex: 60,
};

export const deckModalStyle: CSSProperties = {
  ...overlaySurfaceStyle,
  isolation: "isolate",
  width: "min(1320px, calc(100vw - 48px))",
  maxHeight: "calc(100dvh - 48px)",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  gap: 10,
  padding: 12,
  overflow: "hidden",
  background: "rgba(238, 243, 238, 0.95)",
  border: "1px solid rgba(185, 198, 188, 0.72)",
  boxShadow: "0 16px 44px rgba(17, 24, 39, 0.18)",
  color: colors.black,
  textShadow: "none",
};

export const createDeckModalStyle: CSSProperties = {
  ...deckModalStyle,
  position: "relative",
  maxHeight: "calc(100dvh - 48px)",
};

export const deckModalHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

export const deckModalHeaderActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

export const deckModalTitleStyle: CSSProperties = {
  margin: "2px 0 0",
  minHeight: 48,
  display: "flex",
  alignItems: "center",
  color: colors.black,
  textShadow: "none",
  fontSize: 25,
  lineHeight: 1.05,
  fontWeight: 950,
};

export const deckModalKickerStyle: CSSProperties = {
  ...previewKickerStyle,
  color: colors.black,
  textShadow: "none",
};

export const closeDeckModalButtonStyle: CSSProperties = {
  ...overlayButtonStyle,
  minWidth: 78,
};

export const deckModalMetaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

export const deckMetaSeparatorStyle: CSSProperties = {
  color: colors.black,
  textShadow: "none",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.12,
  textTransform: "uppercase",
  opacity: 0.9,
};

export const deckModalInlineCountStyle: CSSProperties = {
  color: colors.black,
  textShadow: "none",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.12,
  textTransform: "uppercase",
};

export const deckNameInputStyle: CSSProperties = {
  width: "min(420px, calc(100vw - 220px))",
  maxWidth: "100%",
  height: 42,
  boxSizing: "border-box",
  borderRadius: radius.md,
  border: borders.neutralStrong,
  background: "rgba(245, 248, 245, 0.94)",
  color: colors.black,
  outline: "none",
  padding: "0 12px",
  fontSize: 14,
  fontWeight: 800,
  boxShadow: "0 8px 18px rgba(17, 24, 39, 0.08)",
};

export const deckCardGridStyle: CSSProperties = {
  position: "relative",
  zIndex: 0,
  minHeight: 0,
  overflowX: "hidden",
  overflowY: "auto",
  display: "grid",
  gap: 8,
  gridAutoRows: "auto",
  padding: "14px 8px 8px",
  alignContent: "start",
};

export function deckCardRowStyle(_count: number): CSSProperties {
  return {
    minHeight: 0,
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    columnGap: 7,
    rowGap: 8,
  };
}

export function deckCardTileStyle(hovered: boolean): CSSProperties {
  return {
    width: "100%",
    maxWidth: "100%",
    height: "auto",
    justifySelf: "stretch",
    aspectRatio: CARD_ASPECT_RATIO,
    borderRadius: radius.lg,
    border: "1px solid rgba(185, 198, 188, 0.58)",
    background: "rgba(238, 243, 238, 0.52)",
    filter: "none",
    overflow: "hidden",
    cursor: "pointer",
    transform: hovered ? "translateY(-10px) rotate(0.8deg) scale(1.025)" : "translateY(0) rotate(0deg) scale(1)",
    transition: `transform ${transitions.slow}`,
    padding: 0,
  };
}

export const deckCardSpacerStyle: CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  height: "auto",
  justifySelf: "stretch",
  aspectRatio: CARD_ASPECT_RATIO,
};

export const deckEmptySlotTileStyle: CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  height: "auto",
  boxSizing: "border-box",
  justifySelf: "stretch",
  aspectRatio: CARD_ASPECT_RATIO,
  borderRadius: radius.lg,
  border: borders.neutralDashed,
  background: colors.glassSoft,
  display: "grid",
  placeItems: "center",
  boxShadow: "none",
  color: colors.black,
  fontSize: 32,
  fontWeight: 900,
  cursor: "pointer",
  padding: 0,
};

export const validateDeckTileStyle: CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  height: "auto",
  justifySelf: "stretch",
  aspectRatio: CARD_ASPECT_RATIO,
  borderRadius: radius.lg,
  border: borders.neutralDashed,
  background: colors.glassSoft,
  placeItems: "center",
  color: colors.black,
  textShadow: "none",
  boxShadow: "none",
  display: "grid",
  alignContent: "center",
  justifyItems: "center",
  gap: 14,
  cursor: "pointer",
  opacity: 1,
  padding: 12,
};

export const validateDeckIconStyle: CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: radius.circle,
  border: borders.neutral,
  background: "rgba(238, 243, 238, 0.68)",
  display: "grid",
  placeItems: "center",
  color: colors.black,
  textShadow: "none",
  fontSize: 26,
  fontWeight: 950,
  lineHeight: 1,
};

export const validateDeckLabelStyle: CSSProperties = {
  color: colors.black,
  textShadow: "none",
  fontSize: 18,
  fontWeight: 950,
  lineHeight: 1.1,
  textAlign: "center",
};

export const deckLockedEditTileStyle: CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  height: "auto",
  justifySelf: "stretch",
  aspectRatio: CARD_ASPECT_RATIO,
  borderRadius: radius.lg,
  border: borders.neutralDashed,
  background: colors.glassSoft,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  boxShadow: "none",
  opacity: 0.85,
  cursor: "not-allowed",
  padding: 0,
};

export const deckLockedEditIconStyle: CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: radius.circle,
  border: borders.neutral,
  background: "rgba(238, 243, 238, 0.68)",
  display: "grid",
  placeItems: "center",
  color: colors.black,
  textShadow: "none",
  fontSize: 26,
  fontWeight: 900,
  lineHeight: 1,
  transform: "scaleX(-1)",
};

export const deckLockedEditLabelSmallStyle: CSSProperties = {
  color: colors.black,
  textShadow: "none",
  fontSize: 18,
  fontWeight: 950,
  lineHeight: 1.1,
  textAlign: "center",
};

export const deckCardImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
};

export const deckModalActionButtonStyle: CSSProperties = {
  ...overlayButtonStyle,
  minWidth: 92,
};

export const deckInspectBackdropStyle: CSSProperties = {
  ...overlayBackdropStyle,
  zIndex: 65,
};

export const deckInspectSurfaceStyle: CSSProperties = {
  position: "relative",
  width: "min(520px, calc(100vw - 32px))",
  display: "grid",
  placeItems: "center",
};

export const deckInspectImageStyle: CSSProperties = {
  width: "100%",
  maxHeight: "90vh",
  borderRadius: radius.md,
  objectFit: "contain",
  display: "block",
  boxShadow: "0 32px 100px rgba(0, 0, 0, 0.44)",
};

export const localDeckErrorStyle: CSSProperties = {
  ...glassPanelStyle,
  color: "rgb(127, 29, 29)",
  textShadow: "none",
  fontSize: 12,
  fontWeight: 900,
  padding: 10,
};

export const localDeckPersistenceNoticeStyle: CSSProperties = {
  ...glassPanelStyle,
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 13,
  fontWeight: 850,
  lineHeight: 1.45,
  padding: "12px 14px",
};

export const deckSelectorModalStyle: CSSProperties = {
  ...deckModalStyle,
  position: "relative",
  width: "min(1320px, calc(100vw - 48px))",
  maxHeight: "calc(100dvh - 48px)",
  gridTemplateRows: "auto auto minmax(0, 1fr)",
};

export const deckSelectorFilterPanelStyle: CSSProperties = {
  ...glassPanelStyle,
  position: "relative",
  zIndex: 4,
  display: "grid",
  gap: 10,
  padding: 14,
};

export const deckSelectorCardTrayStyle: CSSProperties = {
  ...glassPanelStyle,
  position: "relative",
  zIndex: 0,
  backdropFilter: "none",
  minHeight: 0,
  overflowX: "hidden",
  overflowY: "auto",
  padding: 12,
  boxSizing: "border-box",
};

export function deckSelectorHoverDimStyle(active: boolean): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    zIndex: 40,
    pointerEvents: "none",
    borderRadius: radius.md,
    background: "rgba(17, 24, 39, 0.34)",
    opacity: active ? 1 : 0,
    transition: `opacity ${transitions.base}`,
  };
}

export function deckModalHoverDimStyle(active: boolean): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    zIndex: 40,
    pointerEvents: "none",
    borderRadius: radius.lg,
    background: "rgba(17, 24, 39, 0.34)",
    opacity: active ? 1 : 0,
    transition: `opacity ${transitions.base}`,
  };
}

export const searchToolbarStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto auto",
  gap: 10,
  alignItems: "center",
};

export const sortControlGroupStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

export const sortSelectStyle: CSSProperties = {
  height: 46,
  minWidth: 126,
  borderRadius: radius.md,
  border: borders.neutralStrong,
  background: "rgba(245, 248, 245, 0.94)",
  color: colors.black,
  padding: "0 10px",
  fontSize: 13,
  fontWeight: 900,
  outline: "none",
  boxShadow: "0 10px 24px rgba(17, 24, 39, 0.08)",
};

export function sortDirectionButtonStyle(enabled: boolean): CSSProperties {
  return {
    height: 46,
    minWidth: 64,
    borderRadius: radius.md,
    border: enabled ? "1px solid rgba(0, 0, 0, 0.42)" : borders.neutralStrong,
    background: enabled ? "rgba(245, 248, 245, 0.94)" : "rgba(238, 243, 238, 0.62)",
    color: enabled ? colors.black : "rgba(0, 0, 0, 0.48)",
    fontSize: 12,
    fontWeight: 950,
    cursor: enabled ? "pointer" : "not-allowed",
    boxShadow: "0 10px 24px rgba(17, 24, 39, 0.08)",
  };
}

export const searchInputStyle: CSSProperties = {
  width: "100%",
  height: 46,
  boxSizing: "border-box",
  borderRadius: radius.md,
  border: borders.neutralStrong,
  background: "rgba(245, 248, 245, 0.94)",
  color: colors.black,
  outline: "none",
  padding: "0 14px",
  fontSize: 14,
  fontWeight: 800,
  boxShadow: "0 10px 24px rgba(17, 24, 39, 0.08)",
};

export const filterMenuWrapStyle: CSSProperties = {
  position: "relative",
};

export function filterMenuButtonStyle(active: boolean): CSSProperties {
  return {
    height: 46,
    minWidth: 104,
    padding: "0 14px",
    borderRadius: radius.md,
    border: active ? "1px solid rgba(0, 0, 0, 0.58)" : borders.neutralStrong,
    background: active ? colors.black : "rgba(245, 248, 245, 0.94)",
    color: active ? colors.white : colors.black,
    fontSize: 13,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: active ? "0 12px 28px rgba(17, 24, 39, 0.22)" : "0 10px 24px rgba(17, 24, 39, 0.08)",
    transition: `background ${transitions.base}, border-color ${transitions.base}, color ${transitions.base}, box-shadow ${transitions.base}`,
  };
}

export const filterPopoverStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  zIndex: 30,
  width: "min(255px, calc(100vw - 48px))",
  display: "grid",
  gap: 14,
  padding: 12,
  maxHeight: "min(560px, calc(100dvh - 190px))",
  overflowY: "auto",
  borderRadius: radius.md,
  border: borders.glassStrong,
  background: "rgba(238, 243, 238, 0.96)",
  boxShadow: "0 22px 56px rgba(17, 24, 39, 0.22)",
  color: colors.black,
  textShadow: "none",
};

export const filterPopoverHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

export const filterPopoverTitleStyle: CSSProperties = {
  color: colors.black,
  textShadow: "none",
  fontSize: 16,
  lineHeight: 1,
  fontWeight: 950,
};

export function clearFiltersButtonStyle(enabled: boolean): CSSProperties {
  return {
    height: 28,
    padding: "0 10px",
    borderRadius: radius.md,
    border: enabled ? "1px solid rgba(0, 0, 0, 0.42)" : borders.neutralStrong,
    background: enabled ? colors.black : "rgba(245, 248, 245, 0.76)",
    color: enabled ? colors.white : "rgba(0, 0, 0, 0.52)",
    fontSize: 11,
    fontWeight: 900,
    cursor: enabled ? "pointer" : "not-allowed",
  };
}

export const filterGroupStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

export const filterGroupLabelStyle: CSSProperties = {
  color: colors.black,
  textShadow: "none",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.2,
  textTransform: "uppercase",
};

export const filterOptionGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

export const energyFilterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, 42px)",
  gap: 9,
};

export function filterChipStyle(active: boolean): CSSProperties {
  return {
    height: 34,
    padding: "0 12px",
    borderRadius: radius.md,
    border: active ? "1px solid rgba(0, 0, 0, 0.58)" : borders.neutralStrong,
    background: active ? colors.black : "rgba(245, 248, 245, 0.9)",
    color: active ? colors.white : colors.black,
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: active ? "0 10px 24px rgba(17, 24, 39, 0.18)" : "0 8px 18px rgba(17, 24, 39, 0.08)",
    transition: `background ${transitions.base}, border-color ${transitions.base}, color ${transitions.base}, box-shadow ${transitions.base}`,
  };
}

export function energyFilterButtonStyle(active: boolean): CSSProperties {
  return {
    width: 42,
    height: 42,
    display: "grid",
    placeItems: "center",
    borderRadius: radius.circle,
    border: active ? "2px solid rgba(0, 0, 0, 0.68)" : "1px solid rgba(255, 255, 255, 0.9)",
    background: active ? "rgba(245, 248, 245, 0.98)" : "rgba(238, 243, 238, 0.66)",
    cursor: "pointer",
    boxShadow: active ? "0 12px 26px rgba(17, 24, 39, 0.22)" : "0 8px 18px rgba(17, 24, 39, 0.1)",
    padding: 0,
    transition: `border-color ${transitions.base}, box-shadow ${transitions.base}, background ${transitions.base}`,
  };
}

export const cardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(146px, 1fr))",
  gap: 8,
  alignItems: "start",
};

export function cardTileStyle(hovered: boolean, disabled: boolean): CSSProperties {
  return {
    display: "block",
    position: "relative",
    minWidth: 0,
    border: 0,
    borderRadius: radius.md,
    background: "transparent",
    padding: 0,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.38 : 1,
    filter: disabled
      ? "grayscale(0.5)"
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

export function rarityBadgeStyle(rarity: "common" | "uncommon" | "rare" | "doubleRare"): CSSProperties {
  const palette: Record<typeof rarity, { border: string; background: string; color: string }> = {
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
    rare: {
      border: "1px solid rgba(96, 165, 250, 0.78)",
      background: "rgba(30, 64, 175, 0.86)",
      color: colors.white,
    },
    doubleRare: {
      border: "1px solid rgba(250, 204, 21, 0.86)",
      background: "rgba(133, 77, 14, 0.9)",
      color: "#fff7cc",
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

export function deckSelectorHoverPreviewStyle(left: number, top: number, active: boolean): CSSProperties {
  return {
    position: "fixed",
    left,
    top,
    transform: "translateY(-50%)",
    width: "min(440px, calc(100vw - 36px))",
    pointerEvents: "none",
    zIndex: 50,
    borderRadius: 0,
    background: "transparent",
    padding: 0,
    opacity: active ? 1 : 0,
    transition: `opacity ${transitions.base}`,
  };
}

export const deckSelectorHoverPreviewImageStyle: CSSProperties = {
  width: "100%",
  aspectRatio: CARD_ASPECT_RATIO,
  objectFit: "contain",
  borderRadius: radius.md,
  display: "block",
  filter: "drop-shadow(0 24px 64px rgba(17, 24, 39, 0.34))",
};

export const emptyStateStyle: CSSProperties = {
  padding: 18,
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 15,
  fontWeight: 900,
  textAlign: "center",
};

export const deckJsonModalStyle: CSSProperties = {
  ...deckModalStyle,
  width: "min(820px, calc(100vw - 48px))",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr) auto",
};

export const deckJsonTextareaStyle: CSSProperties = {
  width: "100%",
  minHeight: "min(52vh, 520px)",
  boxSizing: "border-box",
  resize: "vertical",
  borderRadius: radius.md,
  border: borders.neutralStrong,
  background: "rgba(245, 248, 245, 0.94)",
  color: colors.black,
  outline: "none",
  padding: 12,
  fontSize: 13,
  lineHeight: 1.45,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  boxShadow: "0 10px 24px rgba(17, 24, 39, 0.08)",
};

export const deckJsonActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 8,
};

export const deleteConfirmBodyStyle: CSSProperties = {
  margin: 0,
  color: colors.black,
  textShadow: "none",
  fontSize: 14,
  fontWeight: 700,
};
