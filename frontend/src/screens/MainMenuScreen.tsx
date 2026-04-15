import type { CSSProperties } from "react";
import { NeutralButton } from "../components/NeutralButton";
import { DeckSummaryCard } from "./DeckBrowserScreen";
import type { PremadeDeck } from "../types/ui";

export function MainMenuScreen({
  equippedDeck,
  onPlay,
  onOpenDecks,
  onQuit,
}: {
  equippedDeck: PremadeDeck;
  onPlay: () => void;
  onOpenDecks: () => void;
  onQuit: () => void;
}) {
  return (
    <section style={menuScreenStyle}>
      <div style={menuHeroStyle}>
        <h1 style={menuTitleStyle}>Umamusume TCG Pocket</h1>
        <div style={menuActionPanelStyle}>
          <div style={menuButtonColumnStyle}>
            <NeutralButton style={menuPrimaryButtonStyle} onClick={onPlay}>Play</NeutralButton>
            <NeutralButton style={menuPrimaryButtonStyle} onClick={onOpenDecks}>Decks</NeutralButton>
            <NeutralButton style={menuPrimaryButtonStyle} onClick={onQuit}>Quit</NeutralButton>
          </div>
        </div>
      </div>
      <div style={equippedDeckDockStyle}>
        <DeckSummaryCard deck={equippedDeck} label="Equipped Deck" compact />
      </div>
    </section>
  );
}

const menuScreenStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

const menuHeroStyle: CSSProperties = {
  display: "grid",
  justifyItems: "center",
  textAlign: "center",
  gap: 20,
};

const menuTitleStyle: CSSProperties = {
  margin: 0,
  color: "#17211c",
  maxWidth: 900,
  fontSize: "clamp(48px, 9vw, 88px)",
  lineHeight: 0.92,
  fontWeight: 950,
  paddingBottom: 20,
  textWrap: "balance",
};

const menuActionPanelStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  minWidth: 280,
  padding: 12,
  borderRadius: 18,
  border: "1px solid rgba(203, 213, 225, 0.9)",
  background: "rgba(255, 255, 255, 0.96)",
  boxShadow: "0 20px 60px rgba(17, 24, 39, 0.1)",
};

const menuButtonColumnStyle: CSSProperties = {
  width: 240,
  display: "grid",
  gap: 10,
};

const menuPrimaryButtonStyle: CSSProperties = {
  width: "100%",
  height: 54,
  fontSize: 16,
};

const equippedDeckDockStyle: CSSProperties = {
  position: "absolute",
  left: 20,
  bottom: 20,
  width: "min(230px, calc(100vw - 112px))",
  zIndex: 1,
};
