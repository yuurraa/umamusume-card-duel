import type { CSSProperties } from "react";
import { getCard } from "../../game/engine";
import { HoloCardImage } from "../../components/cards/HoloCardImage";
import { CARD_ASPECT_RATIO, CARD_INSPECT_IMAGE_RADIUS, colors, radius, shadows } from "../../styles/shared";

export type CardFlowAnchor = "bottomLeft" | "bottomRight" | "leftDeck" | "rightDiscard" | "rightHand" | "leftHand";
export type CardFlowGroup = "drawn" | "discarded";

export type CardFlowItem = {
  cardId: string;
  label?: string;
  group?: CardFlowGroup;
  enterFrom: CardFlowAnchor;
  exitTo: CardFlowAnchor;
};

export function CardFlowOverlay({
  items,
  onDone,
  durationMs = 2100,
}: {
  items: CardFlowItem[];
  onDone: () => void;
  durationMs?: number;
}) {
  if (items.length === 0) return null;

  return (
    <div style={rootStyle} aria-live="polite">
      <style>{buildKeyframes()}</style>
      <div style={dimStyle(durationMs)} />
      <div style={boxStyle}>
        <div style={groupShellStyle("left")}>
          <div style={groupHeaderStyle(durationMs)}>Cards Drawn</div>
          <div style={groupRowStyle}>
            {items
              .map((item, index) => ({ item, index }))
              .filter(({ item }) => resolveGroup(item) === "drawn")
              .map(({ item, index }) => renderFlowCard(item, index, items.length, durationMs, onDone))}
          </div>
        </div>
        <div style={groupShellStyle("right")}>
          <div style={groupHeaderStyle(durationMs)}>Cards Discarded/Played</div>
          <div style={groupRowStyle}>
            {items
              .map((item, index) => ({ item, index }))
              .filter(({ item }) => resolveGroup(item) === "discarded")
              .map(({ item, index }) => renderFlowCard(item, index, items.length, durationMs, onDone))}
          </div>
        </div>
      </div>
    </div>
  );
}

const rootStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 70,
  pointerEvents: "none",
};

const boxStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 min(5vw, 70px)",
  gap: "min(6vw, 90px)",
};

function groupShellStyle(side: "left" | "right"): CSSProperties {
  return {
    width: "min(44vw, 840px)",
    minHeight: "min(62vh, 620px)",
    display: "flex",
    flexDirection: "column",
    alignItems: side === "left" ? "flex-start" : "flex-end",
    justifyContent: "center",
    gap: 16,
  };
}

const groupRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  alignItems: "center",
};

function itemShellStyle(group: CardFlowGroup): CSSProperties {
  return {
    position: "relative",
    width: "min(240px, 21vw)",
    transform: group === "drawn" ? "translateX(0)" : "translateX(0)",
  };
}

function dimStyle(durationMs: number): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    background: colors.black,
    animation: `card-flow-dim ${durationMs}ms ease both`,
  };
}

function groupHeaderStyle(durationMs: number): CSSProperties {
  return {
    position: "relative",
    zIndex: 2,
    color: "#f8fafc",
    fontSize: "clamp(20px, 2.35vw, 34px)",
    fontWeight: 900,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    textShadow: "0 4px 18px rgba(0, 0, 0, 0.8)",
    whiteSpace: "nowrap",
    animation: `card-flow-label ${durationMs}ms ease both`,
  };
}

function cardWrapStyle(durationMs: number, enterFrom: CardFlowAnchor, exitTo: CardFlowAnchor): CSSProperties {
  return {
    position: "relative",
    zIndex: 1,
    width: "min(310px, 38vw)",
    aspectRatio: CARD_ASPECT_RATIO,
    borderRadius: radius.md,
    boxShadow: shadows.xl,
    transformOrigin: "center center",
    animation: `card-flow-card ${durationMs}ms cubic-bezier(0.2, 0.8, 0.18, 1) both`,
    ["--card-flow-start-x" as string]: anchorToTranslate(enterFrom).x,
    ["--card-flow-start-y" as string]: anchorToTranslate(enterFrom).y,
    ["--card-flow-end-x" as string]: anchorToTranslate(exitTo).x,
    ["--card-flow-end-y" as string]: anchorToTranslate(exitTo).y,
  } as CSSProperties;
}

const cardImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: radius.md,
  objectFit: "contain",
  display: "block",
};

function anchorToTranslate(anchor: CardFlowAnchor): { x: string; y: string } {
  switch (anchor) {
    case "bottomLeft":
    case "leftDeck":
      return { x: "calc(-50vw + 100px)", y: "calc(50vh - 116px)" };
    case "bottomRight":
    case "rightDiscard":
      return { x: "calc(50vw - 100px)", y: "calc(50vh - 116px)" };
    case "rightHand":
      return { x: "0", y: "calc(50vh - 18px)" };
    case "leftHand":
      return { x: "0", y: "calc(50vh - 18px)" };
    default:
      return { x: "0", y: "0" };
  }
}

function buildKeyframes(): string {
  return `
@keyframes card-flow-dim {
  0% { opacity: 0; }
  12% { opacity: 0.58; }
  66% { opacity: 0.58; }
  100% { opacity: 0; }
}

@keyframes card-flow-card {
  0% {
    opacity: 0;
    transform: translate3d(var(--card-flow-start-x), var(--card-flow-start-y), 0) scale(0.16);
  }
  18% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
  66% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--card-flow-end-x), var(--card-flow-end-y), 0) scale(0.16);
  }
}

@keyframes card-flow-label {
  0% { opacity: 0; transform: translateX(-50%) translateY(12px); }
  16% { opacity: 1; transform: translateX(-50%) translateY(0); }
  66% { opacity: 1; transform: translateX(-50%) translateY(0); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-12px); }
}

@media (max-width: 980px) {
  @keyframes card-flow-card {
    0% {
      opacity: 0;
      transform: translate3d(var(--card-flow-start-x), var(--card-flow-start-y), 0) scale(0.2);
    }
    18% {
      opacity: 1;
      transform: translate3d(0, 0, 0) scale(0.93);
    }
    66% {
      opacity: 1;
      transform: translate3d(0, 0, 0) scale(0.93);
    }
    100% {
      opacity: 0;
      transform: translate3d(var(--card-flow-end-x), var(--card-flow-end-y), 0) scale(0.2);
    }
  }
}
`;
}

function resolveGroup(item: CardFlowItem): CardFlowGroup {
  if (item.group) return item.group;
  const normalized = (item.label ?? "").toLowerCase();
  if (normalized.includes("discard") || normalized.includes("play")) return "discarded";
  return "drawn";
}

function renderFlowCard(
  item: CardFlowItem,
  index: number,
  totalCount: number,
  durationMs: number,
  onDone: () => void,
) {
  const card = getCard(item.cardId);
  const image = card.kind === "umamusume" ? card.portrait : card.image;
  const group = resolveGroup(item);
  const doneHandler = index === totalCount - 1 ? onDone : undefined;
  return (
    <div key={`${item.cardId}-${index}`} style={itemShellStyle(group)}>
      <div style={cardWrapStyle(durationMs, item.enterFrom, item.exitTo)} onAnimationEnd={doneHandler}>
        <HoloCardImage
          card={card}
          src={image}
          alt={card.name}
          imageStyle={cardImageStyle}
          radiusOverride={CARD_INSPECT_IMAGE_RADIUS}
          disableHoverAnimation
        />
      </div>
    </div>
  );
}
