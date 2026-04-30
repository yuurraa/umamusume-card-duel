import { type CSSProperties, type DragEvent, type PointerEvent, useId, useRef, useState } from "react";
import { getCard, getPlayableAction } from "../../game/engine";
import type { Card, GameState, SideState } from "../../../../shared/src/types";
import type { InspectTarget } from "../../inspect";
import { HoloCardImage } from "../cards/HoloCardImage";
import { applyDragPreview, writeDragPayload } from "../drag/dragData";
import { CARD_ASPECT_RATIO, borders, colors, fontStacks, radius, shadows, transitions, uiTextColor, uiTextShadow } from "../../styles/shared";

type HandProps = {
  state: GameState;
  onInspect: (target: InspectTarget) => void;
  mode?: "play" | "setup";
  setupActiveIndex?: number | null;
  setupBenchIndexes?: number[];
  onSetupChooseActive?: (index: number) => void;
  onOpenDiscard?: () => void;
  selectableHandIndexes?: Set<number> | undefined;
  onChooseHandCard?: ((handIndex: number) => void) | undefined;
  sleeveImage?: string | null | undefined;
  side?: SideState | undefined;
  canPlayCards?: boolean | undefined;
};

export function Hand({
  state,
  onInspect,
  mode = "play",
  setupActiveIndex = null,
  setupBenchIndexes = [],
  onOpenDiscard,
  selectableHandIndexes,
  onChooseHandCard,
  sleeveImage = null,
  side,
  canPlayCards,
}: HandProps) {
  const player = side ?? state.sides.player;
  const handScrollerClassName = `hand-scroller-${useId().replace(/:/g, "")}`;
  const handScrollRef = useRef<HTMLDivElement | null>(null);
  const handPanRef = useRef<{ active: boolean; pointerId: number; startX: number; startScrollLeft: number } | null>(null);
  const [isHandPanning, setIsHandPanning] = useState(false);
  const isSetup = mode === "setup";
  const playerTurn = canPlayCards ?? (isSetup || (!state.gameOver && state.currentSide === "player"));
  const hiddenSetupIndexes = isSetup ? new Set([setupActiveIndex, ...setupBenchIndexes].filter((index): index is number => index !== null)) : null;
  const topDiscardCardId = player.discard[player.discard.length - 1] ?? null;
  const topDiscardCard = topDiscardCardId ? getCard(topDiscardCardId) : null;

  const stopHandPan = () => {
    handPanRef.current = null;
    setIsHandPanning(false);
  };

  const handleHandPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const container = handScrollRef.current;
    if (!container || container.scrollWidth <= container.clientWidth) return;
    if (event.target instanceof HTMLElement && event.target.closest("button")) return;
    handPanRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: container.scrollLeft,
    };
    setIsHandPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleHandPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pan = handPanRef.current;
    const container = handScrollRef.current;
    if (!pan || !container || !pan.active || pan.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - pan.startX;
    container.scrollLeft = pan.startScrollLeft - deltaX;
  };

  const handleHandPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const pan = handPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    stopHandPan();
  };

  return (
    <div style={handShellStyle}>
      <style>{`.${handScrollerClassName}{scrollbar-width:none;-ms-overflow-style:none;}.${handScrollerClassName}::-webkit-scrollbar{display:none;width:0;height:0;}`}</style>
      <PileSlot
        label="Deck"
        count={player.deck.length}
        title={`${player.deck.length} cards left`}
        sleeveImage={sleeveImage}
      />
      <div
        ref={handScrollRef}
        className={handScrollerClassName}
        style={{ ...handStyle, cursor: isHandPanning ? "grabbing" : "grab" }}
        onPointerDown={handleHandPointerDown}
        onPointerMove={handleHandPointerMove}
        onPointerUp={handleHandPointerUp}
        onPointerCancel={stopHandPan}
        onPointerLeave={stopHandPan}
      >
        <div style={handEdgeSpacerStyle} aria-hidden="true" />
        {player.hand.map((cardId, index) => {
          if (hiddenSetupIndexes?.has(index)) return null;
          const card = getCard(cardId);
          const action = getPlayableAction(state, player, cardId);
          const isSetupBasic = isSetup && card.kind === "umamusume" && card.stage === 0;
          const isSelectable = selectableHandIndexes?.has(index) ?? false;
          const isChoosingHandCard = Boolean(selectableHandIndexes);
          const canDrag = isChoosingHandCard ? false : isSetup ? isSetupBasic : playerTurn && action.canPlay;
          const image = card.kind === "umamusume" ? card.portrait : card.image;
          const shadow = card.kind === "umamusume"
            ? "drop-shadow(0 18px 22px rgba(214, 81, 157, 0.22))"
            : card.trainerType === "supporter"
              ? "drop-shadow(0 18px 22px rgba(245, 158, 11, 0.22))"
              : "drop-shadow(0 18px 22px rgba(63, 159, 92, 0.22))";
          return (
            <HandCard
              key={`${cardId}-${index}`}
              card={card}
              handIndex={index}
              image={image}
              canDrag={canDrag}
              shadow={shadow}
              isSetup={isSetup}
              isSelectable={isSelectable}
              isDimmed={isChoosingHandCard && !isSelectable}
              onPrimaryAction={() => {
                if (isSelectable) {
                  onChooseHandCard?.(index);
                  return;
                }
                onInspect({ card });
              }}
            />
          );
        })}
        <div style={handEdgeSpacerStyle} aria-hidden="true" />
      </div>
      <PileSlot
        label="Discard"
        count={player.discard.length}
        title={`${player.discard.length} ${player.discard.length === 1 ? "card" : "cards"} discarded`}
        cardImage={topDiscardCard ? (topDiscardCard.kind === "umamusume" ? topDiscardCard.portrait : topDiscardCard.image) : undefined}
        card={topDiscardCard ?? undefined}
        onClick={onOpenDiscard}
      />
    </div>
  );
}

function HandCard({
  card,
  handIndex,
  image,
  canDrag,
  shadow,
  isSetup,
  onPrimaryAction,
  isSelectable,
  isDimmed,
}: {
  card: Card;
  handIndex: number;
  image: string;
  canDrag: boolean;
  shadow: string;
  isSetup: boolean;
  isSelectable: boolean;
  isDimmed: boolean;
  onPrimaryAction: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const activeHover = hovered && (canDrag || isSelectable);
  const disableHoverAnimation = !canDrag && !isSelectable;

  const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
    if (!canDrag) return;
    event.dataTransfer.effectAllowed = "move";
    writeDragPayload(event.dataTransfer, isSetup ? { kind: "setup-hand", handIndex } : { kind: "hand-card", handIndex });
    applyDragPreview(event, { width: 184, height: 258 });
  };

  return (
    <div
      style={{
        position: "relative",
        width: 184,
        height: 258,
        flex: "0 0 auto",
        opacity: 1,
        filter: isDimmed
          ? "grayscale(0.92) brightness(0.86)"
          : canDrag || isSelectable
            ? "none"
            : "grayscale(0.86) brightness(0.84)",
      }}
    >
      <button
        type="button"
        style={{
          ...handCardButtonStyle,
          boxShadow: "none",
          filter: activeHover ? `${shadow} saturate(1.06)` : shadow,
          cursor: canDrag ? "grab" : "pointer",
          transform: activeHover ? "translateY(-6px) rotate(0.8deg) scale(1.03)" : "translateY(0) rotate(0deg) scale(1)",
          transformOrigin: "center bottom",
          transition: "transform 170ms ease, filter 170ms ease, box-shadow 170ms ease",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={onPrimaryAction}
        draggable={canDrag}
        onDragStart={handleDragStart}
      >
        <HoloCardImage
          card={card}
          src={image}
          alt=""
          imageStyle={handImageStyle}
          draggable={false}
          disableHoverAnimation={disableHoverAnimation}
        />
      </button>
    </div>
  );
}

function PileSlot({
  label,
  count,
  title,
  cardImage,
  card,
  sleeveImage,
  onClick,
}: {
  label: string;
  count: number;
  title: string;
  cardImage?: string | undefined;
  card?: Card | undefined;
  sleeveImage?: string | null | undefined;
  onClick?: (() => void) | undefined;
}) {
  const [hovered, setHovered] = useState(false);
  const interactive = Boolean(onClick);
  const isEmptyDiscard = label === "Discard" && count === 0;
  const content = (
    <>
      {cardImage && count > 0 && card ? (
        <HoloCardImage card={card} src={cardImage} alt="" imageStyle={pileCardImageStyle} draggable={false} />
      ) : cardImage && count > 0 ? (
        <img style={pileCardImageStyle} src={cardImage} alt="" draggable={false} />
      ) : sleeveImage ? (
        <span style={pileImageClipStyle}>
          <img style={pileSleeveImageStyle} src={sleeveImage} alt="" draggable={false} />
        </span>
      ) : label === "Discard" ? (
        <span style={pileEmptySlotStyle}>Empty</span>
      ) : (
        <span style={pileCardBackStyle}>
          <span style={pileCardBackMarkStyle}>D</span>
        </span>
      )}
      <span style={pileCountBadgeStyle}>{count}</span>
    </>
  );

  return (
    <div style={pileSlotWrapStyle}>
      {interactive ? (
        <button
          type="button"
          title={title}
          aria-label={title}
          style={pileSlotButtonStyle(interactive, hovered, isEmptyDiscard)}
          onClick={onClick}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
        >
          {content}
        </button>
      ) : (
        <div
          title={title}
          aria-label={title}
          style={pileSlotButtonStyle(interactive, hovered, isEmptyDiscard)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {content}
        </div>
      )}
      <strong style={pileLabelStyle}>{label}</strong>
      {hovered && <span style={pileTooltipStyle}>{getPileTooltip(label, count)}</span>}
    </div>
  );
}

function getPileTooltip(label: string, count: number): string {
  if (label === "Discard") return `${count} ${count === 1 ? "card" : "cards"} discarded`;
  return `${count} ${count === 1 ? "card" : "cards"} left`;
}

const PILE_SLOT_WIDTH = 200;
const PILE_CARD_WIDTH = 143;
const PILE_CARD_HEIGHT = 200;

const handShellStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: `${PILE_SLOT_WIDTH}px minmax(0, 1fr) ${PILE_SLOT_WIDTH}px`,
  gap: 12,
  alignItems: "center",
};

const handStyle: CSSProperties = {
  height: 326,
  display: "flex",
  alignItems: "center",
  gap: 12,
  justifyContent: "flex-start",
  overflowX: "auto",
  boxSizing: "border-box",
  padding: "16px 12px",
  touchAction: "pan-x",
};

const handEdgeSpacerStyle: CSSProperties = {
  flex: "1 0 0",
  minWidth: 12,
  pointerEvents: "none",
};

const pileSlotWrapStyle: CSSProperties = {
  position: "relative",
  display: "grid",
  justifyItems: "center",
  gap: 8,
};

function pileSlotButtonStyle(interactive: boolean, hovered: boolean, isEmptyDiscard: boolean): CSSProperties {
  return {
    position: "relative",
    height: PILE_CARD_HEIGHT,
    width: PILE_CARD_WIDTH,
    aspectRatio: CARD_ASPECT_RATIO,
    boxSizing: "border-box",
    appearance: "none",
    borderRadius: radius.md,
    border: hovered ? "1px solid rgba(0, 0, 0, 0.36)" : borders.neutral,
    background: isEmptyDiscard ? colors.glassSoft : "rgba(238, 243, 238, 0.82)",
    padding: 0,
    cursor: interactive ? "pointer" : "help",
    boxShadow: hovered ? "0 16px 34px rgba(17, 24, 39, 0.16)" : "0 10px 24px rgba(17, 24, 39, 0.1)",
    transform: hovered ? "translateY(-2px)" : undefined,
    transition: `border-color ${transitions.base}, box-shadow ${transitions.base}, transform ${transitions.base}`,
    opacity: interactive || hovered ? 1 : 0.94,
    textShadow: "0 0 0",
  };
}

const pileCardImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: radius.md,
  objectFit: "contain",
  display: "block",
};

const pileImageClipStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "block",
  overflow: "hidden",
  position: "relative",
  borderRadius: radius.md,
};

const pileSleeveImageStyle: CSSProperties = {
  position: "absolute",
  inset: "-6%",
  width: "112%",
  height: "112%",
  objectFit: "cover",
  display: "block",
};

const pileEmptySlotStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
  borderRadius: radius.md,
  border: borders.neutralDashed,
  background: colors.glassSoft,
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 12,
  fontWeight: 950,
  textTransform: "uppercase",
};

const pileCardBackStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
  borderRadius: radius.md,
  border: borders.glass,
  background: "linear-gradient(145deg, #17211c 0%, #284135 48%, #d6519d 100%)",
  boxShadow: "inset 0 0 0 4px rgba(255,255,255,0.18)",
};

const pileCardBackMarkStyle: CSSProperties = {
  width: 38,
  height: 38,
  display: "grid",
  placeItems: "center",
  borderRadius: radius.circle,
  background: colors.glassStrong,
  color: colors.black,
  fontSize: 18,
  fontWeight: 950,
  fontFamily: fontStacks.ui,
  lineHeight: 1,
};

const pileCountBadgeStyle: CSSProperties = {
  position: "absolute",
  right: -7,
  top: -7,
  minWidth: 24,
  height: 24,
  display: "grid",
  placeItems: "center",
  padding: "0 6px",
  borderRadius: radius.pill,
  border: "1px solid rgba(0, 0, 0, 0.18)",
  background: colors.black,
  color: colors.white,
  fontSize: 12,
  fontWeight: 950,
  boxShadow: shadows.badge,
};

const pileLabelStyle: CSSProperties = {
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 12,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: 0,
};

const pileTooltipStyle: CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 8px)",
  left: "50%",
  transform: "translateX(-50%)",
  width: "max-content",
  maxWidth: 160,
  borderRadius: radius.md,
  border: borders.neutralStrong,
  background: colors.glassOverlay,
  color: uiTextColor,
  textShadow: uiTextShadow,
  padding: "6px 8px",
  fontSize: 12,
  fontWeight: 900,
  boxShadow: shadows.lg,
  zIndex: 10,
};

const handCardButtonStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  padding: 0,
  border: 0,
  borderRadius: radius.md,
  background: "transparent",
  textAlign: "left",
};

const handImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: radius.md,
  objectFit: "contain",
  display: "block",
};
