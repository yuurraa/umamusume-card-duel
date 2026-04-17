import { type CSSProperties, useState } from "react";
import type { EnergyType } from "../../../shared/src/types";
import { energyLabel } from "../game/engine";
import { getDeckCoverCard, getDeckEnergyTypes } from "../utils/deck";
import { NeutralButton } from "../components/buttons/NeutralButton";
import { EnergyIcon } from "../components/cards/EnergyIcon";
import type { PremadeDeck } from "../types/ui";

const SELECTED_TICK = "\u2713";

export function DeckBrowserScreen({
  decks,
  equippedDeckId,
  onEquipDeck,
  onBack,
}: {
  decks: PremadeDeck[];
  equippedDeckId: string;
  onEquipDeck: (deckId: string) => void;
  onBack: () => void;
}) {
  return (
    <section style={deckBrowserShellStyle}>
      <div style={deckBrowserHeaderStyle}>
        <div>
          <div style={menuKickerStyle}>Decks</div>
          <h1 style={deckBrowserTitleStyle}>Choose your deck</h1>
          <p style={deckBrowserSubtitleStyle}>Select a deck and equip it for the next match.</p>
        </div>
        <NeutralButton style={deckBrowserBackButtonStyle} onClick={onBack}>Back</NeutralButton>
      </div>
      <div style={deckBrowserGridStyle}>
        {decks.map((deck) => {
          const equipped = deck.id === equippedDeckId;
          return <DeckBrowserTile key={deck.id} deck={deck} equipped={equipped} onEquip={() => onEquipDeck(deck.id)} />;
        })}
      </div>
    </section>
  );
}

function DeckBrowserTile({ deck, equipped, onEquip }: { deck: PremadeDeck; equipped: boolean; onEquip: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      style={deckBrowserCardStyle(equipped, hovered)}
      onClick={onEquip}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {equipped && <span style={deckSelectedBadgeStyle}>{SELECTED_TICK}</span>}
      <DeckSummaryCard deck={deck} label="Premade Deck" framed={false} />
    </button>
  );
}

export function DeckSummaryCard({ deck, label, compact = false, framed = true }: { deck: PremadeDeck; label: string; compact?: boolean; framed?: boolean }) {
  const coverCard = getDeckCoverCard(deck);
  const energyTypes = getDeckEnergyTypes(deck);

  return (
    <div style={deckSummaryCardStyle(compact, framed)}>
      <img style={deckCoverImageStyle(compact)} src={coverCard.portrait} alt={coverCard.name} draggable={false} />
      <div style={deckSummaryTextStyle}>
        <div style={deckSummaryLabelStyle}>{label}</div>
        <strong style={deckSummaryNameStyle(compact)}>{deck.name}</strong>
        <div style={deckEnergyRowStyle}>
          {energyTypes.map((type) => (
            <span key={`${deck.id}-${type}`} style={deckEnergyIconWrapStyle} aria-label={energyLabel(type)}>
              <EnergyIcon type={type} size="sm" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const menuKickerStyle: CSSProperties = {
  color: "#000000",
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: 0.2,
  textTransform: "uppercase",
};

const deckBrowserShellStyle: CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  display: "grid",
  gap: 22,
  padding: "24px 0 40px",
};

const deckBrowserHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  borderRadius: 8,
  border: "1px solid rgba(217, 225, 218, 0.76)",
  background: "rgba(238, 243, 238, 0.3)",
  boxShadow: "0 22px 60px rgba(17, 24, 39, 0.18)",
  padding: 18,
  backdropFilter: "blur(7px)",
};

const deckBrowserTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#000000",
  fontSize: 36,
  lineHeight: 1,
  fontWeight: 950,
};

const deckBrowserSubtitleStyle: CSSProperties = {
  margin: "10px 0 0",
  color: "#000000",
  fontSize: 15,
  fontWeight: 800,
};

const deckBrowserBackButtonStyle: CSSProperties = {
  padding: "0 16px",
  height: 44,
};

const deckBrowserGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 22,
};

function deckBrowserCardStyle(equipped: boolean, hovered: boolean): CSSProperties {
  return {
    position: "relative",
    border: equipped
      ? "2px solid rgba(0, 0, 0, 0.62)"
      : hovered
        ? "1px solid rgba(0, 0, 0, 0.36)"
        : "1px solid rgba(185, 198, 188, 0.9)",
    borderRadius: 8,
    background: equipped
      ? "rgba(238, 243, 238, 0.38)"
      : hovered
        ? "rgba(238, 243, 238, 0.34)"
        : "rgba(238, 243, 238, 0.3)",
    boxShadow: equipped
      ? "0 22px 60px rgba(17, 24, 39, 0.16)"
      : hovered
        ? "0 22px 56px rgba(17, 24, 39, 0.14)"
        : "0 16px 44px rgba(17, 24, 39, 0.1)",
    padding: 16,
    textAlign: "left",
    color: "#000000",
    textShadow: "1px 1px 1px rgba(255, 255, 255, 0.6)",
    cursor: "pointer",
    transform: hovered && !equipped ? "translateY(-4px)" : "translateY(0)",
    transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease",
    backdropFilter: "blur(6px)",
  };
}

function deckSummaryCardStyle(compact: boolean, framed: boolean): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: compact ? 10 : 14,
    alignItems: "center",
    borderRadius: 8,
    border: framed ? "1px solid rgba(185, 198, 188, 0.9)" : 0,
    background: framed ? "rgba(238, 243, 238, 0.3)" : "transparent",
    boxShadow: framed ? "0 16px 42px rgba(17, 24, 39, 0.12)" : "none",
    padding: framed ? (compact ? 12 : 14) : 0,
  };
}

const deckSummaryTextStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 6,
  justifyItems: "center",
  textAlign: "center",
};

const deckSummaryLabelStyle: CSSProperties = {
  color: "#000000",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.16,
  textTransform: "uppercase",
};

function deckSummaryNameStyle(compact: boolean): CSSProperties {
  return {
    color: "#000000",
    fontSize: compact ? 20 : 28,
    lineHeight: 1.05,
    fontWeight: 950,
  };
}

const deckEnergyRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  flexWrap: "wrap",
};

const deckEnergyIconWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  borderRadius: "50%",
  border: "1px solid rgba(255, 255, 255, 0.9)",
  boxSizing: "border-box",
};

function deckCoverImageStyle(compact: boolean): CSSProperties {
  return {
    width: "100%",
    maxWidth: compact ? 132 : 256,
    justifySelf: "center",
    borderRadius: 8,
    display: "block",
    objectFit: "contain",
    filter: "drop-shadow(0 18px 28px rgba(17, 24, 39, 0.2))",
  };
}

const deckSelectedBadgeStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  zIndex: 1,
  width: 34,
  height: 34,
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  border: "1px solid rgba(0, 0, 0, 0.18)",
  background: "#000000",
  color: "#ffffff",
  fontSize: 18,
  fontWeight: 950,
  boxShadow: "0 10px 20px rgba(17, 24, 39, 0.18)",
};
