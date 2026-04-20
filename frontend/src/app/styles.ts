import type { CSSProperties } from "react";

export const SCREEN_FADE_MS = 120;

export function appStyle(isMenu = false, playmatImage?: string | null, textTone: "dark" | "light" = "dark"): CSSProperties {
  const uiTextColor = textTone === "light" ? "#f8fafc" : "#05070a";
  const uiTextShadow = textTone === "light"
    ? "0 1px 0 rgba(0, 0, 0, 0.82), 0 0 1px rgba(0, 0, 0, 0.94), 0 2px 12px rgba(0, 0, 0, 0.65)"
    : "0 1px 0 rgba(255, 255, 255, 0.92), 0 0 1px rgba(255, 255, 255, 0.9), 0 2px 10px rgba(0, 0, 0, 0.35)";
  const uiMutedTextColor = textTone === "light" ? "rgba(226, 232, 240, 0.76)" : "rgba(100, 113, 104, 0.52)";

  return {
    height: isMenu ? "100%" : "auto",
    minHeight: "100%",
    position: "relative",
    overflow: isMenu ? "hidden" : "clip",
    padding: isMenu ? 0 : 16,
    boxSizing: "border-box",
    color: "var(--ui-text-color)",
    textShadow: "var(--ui-text-shadow)",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "--ui-text-color": uiTextColor,
    "--ui-text-shadow": uiTextShadow,
    "--ui-muted-text-color": uiMutedTextColor,
    background: playmatImage
      ? `url("${playmatImage}") center / cover fixed no-repeat`
      : "radial-gradient(circle at 18% 8%, rgba(214, 81, 157, 0.2), transparent 28%), radial-gradient(circle at 84% 20%, rgba(63, 159, 92, 0.16), transparent 30%), linear-gradient(135deg, #101820 0%, #223733 54%, #4a2647 100%)",
  } as CSSProperties;
}

export function screenFadeOverlayStyle(opacity: number): CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 200,
    pointerEvents: "none",
    background: "#000000",
    opacity,
    transition: `opacity ${SCREEN_FADE_MS}ms ease`,
  };
}

export function matchBackgroundLayerStyle(playmatImage: string | null | undefined, opacity: number): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
    opacity,
    transition: "opacity 420ms ease",
    background: playmatImage ? `url("${playmatImage}") center / cover fixed no-repeat` : "none",
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
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: 16,
  alignItems: "start",
};

export const handPanelStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid rgba(217, 225, 218, 0.46)",
  background: "rgba(148, 163, 184, 0.08)",
  padding: 10,
  boxShadow: "0 24px 80px rgba(17, 24, 39, 0.14)",
};
