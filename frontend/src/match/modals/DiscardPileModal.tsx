import { useId, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { Card } from "../../../../shared/src/types";
import { getCard } from "../../game/engine";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { HoloCardImage } from "../../components/cards/HoloCardImage";
import { borders, colors, overlayBackdropStyle, overlayButtonStyle, overlaySurfaceStyle, previewKickerStyle, radius, transitions } from "../../styles/shared";

export function DiscardPileModal({
  cardIds,
  onInspect,
  onClose,
}: {
  cardIds: string[];
  onInspect: (card: Card) => void;
  onClose: () => void;
}) {
  const cards = cardIds.map(getCard).reverse();
  const discardScrollerClassName = `discard-scroller-${useId().replace(/:/g, "")}`;
  const discardScrollRef = useRef<HTMLDivElement | null>(null);
  const discardPanRef = useRef<{ active: boolean; pointerId: number; startX: number; startScrollLeft: number } | null>(null);
  const [isDiscardPanning, setIsDiscardPanning] = useState(false);

  const stopDiscardPan = () => {
    discardPanRef.current = null;
    setIsDiscardPanning(false);
  };

  const handleDiscardPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const container = discardScrollRef.current;
    if (!container || container.scrollWidth <= container.clientWidth) return;
    if (event.target instanceof HTMLElement && event.target.closest("button")) return;
    discardPanRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: container.scrollLeft,
    };
    setIsDiscardPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleDiscardPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pan = discardPanRef.current;
    const container = discardScrollRef.current;
    if (!pan || !container || !pan.active || pan.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - pan.startX;
    container.scrollLeft = pan.startScrollLeft - deltaX;
  };

  const handleDiscardPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const pan = discardPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    stopDiscardPan();
  };

  return (
    <div style={discardBackdropStyle} onClick={onClose}>
      <section style={discardModalStyle} onClick={(event) => event.stopPropagation()}>
        <style>{`.${discardScrollerClassName}{scrollbar-width:none;-ms-overflow-style:none;}.${discardScrollerClassName}::-webkit-scrollbar{display:none;width:0;height:0;}`}</style>
        <header style={discardHeaderStyle}>
          <div>
            <div style={discardKickerStyle}>Discard Pile</div>
            <h2 style={discardTitleStyle}>{cardIds.length} {cardIds.length === 1 ? "card" : "cards"}</h2>
          </div>
          <NeutralButton style={closeButtonStyle} onClick={onClose}>Close</NeutralButton>
        </header>
        {cards.length === 0 ? (
          <div style={emptyDiscardStyle}>No cards have been discarded yet.</div>
        ) : (
          <div
            ref={discardScrollRef}
            className={discardScrollerClassName}
            style={{ ...discardGridStyle, cursor: isDiscardPanning ? "grabbing" : "grab" }}
            onPointerDown={handleDiscardPointerDown}
            onPointerMove={handleDiscardPointerMove}
            onPointerUp={handleDiscardPointerUp}
            onPointerCancel={stopDiscardPan}
            onPointerLeave={stopDiscardPan}
          >
            {cards.map((card, index) => {
              const image = card.kind === "umamusume" ? card.portrait : card.image;
              return (
                <DiscardCardButton
                  key={`${card.id}-${index}`}
                  card={card}
                  image={image}
                  name={card.name}
                  onClick={() => onInspect(card)}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function DiscardCardButton({ card, image, name, onClick }: { card: Card; image: string; name: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Inspect ${name}`}
      style={discardCardButtonStyle(hovered)}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <HoloCardImage card={card} src={image} alt="" imageStyle={discardCardImageStyle} draggable={false} />
    </button>
  );
}

const discardBackdropStyle: CSSProperties = {
  ...overlayBackdropStyle,
  zIndex: 48,
};

const discardModalStyle: CSSProperties = {
  ...overlaySurfaceStyle,
  width: "min(940px, calc(100vw - 64px))",
  maxHeight: "min(320px, calc(100vh - 64px))",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  gap: 12,
  padding: 16,
  background: colors.glassOverlay,
  color: colors.black,
  textShadow: "none",
};

const discardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
};

const discardTitleStyle: CSSProperties = {
  margin: "2px 0 0",
  color: colors.black,
  textShadow: "none",
  fontSize: 24,
  lineHeight: 1.05,
  fontWeight: 950,
};

const discardKickerStyle: CSSProperties = {
  ...previewKickerStyle,
  color: colors.black,
  textShadow: "none",
};

const closeButtonStyle: CSSProperties = {
  ...overlayButtonStyle,
  minWidth: 76,
};

const discardGridStyle: CSSProperties = {
  minHeight: 0,
  height: 220,
  overflowX: "auto",
  overflowY: "hidden",
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "14px 6px 12px",
};

function discardCardButtonStyle(hovered: boolean): CSSProperties {
  return {
    flex: "0 0 auto",
    width: 140,
    height: 196,
    border: 0,
    borderRadius: radius.md,
    background: "transparent",
    padding: 0,
    cursor: "pointer",
    filter: hovered ? "drop-shadow(0 18px 22px rgba(17, 24, 39, 0.18)) saturate(1.06)" : "drop-shadow(0 12px 18px rgba(17, 24, 39, 0.12))",
    transform: hovered ? "translateY(-8px) rotate(0.6deg) scale(1.03)" : "translateY(0) rotate(0deg) scale(1)",
    transition: `transform ${transitions.card}, filter ${transitions.card}`,
  };
}

const discardCardImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: radius.md,
  objectFit: "contain",
  display: "block",
};

const emptyDiscardStyle: CSSProperties = {
  borderRadius: radius.md,
  border: borders.neutralDashed,
  background: "rgba(238, 243, 238, 0.86)",
  color: colors.black,
  textShadow: "none",
  padding: 18,
  fontSize: 14,
  fontWeight: 850,
  textAlign: "center",
};
