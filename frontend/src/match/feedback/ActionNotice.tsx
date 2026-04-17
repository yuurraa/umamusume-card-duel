import type { CSSProperties } from "react";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { overlayButtonStyle, overlaySurfaceStyle } from "../../styles/shared";

type ActionNoticeTone = "default" | "danger" | "info";
type ActionNoticePlacement = "top" | "bottom";

export function ActionNotice({
  notice,
  onClose,
  tone = "default",
  placement = "bottom",
  interactive = true,
}: {
  notice: string;
  onClose: () => void;
  tone?: ActionNoticeTone;
  placement?: ActionNoticePlacement;
  interactive?: boolean;
}) {
  return (
    <section style={actionNoticeStyle(tone, placement, interactive)}>
      <strong style={actionNoticeTextStyle(tone)}>{notice}</strong>
      {interactive && <NeutralButton tone={tone === "danger" ? "danger" : "default"} style={actionNoticeCloseStyle} onClick={onClose}>Close</NeutralButton>}
    </section>
  );
}

function actionNoticeStyle(tone: ActionNoticeTone, placement: ActionNoticePlacement, interactive: boolean): CSSProperties {
  const isDanger = tone === "danger";
  const isInfo = tone === "info";
  const verticalPosition = placement === "top" ? { top: 18 } : { bottom: 18 };
  return {
    position: "fixed",
    left: "50%",
    ...verticalPosition,
    zIndex: 46,
    width: "min(760px, calc(100vw - 32px))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    transform: "translateX(-50%)",
    padding: interactive ? "12px 86px 12px 18px" : "12px 18px",
    textAlign: "center",
    minHeight: 30,
    pointerEvents: interactive ? "auto" : "none",
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
