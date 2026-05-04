import type { CSSProperties } from "react";
import { getCard } from "../../game/engine";
import { HoloCardImage } from "../../components/cards/HoloCardImage";
import { CARD_ASPECT_RATIO, CARD_INSPECT_IMAGE_RADIUS, colors, radius, shadows } from "../../styles/shared";

export type CardFlowAnchor = "bottomLeft" | "bottomRight" | "leftDeck" | "rightDiscard" | "rightHand" | "leftHand";
export type CardFlowGroup = "drawn" | "retrieved" | "played" | "discarded";

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

  const drawnItems = items.filter((item) => resolveGroup(item) === "drawn").slice(0, 5);
  const retrievedItems = items.filter((item) => resolveGroup(item) === "retrieved").slice(0, 5);
  const playedItems = items.filter((item) => resolveGroup(item) === "played").slice(0, 5);
  const discardedItems = items.filter((item) => resolveGroup(item) === "discarded").slice(0, 5);
  const groups = [
    { key: "drawn", title: titleForCount(drawnItems.length, "Card Drawn", "Cards Drawn"), items: drawnItems },
    { key: "retrieved", title: titleForCount(retrievedItems.length, "Card Retrieved", "Cards Retrieved"), items: retrievedItems },
    { key: "played", title: titleForCount(playedItems.length, "Card Played", "Cards Played"), items: playedItems },
    { key: "discarded", title: titleForCount(discardedItems.length, "Card Discarded", "Cards Discarded"), items: discardedItems },
  ].filter((group) => group.items.length > 0);
  const totalRendered = groups.reduce((count, group) => count + group.items.length, 0);
  let renderedIndex = 0;
  const groupsWithIndexes = groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ item, globalIndex: renderedIndex++ })),
  }));

  return (
    <div style={rootStyle} aria-live="polite">
      <style>{buildKeyframes()}</style>
      <div style={dimStyle(durationMs)} />
      <div style={boxStyle(groups.length)}>
        {groupsWithIndexes.map((group) => (
          <div key={group.key} style={groupShellStyle(groups.length)}>
            <div style={groupHeaderStyle(durationMs)}>{group.title}</div>
            <div style={groupRowStyle(group.items.length)}>
              {group.items.map(({ item, globalIndex }) => renderFlowCard(
                item,
                globalIndex,
                group.items.length,
                totalRendered,
                durationMs,
                onDone,
              ))}
            </div>
          </div>
        ))}
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

function boxStyle(groupCount: number): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    display: "grid",
    gridTemplateColumns: `repeat(${groupCount}, minmax(0, 1fr))`,
    alignItems: "center",
    justifyItems: "center",
    padding: "0 min(4vw, 56px)",
    columnGap: "min(3vw, 42px)",
  };
}

function groupShellStyle(groupCount: number): CSSProperties {
  return {
    width: groupCount === 1 ? "min(72vw, 960px)" : "100%",
    minHeight: "min(62vh, 620px)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  };
}

function groupRowStyle(itemCount: number): CSSProperties {
  return {
    width: "100%",
    display: "flex",
    flexWrap: "nowrap",
    gap: "clamp(4px, 0.45vw, 8px)",
    alignItems: "center",
    justifyContent: "center",
  };
}

function itemShellStyle(group: CardFlowGroup, groupCount: number): CSSProperties {
  return {
    position: "relative",
    width: `min(240px, calc((100% - ${(Math.max(groupCount, 1) - 1) * 8}px) / ${Math.min(Math.max(groupCount, 1), 5)}))`,
    minWidth: 0,
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
    letterSpacing: 0,
    textTransform: "uppercase",
    textShadow: "0 4px 18px rgba(0, 0, 0, 0.8)",
    whiteSpace: "nowrap",
    animation: `card-flow-label ${durationMs}ms ease both`,
  };
}

function cardWrapStyle(durationMs: number, enterFrom: CardFlowAnchor, exitTo: CardFlowAnchor): CSSProperties {
  const shouldTravel = enterFrom !== exitTo;
  return {
    position: "relative",
    zIndex: 1,
    width: "100%",
    aspectRatio: CARD_ASPECT_RATIO,
    borderRadius: radius.md,
    boxShadow: shadows.xl,
    transformOrigin: "center center",
    animation: `${shouldTravel ? "card-flow-card" : "card-flow-fade"} ${durationMs}ms cubic-bezier(0.2, 0.8, 0.18, 1) both`,
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
      return { x: "calc(50vw - 28px)", y: "calc(50vh - 28px)" };
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

@keyframes card-flow-fade {
  0% {
    opacity: 0;
    transform: scale(0.96);
  }
  18% {
    opacity: 1;
    transform: scale(1);
  }
  66% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(0.96);
  }
}

@keyframes card-flow-label {
  0% { opacity: 0; transform: translateY(12px); }
  16% { opacity: 1; transform: translateY(0); }
  66% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-12px); }
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
  if (normalized.includes("retriev")) return "retrieved";
  if (normalized.includes("play")) return "played";
  if (normalized.includes("discard")) return "discarded";
  return "drawn";
}

function titleForCount(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function renderFlowCard(
  item: CardFlowItem,
  index: number,
  groupCount: number,
  totalCount: number,
  durationMs: number,
  onDone: () => void,
) {
  const card = getCard(item.cardId);
  const image = card.kind === "umamusume" ? card.portrait : card.image;
  const group = resolveGroup(item);
  const doneHandler = index === totalCount - 1 ? onDone : undefined;
  return (
    <div key={`${item.cardId}-${group}-${index}`} style={itemShellStyle(group, groupCount)}>
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
