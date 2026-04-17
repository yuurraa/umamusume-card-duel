import type { CSSProperties } from "react";
import { NeutralButton } from "../components/buttons/NeutralButton";
import { DeckSummaryCard } from "./DeckBrowserScreen";
import type { PremadeDeck } from "../types/ui";

export function MainMenuScreen({
  equippedDeck,
  onPlay,
  onOpenDecks,
  onOpenCustomisation,
  onQuit,
}: {
  equippedDeck: PremadeDeck;
  onPlay: () => void;
  onOpenDecks: () => void;
  onOpenCustomisation: () => void;
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
            <NeutralButton style={menuPrimaryButtonStyle} onClick={onOpenCustomisation}>Customisation</NeutralButton>
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
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

const menuHeroStyle: CSSProperties = {
  display: "grid",
  justifyItems: "center",
  textAlign: "center",
  gap: 40,
};

const titleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  maxWidth: "min(850px, calc(100vw - 28px))",
  borderRadius: 999,
  border: "1px solid rgba(176, 187, 178, 0.86)",
  background: "linear-gradient(180deg, rgba(244, 248, 245, 0.46) 0%, rgba(228, 236, 230, 0.36) 48%, rgba(212, 222, 214, 0.34) 100%)",
  boxShadow: "inset 0 2px 10px rgba(255, 255, 255, 0.45), inset 0 -8px 16px rgba(124, 139, 127, 0.22), 0 24px 62px rgba(17, 24, 39, 0.2)",
  padding: "30px 25px",
  backdropFilter: "blur(7px)",
};

const headerImageBase: CSSProperties = {
  flex: "0 0 auto",
  width: "clamp(68px, 14vw, 110px)",
  padding: "0 64px",
  height: "auto",
  objectFit: "contain",
  filter: "drop-shadow(0 10px 20px rgba(17, 24, 39, 0.14))",
};

const headerImageLeftStyle: CSSProperties = {
  ...headerImageBase,
  transform: "scaleX(-1)",
};

const headerImageRightStyle: CSSProperties = {
  ...headerImageBase,
};

const menuTitleStyle: CSSProperties = {
  margin: 0,
  color: "#000000",
  maxWidth: 900,
  fontSize: "clamp(36px, 7vw, 72px)",
  lineHeight: 0.92,
  fontWeight: 950,
  textWrap: "balance",
};

const menuActionPanelStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  minWidth: 280,
  padding: 12,
  borderRadius: 8,
  border: "1px solid rgba(217, 225, 218, 0.72)",
  background: "rgba(238, 243, 238, 0.3)",
  boxShadow: "0 20px 60px rgba(17, 24, 39, 0.18)",
  backdropFilter: "blur(7px)",
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
