import { useState, type CSSProperties } from "react";
import type { Card } from "../../../../shared/src/types";
import { getCard } from "../../game/engine";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { overlayBackdropStyle, overlayButtonStyle, overlaySurfaceStyle, previewKickerStyle } from "../../styles/shared";

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

  return (
    <div style={discardBackdropStyle} onClick={onClose}>
      <section style={discardModalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={discardHeaderStyle}>
          <div>
            <div style={previewKickerStyle}>Discard Pile</div>
            <h2 style={discardTitleStyle}>{cardIds.length} {cardIds.length === 1 ? "card" : "cards"}</h2>
          </div>
          <NeutralButton style={closeButtonStyle} onClick={onClose}>Close</NeutralButton>
        </header>
        {cards.length === 0 ? (
          <div style={emptyDiscardStyle}>No cards have been discarded yet.</div>
        ) : (
          <div style={discardGridStyle}>
            {cards.map((card, index) => {
              const image = card.kind === "umamusume" ? card.portrait : card.image;
              return (
                <DiscardCardButton
                  key={`${card.id}-${index}`}
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

function DiscardCardButton({ image, name, onClick }: { image: string; name: string; onClick: () => void }) {
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
      <img style={discardCardImageStyle} src={image} alt="" draggable={false} />
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
  background: "rgba(238, 243, 238, 0.94)",
};

const discardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
};

const discardTitleStyle: CSSProperties = {
  margin: "2px 0 0",
  color: "#000000",
  fontSize: 24,
  lineHeight: 1.05,
  fontWeight: 950,
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
    borderRadius: 8,
    background: "transparent",
    padding: 0,
    cursor: "pointer",
    filter: hovered ? "drop-shadow(0 18px 22px rgba(17, 24, 39, 0.18)) saturate(1.06)" : "drop-shadow(0 12px 18px rgba(17, 24, 39, 0.12))",
    transform: hovered ? "translateY(-8px) rotate(0.6deg) scale(1.03)" : "translateY(0) rotate(0deg) scale(1)",
    transition: "transform 170ms ease, filter 170ms ease",
  };
}

const discardCardImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: 8,
  objectFit: "contain",
  display: "block",
};

const emptyDiscardStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px dashed rgba(0, 0, 0, 0.45)",
  background: "rgba(238, 243, 238, 0.86)",
  color: "#000000",
  padding: 18,
  fontSize: 14,
  fontWeight: 850,
  textAlign: "center",
};
