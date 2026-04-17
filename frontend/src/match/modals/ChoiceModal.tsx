import { useState, type CSSProperties } from "react";
import { getCard, isUmamusumeInDeck } from "../../game/engine";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { buttonStyle, overlayBackdropStyle, overlaySurfaceStyle, overlayButtonStyle, previewKickerStyle } from "../../styles/shared";
import type { PendingSelection } from "../../types/ui";

export function ChoiceModal({
  pending,
  hand,
  deck,
  onCancel,
  onChooseHand,
  onChooseDeck,
  onResolveEmptyDeckSearch,
}: {
  pending: PendingSelection | null;
  hand: string[];
  deck: string[];
  onCancel: () => void;
  onChooseHand: (handIndex: number) => void;
  onChooseDeck: (deckIndex: number) => void;
  onResolveEmptyDeckSearch: () => void;
}) {
  if (!pending || (pending.kind !== "discardForScout" && pending.kind !== "discardForAbility" && pending.kind !== "deckSearch")) return null;
  const isDiscard = pending.kind === "discardForScout" || pending.kind === "discardForAbility";
  const options = isDiscard
    ? hand.map((cardId, index) => ({ cardId, index })).filter(({ index }) => pending.kind !== "discardForScout" || index !== pending.handIndex)
    : deck.map((cardId, index) => ({ cardId, index })).filter(({ cardId }) => isUmamusumeInDeck(cardId));
  const kicker = pending.kind === "discardForAbility" ? "Ability Cost" : isDiscard ? "Discard Cost" : "Deck Search";
  const title = isDiscard ? "Choose 1 card to discard" : "Choose 1 Umamusume";
  const emptyCopy = "There are no eligible Umamusume in your deck.";

  return (
    <div style={choiceBackdropStyle} onClick={onCancel}>
      <section style={choiceShellStyle} onClick={(event) => event.stopPropagation()}>
        <header style={choiceHeaderStyle}>
          <div>
            <div style={previewKickerStyle}>{kicker}</div>
            <h2 style={choiceTitleStyle}>{title}</h2>
          </div>
          <NeutralButton style={smallButtonStyle} onClick={onCancel}>Cancel</NeutralButton>
        </header>
        {options.length === 0 && !isDiscard ? (
          <div style={emptyChoiceStyle}>
            <strong>{emptyCopy}</strong>
            <span style={emptyChoiceSubtextStyle}>You can still finish resolving this trainer, but it will not add an Umamusume to your hand.</span>
            <NeutralButton style={buttonStyle(true)} onClick={onResolveEmptyDeckSearch}>Resolve Without Drawing</NeutralButton>
          </div>
        ) : (
          <div style={choiceGridStyle}>
            {options.map(({ cardId, index }) => {
              const card = getCard(cardId);
              const image = card.kind === "umamusume" ? card.portrait : card.image;
              return (
                <ChoiceCardButton
                  key={`${cardId}-${index}`}
                  image={image}
                  name={card.name}
                  onClick={() => (isDiscard ? onChooseHand(index) : onChooseDeck(index))}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function ChoiceCardButton({ image, name, onClick }: { image: string; name: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Choose ${name}`}
      style={choiceCardStyle(hovered)}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <img style={choiceImageStyle} src={image} alt="" draggable={false} />
    </button>
  );
}

const choiceBackdropStyle: CSSProperties = { ...overlayBackdropStyle, zIndex: 60 };

const choiceShellStyle: CSSProperties = {
  ...overlaySurfaceStyle,
  width: "min(940px, calc(100vw - 64px))",
  maxHeight: "min(320px, calc(100vh - 64px))",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  gap: 12,
  padding: 16,
  background: "rgba(238, 243, 238, 0.94)",
};

const choiceHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
};

const choiceTitleStyle: CSSProperties = {
  margin: "2px 0 0",
  fontSize: 24,
  lineHeight: 1.05,
  fontWeight: 950,
};

const smallButtonStyle: CSSProperties = { ...overlayButtonStyle };

const choiceGridStyle: CSSProperties = {
  minHeight: 0,
  height: 220,
  overflowX: "auto",
  overflowY: "hidden",
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "14px 6px 12px",
};

const emptyChoiceStyle: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gap: 12,
  justifyItems: "start",
  borderRadius: 8,
  border: "1px solid rgba(0, 0, 0, 0.18)",
  background: "rgba(238, 243, 238, 0.85)",
  padding: 16,
};

const emptyChoiceSubtextStyle: CSSProperties = {
  color: "#000000",
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1.35,
};

function choiceCardStyle(hovered: boolean): CSSProperties {
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

const choiceImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: 8,
  objectFit: "contain",
  display: "block",
};
