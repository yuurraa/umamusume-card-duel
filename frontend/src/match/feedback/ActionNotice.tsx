import type { CSSProperties } from "react";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { overlayButtonStyle, overlaySurfaceStyle } from "../../styles/shared";

type ActionNoticeTone = "default" | "danger" | "info";

export function ActionNotice({ notice, onClose, tone = "default" }: { notice: string; onClose: () => void; tone?: ActionNoticeTone }) {
  return (
    <section style={actionNoticeStyle(tone)}>
      <strong style={actionNoticeTextStyle(tone)}>{notice}</strong>
      <NeutralButton tone={tone === "danger" ? "danger" : "default"} style={actionNoticeCloseStyle} onClick={onClose}>Close</NeutralButton>
    </section>
  );
}

function actionNoticeStyle(tone: ActionNoticeTone): CSSProperties {
  const isDanger = tone === "danger";
  const isInfo = tone === "info";
  return {
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
    border: isDanger
      ? "1px solid rgba(220, 38, 38, 0.38)"
      : isInfo
        ? "1px solid rgba(37, 99, 235, 0.34)"
        : overlaySurfaceStyle.border,
    background: isDanger
      ? "linear-gradient(180deg, rgba(254, 242, 242, 0.98) 0%, rgba(255, 255, 255, 0.96) 100%)"
      : isInfo
        ? "linear-gradient(180deg, rgba(239, 246, 255, 0.98) 0%, rgba(255, 255, 255, 0.96) 100%)"
        : overlaySurfaceStyle.background,
    boxShadow: isDanger
      ? "0 22px 68px rgba(220, 38, 38, 0.18)"
      : isInfo
        ? "0 22px 68px rgba(37, 99, 235, 0.16)"
        : overlaySurfaceStyle.boxShadow,
  };
}

function actionNoticeTextStyle(tone: ActionNoticeTone): CSSProperties {
  return {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    lineHeight: 1.35,
    textAlign: "center",
    color: tone === "danger" ? "#7f1d1d" : tone === "info" ? "#1e3a8a" : "#17211c",
  };
}

const actionNoticeCloseStyle: CSSProperties = {
  ...overlayButtonStyle,
  position: "absolute",
  right: 14,
  top: "50%",
  transform: "translateY(-50%)",
};
