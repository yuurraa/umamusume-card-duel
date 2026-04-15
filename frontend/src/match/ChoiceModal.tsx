import type { CSSProperties } from "react";
import { getCard, isPokemonInDeck } from "../game/engine";
import { formatCardDisplayName } from "../utils/format";
import { NeutralButton } from "../components/NeutralButton";
import { buttonStyle, overlayBackdropStyle, overlaySurfaceStyle, overlayButtonStyle, previewKickerStyle } from "../styles/shared";
import type { PendingSelection } from "../types/ui";

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
  if (!pending || (pending.kind !== "discardForScout" && pending.kind !== "deckSearch")) return null;
  const isDiscard = pending.kind === "discardForScout";
  const options = isDiscard
    ? hand.map((cardId, index) => ({ cardId, index })).filter(({ index }) => index !== pending.handIndex)
    : deck.map((cardId, index) => ({ cardId, index })).filter(({ cardId }) => isPokemonInDeck(cardId));
  const kicker = isDiscard ? "Discard Cost" : "Deck Search";
  const title = isDiscard ? "Choose 1 card to discard" : "Choose 1 Umamusume";
  const emptyCopy = "There are no eligible Umamusume in your deck.";

  return (
    <div style={choiceBackdropStyle}>
      <section style={choiceShellStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={previewKickerStyle}>{kicker}</div>
            <h2 style={choiceTitleStyle}>{title}</h2>
          </div>
          <NeutralButton style={smallButtonStyle} onClick={onCancel}>Cancel</NeutralButton>
        </div>
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
              const image = card.kind === "pokemon" ? card.portrait : card.image;
              const displayName = formatCardDisplayName(card);
              return (
                <button key={`${cardId}-${index}`} type="button" style={choiceCardStyle} onClick={() => (isDiscard ? onChooseHand(index) : onChooseDeck(index))}>
                  <img style={choiceImageStyle} src={image} alt={card.name} />
                  <strong style={choiceNameStyle}>{displayName}</strong>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

const choiceBackdropStyle: CSSProperties = { ...overlayBackdropStyle, zIndex: 60 };

const choiceShellStyle: CSSProperties = {
  ...overlaySurfaceStyle,
  width: "min(980px, 100%)",
  maxHeight: "86vh",
  overflow: "auto",
  padding: 18,
};

const choiceTitleStyle: CSSProperties = {
  margin: "2px 0 0",
  fontSize: 24,
  lineHeight: 1.05,
  fontWeight: 950,
};

const smallButtonStyle: CSSProperties = { ...overlayButtonStyle };

const choiceGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
  gap: 12,
  marginTop: 14,
};

const emptyChoiceStyle: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gap: 12,
  justifyItems: "start",
  borderRadius: 8,
  border: "1px solid rgba(100,113,104,0.18)",
  background: "rgba(247,250,248,0.85)",
  padding: 16,
};

const emptyChoiceSubtextStyle: CSSProperties = {
  color: "#647168",
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1.35,
};

const choiceCardStyle: CSSProperties = {
  minHeight: 238,
  borderRadius: 8,
  border: "1px solid rgba(100, 113, 104, 0.2)",
  background: "rgba(247, 250, 248, 0.9)",
  padding: 8,
  cursor: "pointer",
  textAlign: "left",
  boxShadow: "0 12px 28px rgba(17, 24, 39, 0.12)",
};

const choiceImageStyle: CSSProperties = {
  width: "100%",
  height: 192,
  objectFit: "contain",
  display: "block",
};

const choiceNameStyle: CSSProperties = {
  display: "block",
  marginTop: 8,
  color: "#17211c",
  fontSize: 12,
  textAlign: "center",
};
