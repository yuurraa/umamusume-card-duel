import { type CSSProperties, type DragEvent, useState } from "react";
import { getCard, getPlayableAction } from "../../game/engine";
import type { Card, GameState } from "../../../../shared/src/types";
import type { InspectTarget } from "../../inspect";
import { writeDragPayload } from "../drag/dragData";

type HandProps = {
  state: GameState;
  onInspect: (target: InspectTarget) => void;
  mode?: "play" | "setup";
  setupActiveIndex?: number | null;
  setupBenchIndexes?: number[];
  onSetupChooseActive?: (index: number) => void;
  onOpenDiscard?: () => void;
  sleeveImage?: string | null | undefined;
};

export function Hand({
  state,
  onInspect,
  mode = "play",
  setupActiveIndex = null,
  setupBenchIndexes = [],
  onOpenDiscard,
  sleeveImage = null,
}: HandProps) {
  const player = state.sides.player;
  const isSetup = mode === "setup";
  const playerTurn = isSetup || (!state.gameOver && state.currentSide === "player");
  const hiddenSetupIndexes = isSetup ? new Set([setupActiveIndex, ...setupBenchIndexes].filter((index): index is number => index !== null)) : null;
  const topDiscardCardId = player.discard[player.discard.length - 1] ?? null;
  const topDiscardCard = topDiscardCardId ? getCard(topDiscardCardId) : null;

  return (
    <div style={handShellStyle}>
      <PileSlot
        label="Deck"
        count={player.deck.length}
        title={`${player.deck.length} cards left`}
        sleeveImage={sleeveImage}
      />
      <div style={handStyle}>
        {player.hand.map((cardId, index) => {
          if (hiddenSetupIndexes?.has(index)) return null;
          const card = getCard(cardId);
          const action = getPlayableAction(state, player, cardId);
          const isSetupBasic = isSetup && card.kind === "umamusume" && card.stage === 0;
          const canDrag = isSetup ? isSetupBasic : playerTurn && action.canPlay;
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
              onPrimaryAction={() => onInspect({ card })}
            />
          );
        })}
      </div>
      <PileSlot
        label="Discard"
        count={player.discard.length}
        title={`${player.discard.length} ${player.discard.length === 1 ? "card" : "cards"} discarded`}
        cardImage={topDiscardCard ? (topDiscardCard.kind === "umamusume" ? topDiscardCard.portrait : topDiscardCard.image) : undefined}
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
}: {
  card: Card;
  handIndex: number;
  image: string;
  canDrag: boolean;
  shadow: string;
  isSetup: boolean;
  onPrimaryAction: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const activeHover = hovered;

  const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
    if (!canDrag) return;
    event.dataTransfer.effectAllowed = "move";
    writeDragPayload(event.dataTransfer, isSetup ? { kind: "setup-hand", handIndex } : { kind: "hand-card", handIndex });
  };

  return (
    <div style={{ position: "relative", width: 184, height: 258, flex: "0 0 auto", opacity: canDrag ? 1 : 0.62 }}>
      <button
        type="button"
        style={{
          ...handCardButtonStyle,
          filter: activeHover ? `${shadow} saturate(1.06)` : shadow,
          cursor: canDrag ? "grab" : "pointer",
          transform: activeHover ? "translateY(-10px) rotate(0.8deg) scale(1.035)" : "translateY(0) rotate(0deg) scale(1)",
          transition: "transform 170ms ease, filter 170ms ease",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={onPrimaryAction}
        draggable={canDrag}
        onDragStart={handleDragStart}
      >
        <img style={handImageStyle} src={image} alt="" draggable={false} />
      </button>
    </div>
  );
}

function PileSlot({
  label,
  count,
  title,
  cardImage,
  sleeveImage,
  onClick,
}: {
  label: string;
  count: number;
  title: string;
  cardImage?: string | undefined;
  sleeveImage?: string | null | undefined;
  onClick?: (() => void) | undefined;
}) {
  const [hovered, setHovered] = useState(false);
  const interactive = Boolean(onClick);
  const content = (
    <>
      {cardImage && count > 0 ? (
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
          style={pileSlotButtonStyle(interactive, hovered)}
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
          style={pileSlotButtonStyle(interactive, hovered)}
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

const PILE_SLOT_WIDTH = 112;
const PILE_CARD_WIDTH = 92;
const PILE_CARD_HEIGHT = 129;

const handShellStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: `${PILE_SLOT_WIDTH}px minmax(0, 1fr) ${PILE_SLOT_WIDTH}px`,
  gap: 12,
  alignItems: "center",
};

const handStyle: CSSProperties = {
  height: 286,
  display: "flex",
  gap: 12,
  justifyContent: "center",
  overflowX: "auto",
  padding: "10px 2px 0px",
};

const pileSlotWrapStyle: CSSProperties = {
  position: "relative",
  display: "grid",
  justifyItems: "center",
  gap: 8,
};

function pileSlotButtonStyle(interactive: boolean, hovered: boolean): CSSProperties {
  return {
    position: "relative",
    width: PILE_CARD_WIDTH,
    height: PILE_CARD_HEIGHT,
    boxSizing: "border-box",
    appearance: "none",
    borderRadius: 8,
    border: hovered ? "1px solid rgba(0, 0, 0, 0.36)" : "1px solid rgba(185, 198, 188, 0.88)",
    background: "rgba(238, 243, 238, 0.82)",
    padding: 0,
    cursor: interactive ? "pointer" : "help",
    boxShadow: hovered ? "0 16px 34px rgba(17, 24, 39, 0.16)" : "0 10px 24px rgba(17, 24, 39, 0.1)",
    transform: hovered ? "translateY(-2px)" : undefined,
    transition: "border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease",
    opacity: interactive || hovered ? 1 : 0.94,
    textShadow: "0 0 0",
  };
}

const pileCardImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: 8,
  objectFit: "contain",
  display: "block",
};

const pileImageClipStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "block",
  overflow: "hidden",
  position: "relative",
  borderRadius: 8,
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
  borderRadius: 8,
  border: "1px dashed rgba(0, 0, 0, 0.45)",
  background: "rgba(238, 243, 238, 0.3)",
  color: "#000000",
  fontSize: 12,
  fontWeight: 950,
  textTransform: "uppercase",
};

const pileCardBackStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  border: "1px solid rgba(217, 225, 218, 0.72)",
  background: "linear-gradient(145deg, #17211c 0%, #284135 48%, #d6519d 100%)",
  boxShadow: "inset 0 0 0 4px rgba(255,255,255,0.18)",
};

const pileCardBackMarkStyle: CSSProperties = {
  width: 38,
  height: 38,
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  background: "rgba(238, 243, 238, 0.9)",
  color: "#000000",
  fontSize: 18,
  fontWeight: 950,
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
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
  borderRadius: 999,
  border: "1px solid rgba(0, 0, 0, 0.18)",
  background: "#000000",
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 950,
  boxShadow: "0 8px 18px rgba(17, 24, 39, 0.2)",
};

const pileLabelStyle: CSSProperties = {
  color: "#000000",
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
  borderRadius: 8,
  border: "1px solid rgba(185, 198, 188, 0.9)",
  background: "rgba(238, 243, 238, 0.94)",
  color: "#000000",
  padding: "6px 8px",
  fontSize: 12,
  fontWeight: 900,
  boxShadow: "0 12px 28px rgba(17, 24, 39, 0.14)",
  zIndex: 10,
};

const handCardButtonStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  padding: 0,
  border: 0,
  borderRadius: 8,
  background: "transparent",
  textAlign: "left",
};

const handImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: 8,
  objectFit: "contain",
  display: "block",
};
