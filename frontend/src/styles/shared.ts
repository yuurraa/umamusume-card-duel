import type { CSSProperties } from "react";
import { alphaColor } from "../utils/color";

export type NeutralButtonTone = "default" | "danger";

export function neutralButtonStyle(enabled: boolean, hovered: boolean, tone: NeutralButtonTone = "default"): CSSProperties {
  const isDanger = tone === "danger";
  const borderColor = hovered && enabled
    ? (isDanger ? "rgba(220, 38, 38, 0.52)" : "rgba(0, 0, 0, 0.42)")
    : (isDanger ? "rgba(248, 113, 113, 0.42)" : "rgba(185, 198, 188, 0.86)");
  const backgroundColor = hovered && enabled
    ? (isDanger ? "linear-gradient(180deg, rgba(255, 241, 242, 0.96) 0%, rgba(254, 226, 226, 0.92) 100%)" : "linear-gradient(180deg, rgba(245, 248, 245, 0.96) 0%, rgba(238, 243, 238, 0.9) 100%)")
    : "linear-gradient(180deg, rgba(243, 247, 243, 0.94) 0%, rgba(238, 243, 238, 0.84) 100%)";
  const textColor = enabled
    ? (isDanger ? (hovered ? "#991b1b" : "#7f1d1d") : "#000000")
    : "#000000";
  const buttonShadow = hovered && enabled
    ? (isDanger ? "0 16px 34px rgba(220, 38, 38, 0.22)" : "0 16px 34px rgba(17, 24, 39, 0.16)")
    : "0 10px 24px rgba(17, 24, 39, 0.1)";

  return {
    height: 48,
    borderRadius: 8,
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
    borderRadius: 8,
    border: enabled ? `1px solid ${hovered ? accent : "rgba(185, 198, 188, 0.9)"}` : "1px solid rgba(185, 198, 188, 0.9)",
    background: enabled && hovered ? accent : "rgba(238, 243, 238, 0.9)",
    padding: 10,
    color: enabled ? (hovered ? "#ffffff" : "#000000") : "#000000",
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
  borderRadius: 12,
  border: "1px solid rgba(185, 198, 188, 0.9)",
  background: "linear-gradient(180deg, rgba(238, 243, 238, 0.94) 0%, rgba(231, 238, 232, 0.9) 100%)",
  color: "#000000",
  boxShadow: "0 22px 68px rgba(17, 24, 39, 0.2)",
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
  borderRadius: 8,
  border: "1px solid rgba(217, 225, 218, 0.76)",
  background: "rgba(238, 243, 238, 0.22)",
  boxShadow: "0 18px 46px rgba(17, 24, 39, 0.14)",
  backdropFilter: "blur(5px)",
};

export const GLASS_TILE_BACKGROUND = "rgba(238, 243, 238, 0.22)";
export const GLASS_TILE_BACKDROP_FILTER = "blur(5px)";
export const uiTextColor = "var(--ui-text-color, #05070a)";
export const uiTextShadow = "var(--ui-text-shadow, 0 1px 0 rgba(255, 255, 255, 0.92), 0 0 1px rgba(255, 255, 255, 0.9), 0 2px 10px rgba(0, 0, 0, 0.35))";
export const uiMutedTextColor = "var(--ui-muted-text-color, rgba(100, 113, 104, 0.52))";
