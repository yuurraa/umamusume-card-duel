import type { CSSProperties } from "react";
import { previewKickerStyle } from "../../styles/shared";

export function OpponentActionBanner({ title, message, paused }: { title: string; message: string; paused: boolean }) {
  return (
    <section style={opponentActionBannerStyle}>
      <span style={opponentPulseStyle(paused)} />
      <div style={{ minWidth: 0 }}>
        <div style={opponentKickerStyle}>{title}</div>
        <strong style={opponentActionTextStyle}>{message}</strong>
      </div>
    </section>
  );
}

const opponentActionBannerStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  top: 16,
  zIndex: 44,
  width: "min(520px, calc(100vw - 32px))",
  display: "grid",
  gridTemplateColumns: "28px minmax(0, 1fr)",
  alignItems: "center",
  gap: 10,
  transform: "translateX(-50%)",
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid rgba(217, 225, 218, 0.86)",
  background: "rgba(238, 243, 238, 0.9)",
  boxShadow: "0 18px 48px rgba(17, 24, 39, 0.18)",
  pointerEvents: "none",
};

function opponentPulseStyle(paused: boolean): CSSProperties {
  return {
    width: 22,
    height: 22,
    borderRadius: "50%",
    border: "1px solid rgba(23, 33, 28, 0.18)",
    background: paused ? "#94a3b8" : "#26312d",
    boxShadow: paused
      ? "0 0 0 7px rgba(148, 163, 184, 0.16)"
      : "0 0 0 7px rgba(38, 49, 45, 0.12), 0 0 22px rgba(38, 49, 45, 0.22)",
    transition: "background 180ms ease, box-shadow 180ms ease",
  };
}

const opponentActionTextStyle: CSSProperties = {
  display: "block",
  marginTop: 2,
  color: "#000000",
  textShadow: "none",
  fontSize: 14,
  lineHeight: 1.25,
  fontWeight: 950,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const opponentKickerStyle: CSSProperties = {
  ...previewKickerStyle,
  color: "#000000",
  textShadow: "none",
};
