import type { CSSProperties } from "react";
import { NeutralButton } from "../components/NeutralButton";
import { overlayButtonStyle, overlaySurfaceStyle } from "../styles/shared";

export function ActionNotice({ notice, onClose }: { notice: string; onClose: () => void }) {
  return (
    <section style={actionNoticeStyle}>
      <strong style={actionNoticeTextStyle}>{notice}</strong>
      <NeutralButton style={actionNoticeCloseStyle} onClick={onClose}>Close</NeutralButton>
    </section>
  );
}

const actionNoticeStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: 18,
  zIndex: 46,
  width: "min(760px, calc(100vw - 32px))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  transform: "translateX(-50%)",
  padding: "12px 86px 12px 18px",
  textAlign: "center",
  minHeight: 30,
  ...overlaySurfaceStyle,
};

const actionNoticeTextStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 0,
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  lineHeight: 1.35,
  textAlign: "center",
};

const actionNoticeCloseStyle: CSSProperties = {
  ...overlayButtonStyle,
  position: "absolute",
  right: 14,
  top: "50%",
  transform: "translateY(-50%)",
};
