import { type CSSProperties, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { SideId } from "../../../../shared/src/types";
import { colors, fontStacks, radius, shadows } from "../../styles/shared";

type PointGainEvent = {
  id: number;
  side: SideId;
  points: number;
};

export function PointGainOverlay({
  event,
  onDone,
  durationMs = 2500,
}: {
  event: PointGainEvent;
  onDone: () => void;
  durationMs?: number;
}) {
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => onDoneRef.current(), durationMs);
    return () => window.clearTimeout(timeoutId);
  }, [durationMs, event.id]);

  const label = event.side === "player" ? "You gained a point" : "Opponent gained a point";
  const overlay = (
    <div style={rootStyle} aria-live="polite">
      <style>{KEYFRAMES}</style>
      <div style={backdropStyle} aria-hidden="true" />
      <section style={popupStyle(event.side)}>
        <div style={burstStyle} aria-hidden="true" />
        <div style={kickerStyle}>KO Reward</div>
        <div style={titleStyle}>{label}</div>
        <div style={pointRowStyle} aria-label={`${event.points} points`}>
          {Array.from({ length: 3 }, (_, index) => (
            <span
              key={index}
              style={pointPipStyle(index < event.points, event.side, index)}
            />
          ))}
        </div>
      </section>
    </div>
  );

  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}

const KEYFRAMES = `
@keyframes point-gain-pop {
  0% { opacity: 0; transform: translateY(12px) scale(0.96); filter: blur(6px); }
  18% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
  78% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
  100% { opacity: 0; transform: translateY(-10px) scale(0.98); filter: blur(5px); }
}

@keyframes point-gain-backdrop {
  0% { opacity: 0; }
  18% { opacity: 1; }
  78% { opacity: 1; }
  100% { opacity: 0; }
}

@keyframes point-gain-burst {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4) rotate(0deg); }
  35% { opacity: 0.9; transform: translate(-50%, -50%) scale(1) rotate(28deg); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.75) rotate(68deg); }
}

@keyframes point-pip-pop {
  0% { opacity: 0; transform: translateY(8px) scale(0.45); }
  55% { opacity: 1; transform: translateY(-3px) scale(1.16); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
`;

const rootStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 46,
  display: "grid",
  placeItems: "center",
  pointerEvents: "none",
  fontFamily: fontStacks.ui,
};

const backdropStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(15, 23, 42, 0.62)",
  animation: "point-gain-backdrop 2000ms ease both",
};

function popupStyle(side: SideId): CSSProperties {
  const playerTone = side === "player";
  const accent = playerTone ? "#22c55e" : "#f59e0b";
  return {
    position: "relative",
    minWidth: "min(340px, calc(100vw - 40px))",
    overflow: "hidden",
    borderRadius: radius.lg,
    border: `1px solid ${playerTone ? "rgba(34, 197, 94, 0.5)" : "rgba(245, 158, 11, 0.5)"}`,
    background: `linear-gradient(180deg, rgba(248, 250, 252, 0.96) 0%, ${playerTone ? "rgba(220, 252, 231, 0.94)" : "rgba(254, 243, 199, 0.94)"} 100%)`,
    boxShadow: `${shadows.overlay}, 0 0 32px ${playerTone ? "rgba(34, 197, 94, 0.22)" : "rgba(245, 158, 11, 0.22)"}`,
    color: colors.black,
    fontFamily: fontStacks.ui,
    textAlign: "center",
    textShadow: "none",
    padding: "18px 24px 18px",
    animation: "point-gain-pop 2000ms cubic-bezier(0.16, 1, 0.3, 1) both",
    ["--point-accent" as string]: accent,
  };
}

const burstStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  width: 260,
  height: 260,
  borderRadius: radius.circle,
  background: "radial-gradient(circle, var(--point-accent) 0%, rgba(255, 255, 255, 0.42) 34%, transparent 68%)",
  opacity: 0,
  animation: "point-gain-burst 920ms ease-out both",
  pointerEvents: "none",
};

const kickerStyle: CSSProperties = {
  position: "relative",
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: 0.4,
  textTransform: "uppercase",
};

const titleStyle: CSSProperties = {
  position: "relative",
  marginTop: 6,
  fontSize: "clamp(20px, 1.7vw, 28px)",
  lineHeight: 1,
  fontWeight: 950,
};

const pointRowStyle: CSSProperties = {
  position: "relative",
  marginTop: 16,
  display: "flex",
  justifyContent: "center",
  gap: 12,
};

function pointPipStyle(filled: boolean, side: SideId, index: number): CSSProperties {
  const accent = side === "player" ? "#22c55e" : "#f59e0b";
  return {
    width: 28,
    height: 28,
    borderRadius: radius.circle,
    border: `3px solid ${filled ? accent : "rgba(15, 23, 42, 0.28)"}`,
    background: filled ? `radial-gradient(circle at 35% 28%, #ffffff 0%, ${accent} 42%, #111827 150%)` : "rgba(255, 255, 255, 0.58)",
    boxShadow: filled ? `0 8px 18px ${side === "player" ? "rgba(34, 197, 94, 0.34)" : "rgba(245, 158, 11, 0.34)"}` : "none",
    animation: filled ? `point-pip-pop 380ms cubic-bezier(0.18, 0.82, 0.22, 1) ${220 + index * 110}ms both` : undefined,
  };
}
