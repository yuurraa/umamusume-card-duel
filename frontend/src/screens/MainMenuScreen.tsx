import type { CSSProperties } from "react";
import { NeutralButton } from "../components/buttons/NeutralButton";
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
        <div style={titleRowStyle}>
          <img style={headerImageLeftStyle} src="/assets/header.png" alt="" draggable={false} />
          <h1 style={menuTitleStyle}>Umamusume Card Duel</h1>
          <img style={headerImageRightStyle} src="/assets/header.png" alt="" draggable={false} />
        </div>
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
      <footer style={footerStyle}>
        <a style={footerLinkStyle} href="https://github.com/yuurraa" target="_blank" rel="noreferrer">
          github.com/yuurraa
        </a>
      </footer>
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

const titleRowStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const headerImageBase: CSSProperties = {
  position: "absolute",
  top: "50%",
  width: "clamp(112px, 8vw, 112px)",
  height: "auto",
  objectFit: "contain",
  transform: "translateY(-50%)",
  filter: "drop-shadow(0 10px 20px rgba(17, 24, 39, 0.14))",
};

const headerImageLeftStyle: CSSProperties = {
  ...headerImageBase,
  right: "100%",
  marginRight: -120,
  transform: "translateY(-50%) scaleX(-1)",
};

const headerImageRightStyle: CSSProperties = {
  ...headerImageBase,
  left: "100%",
  marginLeft: -120,
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

const footerStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  display: "flex",
  justifyContent: "center",
  padding: "0 16px clamp(6px, 1vh, 16px)",
};

const footerLinkStyle: CSSProperties = {
  color: "rgba(100, 113, 104, 0.38)",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 0.3,
  textDecoration: "none",
};
