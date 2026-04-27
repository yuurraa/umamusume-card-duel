import { useId, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { getCard } from "../../game/engine";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { borders, colors, overlayBackdropStyle, overlayButtonStyle, overlaySurfaceStyle, previewKickerStyle, radius, transitions } from "../../styles/shared";

type DeckChoiceOption = {
  deckIndex: number;
  cardId: string;
};

export function DeckChoiceModal({
  cardIds,
  filter = "umamusume",
  evolvesFrom,
  stage,
  onChoose,
  onClose,
}: {
  cardIds: string[];
  filter?: "umamusume" | "evolutionUmamusume";
  evolvesFrom?: string | undefined;
  stage?: number | undefined;
  onChoose: (deckIndex: number) => void;
  onClose: () => void;
}) {
  const options = cardIds.flatMap((cardId, deckIndex) => {
    const card = getCard(cardId);
    if (card.kind !== "umamusume") return [];
    if (filter === "evolutionUmamusume" && card.stage <= 0) return [];
    if (evolvesFrom !== undefined && card.evolvesFrom !== evolvesFrom) return [];
    if (stage !== undefined && card.stage !== stage) return [];
    return [{ deckIndex, cardId }];
  });
  const deckScrollerClassName = `deck-scroller-${useId().replace(/:/g, "")}`;
  const deckScrollRef = useRef<HTMLDivElement | null>(null);
  const deckPanRef = useRef<{ active: boolean; pointerId: number; startX: number; startScrollLeft: number } | null>(null);
  const [isDeckPanning, setIsDeckPanning] = useState(false);

  const stopDeckPan = () => {
    deckPanRef.current = null;
    setIsDeckPanning(false);
  };

  const handleDeckPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const container = deckScrollRef.current;
    if (!container || container.scrollWidth <= container.clientWidth) return;
    if (event.target instanceof HTMLElement && event.target.closest("button")) return;
    deckPanRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: container.scrollLeft,
    };
    setIsDeckPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleDeckPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pan = deckPanRef.current;
    const container = deckScrollRef.current;
    if (!pan || !container || !pan.active || pan.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - pan.startX;
    container.scrollLeft = pan.startScrollLeft - deltaX;
  };

  const handleDeckPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const pan = deckPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    stopDeckPan();
  };

  return (
    <div style={deckBackdropStyle} onClick={onClose}>
      <section style={deckModalStyle} onClick={(event) => event.stopPropagation()}>
        <style>{`.${deckScrollerClassName}{scrollbar-width:none;-ms-overflow-style:none;}.${deckScrollerClassName}::-webkit-scrollbar{display:none;width:0;height:0;}`}</style>
        <header style={deckHeaderStyle}>
          <div>
            <div style={deckKickerStyle}>Deck</div>
            <h2 style={deckTitleStyle}>{options.length} {options.length === 1 ? "card" : "cards"}</h2>
          </div>
          <NeutralButton style={closeButtonStyle} onClick={onClose}>Back</NeutralButton>
        </header>
        {options.length === 0 ? (
          <div style={emptyDeckStyle}>No Umamusume can be selected from your deck.</div>
        ) : (
          <div
            ref={deckScrollRef}
            className={deckScrollerClassName}
            style={{ ...deckGridStyle, cursor: isDeckPanning ? "grabbing" : "grab" }}
            onPointerDown={handleDeckPointerDown}
            onPointerMove={handleDeckPointerMove}
            onPointerUp={handleDeckPointerUp}
            onPointerCancel={stopDeckPan}
            onPointerLeave={stopDeckPan}
          >
            {options.map((option) => (
              <DeckChoiceCardButton
                key={`${option.cardId}-${option.deckIndex}`}
                option={option}
                onChoose={onChoose}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DeckChoiceCardButton({ option, onChoose }: { option: DeckChoiceOption; onChoose: (deckIndex: number) => void }) {
  const card = getCard(option.cardId);
  const image = card.kind === "umamusume" ? card.portrait : card.image;
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Choose ${card.name}`}
      style={deckCardButtonStyle(hovered)}
      onClick={() => onChoose(option.deckIndex)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <img style={deckCardImageStyle} src={image} alt="" draggable={false} />
    </button>
  );
}

const deckBackdropStyle: CSSProperties = {
  ...overlayBackdropStyle,
  zIndex: 48,
};

const deckModalStyle: CSSProperties = {
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

const deckHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
};

const deckTitleStyle: CSSProperties = {
  margin: "2px 0 0",
  color: colors.black,
  textShadow: "none",
  fontSize: 24,
  lineHeight: 1.05,
  fontWeight: 950,
};

const deckKickerStyle: CSSProperties = {
  ...previewKickerStyle,
  color: colors.black,
  textShadow: "none",
};

const closeButtonStyle: CSSProperties = {
  ...overlayButtonStyle,
  minWidth: 76,
};

const deckGridStyle: CSSProperties = {
  minHeight: 0,
  height: 220,
  overflowX: "auto",
  overflowY: "hidden",
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "14px 6px 12px",
};

function deckCardButtonStyle(hovered: boolean): CSSProperties {
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

const deckCardImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: radius.md,
  objectFit: "contain",
  display: "block",
};

const emptyDeckStyle: CSSProperties = {
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
