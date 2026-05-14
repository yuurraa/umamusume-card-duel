import { type AnimationEvent, type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getCard } from "../../game/engine";
import { HoloCardImage } from "../../components/cards/HoloCardImage";
import { CARD_ASPECT_RATIO, colors, radius, shadows } from "../../styles/shared";
import { isImagePreloaded, preloadImage } from "../../utils/imagePreload";

export type CardFlowAnchor = "bottomLeft" | "bottomCenter" | "bottomRight" | "leftDeck" | "rightDiscard" | "rightHand" | "leftHand";
export type CardFlowGroup = "drawn" | "retrieved" | "played" | "discarded";

export type CardFlowItem = {
  cardId: string;
  label?: string;
  group?: CardFlowGroup;
  enterFrom: CardFlowAnchor;
  exitTo: CardFlowAnchor;
  faceDownImage?: string | null | undefined;
  fadeOutInPlace?: boolean | undefined;
};

const CARD_FLOW_IMAGE_RADIUS = 8;

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

  const [endDeltaXByGlobalIndex, setEndDeltaXByGlobalIndex] = useState<Record<number, number>>({});
  // Track the static (non-animated) slot position for each rendered card so we can
  // compute a screen-space delta to center. This must NOT be the animated node,
  // because animation-fill-mode applies the 0% transform during the delay.
  const slotNodeByGlobalIndexRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const MEASURE_PAD_MS = 70;

  const drawnItems = items.filter((item) => resolveGroup(item) === "drawn").slice(0, 10);
  const retrievedItems = items.filter((item) => resolveGroup(item) === "retrieved").slice(0, 10);
  const playedItems = items.filter((item) => resolveGroup(item) === "played").slice(0, 10);
  const discardedItems = items.filter((item) => resolveGroup(item) === "discarded").slice(0, 10);
  const groups = [
    { key: "drawn", title: titleForGroup(drawnItems, "Card Drawn", "Cards Drawn"), items: drawnItems },
    { key: "retrieved", title: titleForGroup(retrievedItems, "Card Retrieved", "Cards Retrieved"), items: retrievedItems },
    { key: "played", title: titleForGroup(playedItems, "Card Played", "Cards Played"), items: playedItems },
    { key: "discarded", title: titleForGroup(discardedItems, "Card Discarded", "Cards Discarded"), items: discardedItems },
  ].filter((group) => group.items.length > 0);
  const totalRendered = groups.reduce((count, group) => count + group.items.length, 0);
  const staggerMs = 90;
  const totalDurationMs = MEASURE_PAD_MS + durationMs + Math.max(0, totalRendered - 1) * staggerMs;
  let renderedIndex = 0;
  const groupsWithIndexes = groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ item, globalIndex: renderedIndex++ })),
  }));

  useLayoutEffect(() => {
    const convergingGroups = groupsWithIndexes.filter((group) => group.key === "drawn" || group.key === "retrieved");
    if (convergingGroups.length === 0) return;
    let raf = window.requestAnimationFrame(() => {
      const centerX = window.innerWidth / 2;
      const next: Record<number, number> = {};
      convergingGroups.forEach((group) => {
        group.items.forEach(({ globalIndex }) => {
          const node = slotNodeByGlobalIndexRef.current.get(globalIndex);
          if (!node) return;
          const rect = node.getBoundingClientRect();
          const cardCenterX = rect.left + rect.width / 2;
          next[globalIndex] = Math.round(centerX - cardCenterX);
        });
      });
      setEndDeltaXByGlobalIndex((current) => {
        const currentKeys = Object.keys(current);
        const nextKeys = Object.keys(next);
        if (currentKeys.length !== nextKeys.length) return next;
        for (const key of nextKeys) {
          const numericKey = Number(key);
          if (current[numericKey] !== next[numericKey]) return next;
        }
        return current;
      });
    });
    return () => window.cancelAnimationFrame(raf);
  // Only re-measure when a new overlay `items` set is shown.
  }, [items]);

  return (
    <div style={rootStyle} aria-live="polite">
      <style>{buildKeyframes()}</style>
      <div style={dimStyle(totalDurationMs)} />
      <div style={boxStyle(groups.length)}>
        {groupsWithIndexes.map((group) => (
          <div key={group.key} style={groupShellStyle(groups.length)}>
            <div style={groupHeaderStyle(totalDurationMs)}>{group.title}</div>
            <div style={groupRowStyle(group.items.length)}>
              {group.items.map(({ item, globalIndex }) => (
                <FlowCard
                  key={`${item.cardId}-${group.key}-${globalIndex}`}
                  item={item}
                  index={globalIndex}
                  groupCount={group.items.length}
                  totalCount={totalRendered}
                  durationMs={durationMs}
                  staggerMs={staggerMs}
                  endDeltaXByGlobalIndex={endDeltaXByGlobalIndex}
                  registerNode={(idx, node) => {
                    if (!node) slotNodeByGlobalIndexRef.current.delete(idx);
                    else slotNodeByGlobalIndexRef.current.set(idx, node);
                  }}
                  onDone={onDone}
                />
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
  zIndex: 150,
  isolation: "isolate",
  pointerEvents: "none",
};

function boxStyle(groupCount: number): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    zIndex: 2,
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
    zIndex: 3,
    width: `min(240px, calc((100% - ${(Math.max(groupCount, 1) - 1) * 8}px) / ${Math.min(Math.max(groupCount, 1), 5)}))`,
    minWidth: 0,
    transform: group === "drawn" ? "translateX(0)" : "translateX(0)",
  };
}

function dimStyle(durationMs: number): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    zIndex: 0,
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
    textTransform: "none",
    textShadow: "0 4px 18px rgba(0, 0, 0, 0.8)",
    whiteSpace: "nowrap",
    animation: `card-flow-label ${durationMs}ms ease both`,
  };
}

function cardWrapStyle(durationMs: number, enterFrom: CardFlowAnchor, exitTo: CardFlowAnchor, group: CardFlowGroup, fadeInOutInPlace: boolean): CSSProperties {
  const shouldTravel = !fadeInOutInPlace && enterFrom !== exitTo;
  const shouldFadeOut = group === "drawn" || group === "retrieved" || group === "played" || group === "discarded";
  return {
    position: "relative",
    zIndex: 4,
    width: "100%",
    aspectRatio: CARD_ASPECT_RATIO,
    borderRadius: radius.md,
    boxShadow: shadows.xl,
    transformOrigin: "center center",
    animation: `${shouldTravel ? (shouldFadeOut ? "card-flow-card" : "card-flow-card-solid") : "card-flow-fade"} ${durationMs}ms cubic-bezier(0.2, 0.8, 0.18, 1) both`,
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
    case "bottomCenter":
      return { x: "0px", y: "calc(50vh - 28px)" };
    case "bottomRight":
    case "rightDiscard":
      return { x: "calc(50vw - 28px)", y: "calc(50vh - 28px)" };
    case "rightHand":
      return { x: "0px", y: "calc(50vh - 18px)" };
    case "leftHand":
      return { x: "0px", y: "calc(50vh - 18px)" };
    default:
      return { x: "0px", y: "0px" };
  }
}

function addPxToX(baseX: string, deltaPx: number): string {
  if (!deltaPx) return baseX;
  if (baseX.startsWith("calc(") && baseX.endsWith(")")) {
    return `calc(${baseX.slice(5, -1)} + ${deltaPx}px)`;
  }
  return `calc(${baseX} + ${deltaPx}px)`;
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

@keyframes card-flow-card-solid {
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
    opacity: 1;
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

  @keyframes card-flow-card-solid {
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
      opacity: 1;
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

function titleForGroup(groupItems: CardFlowItem[], fallbackSingular: string, fallbackPlural: string): string {
  if (groupItems.length === 0) return fallbackSingular;
  const firstLabel = groupItems[0]?.label?.trim();
  if (firstLabel) {
    const allSame = groupItems.every((item) => (item.label?.trim() ?? "") === firstLabel);
    if (allSame) return groupItems.length > 1 ? `${firstLabel} x${groupItems.length}` : firstLabel;
  }
  return titleForCount(groupItems.length, fallbackSingular, fallbackPlural);
}

function FlowCard({
  item,
  index,
  groupCount,
  totalCount,
  durationMs,
  staggerMs,
  endDeltaXByGlobalIndex,
  registerNode,
  onDone,
}: {
  item: CardFlowItem;
  index: number;
  groupCount: number;
  totalCount: number;
  durationMs: number;
  staggerMs: number;
  endDeltaXByGlobalIndex: Record<number, number>;
  registerNode: (globalIndex: number, node: HTMLDivElement | null) => void;
  onDone: () => void;
}) {
  const faceDown = item.faceDownImage !== undefined;
  const card = faceDown ? null : getCard(item.cardId);
  const image = faceDown ? item.faceDownImage ?? "" : card!.kind === "umamusume" ? card!.portrait : card!.image;
  const [ready, setReady] = useState(() => !image || isImagePreloaded(image));
  const group = resolveGroup(item);
  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (index !== totalCount - 1) return;
    // Holo/card internals can animate too; only the travel wrapper decides when
    // the flow group is truly settled and the AI may continue.
    if (event.currentTarget !== event.target) return;
    onDone();
  };
  const baseEnd = anchorToTranslate(item.exitTo);
  const baseStart = anchorToTranslate(item.enterFrom);
  const wrapStyle = cardWrapStyle(durationMs, item.enterFrom, item.exitTo, group, Boolean(item.fadeOutInPlace));

  useEffect(() => {
    let active = true;
    if (!ready && image) {
      const timeoutId = window.setTimeout(() => {
        if (active) setReady(true);
      }, 900);
      void preloadImage(image).then(() => {
        if (active) setReady(true);
        window.clearTimeout(timeoutId);
      });
      return () => {
        active = false;
        window.clearTimeout(timeoutId);
      };
    }
    return () => {
      active = false;
    };
  }, [image, ready]);

  const xToCenterPx = (group === "drawn" || group === "retrieved") ? (endDeltaXByGlobalIndex[index] ?? 0) : 0;
  const exitX = item.fadeOutInPlace
    ? "0px"
    : (group === "drawn" || group === "retrieved")
      ? addPxToX(baseEnd.x, xToCenterPx)
      : baseEnd.x;
  const exitY = item.fadeOutInPlace ? "0px" : baseEnd.y;
  return (
    <div
      style={itemShellStyle(group, groupCount)}
      ref={(node) => registerNode(index, node)}
    >
      <div
        style={{
          ...wrapStyle,
          ["--card-flow-start-x" as string]: baseStart.x,
          ["--card-flow-start-y" as string]: baseStart.y,
          ["--card-flow-end-x" as string]: exitX,
          ["--card-flow-end-y" as string]: exitY,
          animationDelay: ready ? `${70 + index * staggerMs}ms` : undefined,
          animation: ready ? wrapStyle.animation : undefined,
          opacity: ready ? undefined : 0,
        }}
        onAnimationEnd={handleAnimationEnd}
      >
        {faceDown ? (
          <div style={faceDownCardStyle}>
            {image ? <img style={faceDownImageStyle} src={image} alt="Face-down card" draggable={false} /> : "Hidden"}
          </div>
        ) : (
          <HoloCardImage
            card={card!}
            src={image}
            alt={card!.name}
            imageStyle={cardImageStyle}
            radiusOverride={CARD_FLOW_IMAGE_RADIUS}
            disableHoverAnimation
          />
        )}
      </div>
    </div>
  );
}

const faceDownCardStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  position: "relative",
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
  borderRadius: CARD_FLOW_IMAGE_RADIUS,
  border: "1px solid rgba(255, 255, 255, 0.18)",
  background: "linear-gradient(180deg, #26312d 0%, #17211c 100%)",
  color: colors.white,
  fontWeight: 950,
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.18)",
};

const faceDownImageStyle: CSSProperties = {
  position: "absolute",
  inset: "-6%",
  width: "112%",
  height: "112%",
  objectFit: "cover",
  display: "block",
  borderRadius: CARD_FLOW_IMAGE_RADIUS,
};
