import type { CSSProperties } from "react";
import { APP_BACKGROUND_FALLBACK, borders, colors, fontStacks, radius, shadows, transitions } from "../styles/shared";

export const SCREEN_FADE_MS = 120;

export function appStyle(isMenu = false, playmatImage?: string | null, textTone: "dark" | "light" = "dark"): CSSProperties {
  const uiTextColor = textTone === "light" ? colors.slate100 : "#05070a";
  const uiTextShadow = textTone === "light"
    ? "0 1px 0 rgba(0, 0, 0, 0.82), 0 0 1px rgba(0, 0, 0, 0.94), 0 2px 12px rgba(0, 0, 0, 0.65)"
    : "0 1px 0 rgba(255, 255, 255, 0.92), 0 0 1px rgba(255, 255, 255, 0.9), 0 2px 10px rgba(0, 0, 0, 0.35)";
  const uiMutedTextColor = textTone === "light" ? "rgba(226, 232, 240, 0.76)" : "rgba(100, 113, 104, 0.52)";

  return {
    height: "100dvh",
    minHeight: "100dvh",
    position: "relative",
    overflowX: "hidden",
    overflowY: isMenu ? "hidden" : "auto",
    scrollbarGutter: isMenu ? "auto" : "stable",
    overscrollBehavior: "none",
    padding: isMenu ? 0 : 16,
    boxSizing: "border-box",
    color: "var(--ui-text-color)",
    textShadow: "var(--ui-text-shadow)",
    fontFamily: fontStacks.ui,
    "--ui-text-color": uiTextColor,
    "--ui-text-shadow": uiTextShadow,
    "--ui-muted-text-color": uiMutedTextColor,
    background: playmatImage
      ? `url("${playmatImage}") center / cover fixed no-repeat`
      : `radial-gradient(circle at 18% 8%, rgba(214, 81, 157, 0.2), transparent 28%), radial-gradient(circle at 84% 20%, rgba(63, 159, 92, 0.16), transparent 30%), linear-gradient(135deg, ${APP_BACKGROUND_FALLBACK} 0%, #223733 54%, #4a2647 100%)`,
    backgroundAttachment: "fixed",
  } as CSSProperties;
}

export function screenFadeOverlayStyle(opacity: number): CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 200,
    pointerEvents: "none",
    background: colors.black,
    opacity,
    transition: `opacity ${SCREEN_FADE_MS}ms ease`,
  };
}

export function matchBackgroundLayerStyle(
  playmatImage: string | null | undefined,
  opacity: number,
  disableOpacityTransition = false,
): CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
    opacity,
    transition: disableOpacityTransition ? "none" : `opacity ${transitions.backgroundFade}`,
    background: playmatImage ? `url("${playmatImage}") center / cover fixed no-repeat` : "none",
    backgroundAttachment: "fixed",
  };
}

export const contentStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  maxWidth: 1760,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

export const duelGridStyle: CSSProperties = {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) clamp(154px, 10vw, 192px) minmax(0, 1fr)",
  gap: "clamp(13px, 0.833vw, 16px)",
  alignItems: "start",
  minWidth: 0,
};

export const handPanelStyle: CSSProperties = {
  borderRadius: radius.md,
  border: borders.glass,
  background: "rgba(148, 163, 184, 0.08)",
  padding: 10,
  boxShadow: shadows.panel,
};
