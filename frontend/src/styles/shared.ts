import type { CSSProperties } from "react";
import { alphaColor } from "../utils/color";

export function neutralButtonStyle(enabled: boolean, hovered: boolean): CSSProperties {
  return {
    height: 48,
    borderRadius: 8,
    border: `1px solid ${hovered && enabled ? "rgba(100, 113, 104, 0.34)" : "rgba(203, 213, 225, 0.9)"}`,
    background: hovered && enabled ? "rgba(241, 245, 249, 0.98)" : "rgba(255, 255, 255, 0.92)",
    color: enabled ? "#17211c" : "#647168",
    fontSize: 14,
    fontWeight: 900,
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.55,
    boxShadow: hovered && enabled ? "0 16px 36px rgba(17, 24, 39, 0.14)" : "0 12px 28px rgba(17, 24, 39, 0.1)",
    transition: "background 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
  };
}

export function buttonStyle(enabled: boolean): CSSProperties {
  return { ...neutralButtonStyle(enabled, false) };
}

export function attackButtonStyle(enabled: boolean): CSSProperties {
  return { ...neutralButtonStyle(enabled, false) };
}

export function previewAccentButtonStyle(enabled: boolean, hovered: boolean, accent: string): CSSProperties {
  return {
    width: "100%",
    borderRadius: 8,
    border: enabled ? `1px solid ${hovered ? accent : "rgba(203, 213, 225, 0.9)"}` : "1px solid rgba(203, 213, 225, 0.9)",
    background: enabled && hovered ? accent : "#ffffff",
    padding: 10,
    color: enabled ? (hovered ? "#ffffff" : "#17211c") : "#647168",
    textAlign: "left",
    fontSize: 13,
    fontWeight: 900,
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.62,
    boxShadow: enabled && hovered ? `0 12px 28px ${alphaColor(accent, 0.22)}` : "0 8px 18px rgba(17,24,39,0.08)",
    transition: "background 140ms ease, border-color 140ms ease, color 140ms ease, box-shadow 140ms ease",
  };
}

export const overlaySurfaceStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(203, 213, 225, 0.9)",
  background: "linear-gradient(180deg, rgba(248, 250, 252, 0.98) 0%, rgba(255, 255, 255, 0.95) 100%)",
  color: "#17211c",
  boxShadow: "0 22px 68px rgba(17, 24, 39, 0.2)",
};

export const overlayButtonStyle: CSSProperties = {
  ...neutralButtonStyle(true, false),
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
  color: "#647168",
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
