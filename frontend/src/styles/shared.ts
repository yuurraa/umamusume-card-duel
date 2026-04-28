import type { CSSProperties } from "react";
import { alphaColor } from "../utils/color";

export type NeutralButtonTone = "default" | "danger";

export const CARD_ASPECT_RATIO = "745 / 1040";
export const CARD_INSPECT_IMAGE_RADIUS = 20;
export const APP_BACKGROUND_FALLBACK = "#101820";

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 14,
  pill: 999,
  circle: "50%",
} as const;

export const colors = {
  black: "#000000",
  white: "#ffffff",
  slate900: "#111827",
  slate800: "#1f2937",
  slate700: "#334155",
  slate600: "#475569",
  slate500: "#64748b",
  slate400: "#94a3b8",
  slate300: "#cbd5e1",
  slate100: "#f8fafc",
  danger900: "#7f1d1d",
  danger800: "#991b1b",
  danger700: "#dc2626",
  danger300: "#f87171",
  info900: "#1e3a8a",
  info700: "#2563eb",
  glass: "rgba(238, 243, 238, 0.22)",
  glassSoft: "rgba(238, 243, 238, 0.24)",
  glassMedium: "rgba(238, 243, 238, 0.3)",
  glassStrong: "rgba(238, 243, 238, 0.9)",
  glassOverlay: "rgba(238, 243, 238, 0.94)",
  glassBorder: "rgba(217, 225, 218, 0.72)",
  glassBorderStrong: "rgba(217, 225, 218, 0.76)",
  neutralBorder: "rgba(185, 198, 188, 0.88)",
  neutralBorderStrong: "rgba(185, 198, 188, 0.9)",
} as const;

export const borders = {
  glass: `1px solid ${colors.glassBorder}`,
  glassStrong: `1px solid ${colors.glassBorderStrong}`,
  neutral: `1px solid ${colors.neutralBorder}`,
  neutralStrong: `1px solid ${colors.neutralBorderStrong}`,
  neutralDashed: `1px dashed ${colors.neutralBorder}`,
} as const;

export const shadows = {
  none: "none",
  sm: "0 6px 14px rgba(17, 24, 39, 0.1)",
  md: "0 8px 18px rgba(17, 24, 39, 0.1)",
  lg: "0 12px 28px rgba(17, 24, 39, 0.14)",
  xl: "0 18px 46px rgba(17, 24, 39, 0.14)",
  panel: "0 24px 80px rgba(17, 24, 39, 0.14)",
  board: "0 26px 80px rgba(17, 24, 39, 0.16)",
  overlay: "0 22px 68px rgba(17, 24, 39, 0.2)",
  badge: "0 8px 18px rgba(17, 24, 39, 0.2)",
} as const;

export const transitions = {
  fast: "120ms ease",
  base: "140ms ease",
  card: "170ms ease",
  board: "160ms ease",
  slow: "180ms ease",
  backgroundFade: "420ms ease",
  spring: "cubic-bezier(0.2, 0.8, 0.2, 1)",
} as const;

export const filters = {
  glassBlur: "blur(5px)",
  glassBlurSoft: "blur(4px)",
} as const;

export const fontStacks = {
  ui: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
} as const;

export function neutralButtonStyle(enabled: boolean, hovered: boolean, tone: NeutralButtonTone = "default"): CSSProperties {
  const isDanger = tone === "danger";
  const borderColor = hovered && enabled
    ? (isDanger ? "rgba(220, 38, 38, 0.52)" : "rgba(0, 0, 0, 0.42)")
    : (isDanger ? "rgba(248, 113, 113, 0.42)" : "rgba(185, 198, 188, 0.86)");
  const backgroundColor = hovered && enabled
    ? (isDanger ? "linear-gradient(180deg, rgba(255, 241, 242, 0.96) 0%, rgba(254, 226, 226, 0.92) 100%)" : "linear-gradient(180deg, rgba(245, 248, 245, 0.96) 0%, rgba(238, 243, 238, 0.9) 100%)")
    : "linear-gradient(180deg, rgba(243, 247, 243, 0.94) 0%, rgba(238, 243, 238, 0.84) 100%)";
  const textColor = enabled
    ? (isDanger ? (hovered ? colors.danger800 : colors.danger900) : colors.black)
    : colors.black;
  const buttonShadow = hovered && enabled
    ? (isDanger ? "0 16px 34px rgba(220, 38, 38, 0.22)" : "0 16px 34px rgba(17, 24, 39, 0.16)")
    : "0 10px 24px rgba(17, 24, 39, 0.1)";

  return {
    height: 48,
    borderRadius: radius.md,
    border: `1px solid ${borderColor}`,
    background: backgroundColor,
    color: textColor,
    fontSize: 14,
    fontWeight: 900,
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.55,
    boxShadow: buttonShadow,
    transform: enabled && hovered ? "translateY(-1px)" : "translateY(0)",
    transition: "background 140ms ease, border-color 140ms ease, box-shadow 140ms ease, color 140ms ease, transform 140ms ease",
  };
}

export function buttonStyle(_enabled: boolean): CSSProperties {
  return {
    width: "100%",
    minHeight: 52,
    padding: "0 16px",
    fontSize: 16,
    fontWeight: 900,
  };
}

export function attackButtonStyle(enabled: boolean): CSSProperties {
  return {
    minWidth: 116,
    height: 44,
    padding: "0 14px",
    fontSize: 14,
    fontWeight: 900,
    opacity: enabled ? 1 : 0.9,
  };
}

export function previewAccentButtonStyle(enabled: boolean, hovered: boolean, accent: string): CSSProperties {
  return {
    width: "100%",
    borderRadius: radius.md,
    border: enabled ? `1px solid ${hovered ? accent : colors.neutralBorderStrong}` : borders.neutralStrong,
    background: enabled && hovered ? accent : colors.glassStrong,
    padding: 10,
    color: enabled ? (hovered ? colors.white : colors.black) : colors.black,
    textAlign: "left",
    fontSize: 13,
    fontWeight: 900,
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.62,
    boxShadow: enabled && hovered ? `0 12px 28px ${alphaColor(accent, 0.22)}` : "0 8px 18px rgba(17,24,39,0.08)",
    transform: enabled && hovered ? "translateY(-1px)" : "translateY(0)",
    transition: "background 140ms ease, border-color 140ms ease, color 140ms ease, box-shadow 140ms ease, transform 140ms ease",
  };
}

export const overlaySurfaceStyle: CSSProperties = {
  borderRadius: radius.lg,
  border: borders.neutralStrong,
  background: "linear-gradient(180deg, rgba(238, 243, 238, 0.94) 0%, rgba(231, 238, 232, 0.9) 100%)",
  color: colors.black,
  boxShadow: shadows.overlay,
};

export const overlayButtonStyle: CSSProperties = {
  height: 34,
  padding: "0 12px",
  fontSize: 12,
};

export const overlayBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "grid",
  placeItems: "center",
  padding: 16,
  background: "rgba(15, 23, 42, 0.62)",
};

export const previewKickerStyle: CSSProperties = {
  color: "var(--ui-text-color, #05070a)",
  textShadow: "var(--ui-text-shadow, 0 1px 0 rgba(255, 255, 255, 0.92), 0 0 1px rgba(255, 255, 255, 0.9), 0 2px 10px rgba(0, 0, 0, 0.35))",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0,
  textTransform: "uppercase",
};

export const inlineEnergyLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  flexWrap: "wrap",
};

export const glassPanelStyle: CSSProperties = {
  borderRadius: radius.md,
  border: borders.glassStrong,
  background: colors.glass,
  boxShadow: shadows.xl,
  backdropFilter: filters.glassBlur,
};

export const GLASS_TILE_BACKGROUND = colors.glass;
export const GLASS_TILE_BACKDROP_FILTER = filters.glassBlur;
export const uiTextColor = "var(--ui-text-color, #05070a)";
export const uiTextShadow = "var(--ui-text-shadow, 0 1px 0 rgba(255, 255, 255, 0.92), 0 0 1px rgba(255, 255, 255, 0.9), 0 2px 10px rgba(0, 0, 0, 0.35))";
export const uiMutedTextColor = "var(--ui-muted-text-color, rgba(100, 113, 104, 0.52))";
