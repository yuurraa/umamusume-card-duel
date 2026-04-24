import { useState, type CSSProperties } from "react";
import { NeutralButton } from "../components/buttons/NeutralButton";
import { DeckSummaryCard } from "./DeckBrowserScreen";
import type { PremadeDeck } from "../types/ui";
import { borders, buttonStyle, colors, filters, glassPanelStyle, radius, shadows, uiMutedTextColor, uiTextColor, uiTextShadow } from "../styles/shared";

export function MainMenuScreen({
  equippedDeck,
  accountLabel,
  accountDetail,
  accountPhotoUrl,
  accountBusy,
  cloudAvailable,
  isGoogleLinked,
  onPlay,
  onOpenDecks,
  onOpenCards,
  onOpenCustomisation,
  onLinkGoogleAccount,
  onQuit,
}: {
  equippedDeck: PremadeDeck;
  accountLabel: string;
  accountDetail: string;
  accountPhotoUrl: string | null;
  accountBusy: boolean;
  cloudAvailable: boolean;
  isGoogleLinked: boolean;
  onPlay: () => void;
  onOpenDecks: () => void;
  onOpenCards: () => void;
  onOpenCustomisation: () => void;
  onLinkGoogleAccount: () => void;
  onQuit: () => void;
}) {
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <section style={menuScreenStyle}>
      <div style={accountMenuStyle}>
        <button
          type="button"
          style={accountAvatarButtonStyle}
          aria-label="Open profile menu"
          onClick={() => setAccountOpen((open) => !open)}
        >
          {accountPhotoUrl ? (
            <img style={accountAvatarImageStyle} src={accountPhotoUrl} alt="" draggable={false} />
          ) : (
            <span style={guestAvatarStyle}>
              <span style={guestAvatarHeadStyle} />
              <span style={guestAvatarBodyStyle} />
            </span>
          )}
        </button>
        {accountOpen ? (
          <div style={accountPopoverStyle}>
            <div style={accountCloudRowStyle}>
              <span style={accountCloudDotStyle(cloudAvailable)} />
              <span>{cloudAvailable ? "Cloud Available" : "Cloud Unavailable"}</span>
            </div>
            <div style={accountDetailStyle}>Logged in as {isGoogleLinked ? accountLabel : "Guest"}</div>
            <NeutralButton style={accountButtonStyle} disabled={accountBusy || !cloudAvailable || isGoogleLinked} onClick={onLinkGoogleAccount}>
              {accountBusy ? "Connecting..." : isGoogleLinked ? "Google Linked" : "Login to Google"}
            </NeutralButton>
          </div>
        ) : null}
      </div>
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
            <NeutralButton style={menuPrimaryButtonStyle} onClick={onOpenCards}>Cards</NeutralButton>
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
  borderRadius: radius.pill,
  border: borders.glassStrong,
  background: colors.glass,
  boxShadow: shadows.xl,
  padding: "30px 25px",
  backdropFilter: filters.glassBlur,
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
  color: uiTextColor,
  textShadow: uiTextShadow,
  maxWidth: 900,
  fontSize: "clamp(36px, 7vw, 72px)",
  lineHeight: 0.92,
  fontWeight: 950,
  textWrap: "balance",
};

const menuActionPanelStyle: CSSProperties = {
  ...glassPanelStyle,
  display: "grid",
  placeItems: "center",
  minWidth: 280,
  padding: 14,
  gap: 12,
};

const menuButtonColumnStyle: CSSProperties = {
  width: 240,
  display: "grid",
  gap: 10,
};

const menuPrimaryButtonStyle: CSSProperties = {
  ...buttonStyle(true),
};

const equippedDeckDockStyle: CSSProperties = {
  position: "absolute",
  left: 20,
  bottom: 20,
  width: "min(230px, calc(100vw - 112px))",
  zIndex: 1,
};

const accountMenuStyle: CSSProperties = {
  position: "absolute",
  top: 20,
  right: 20,
  zIndex: 3,
  display: "grid",
  justifyItems: "end",
  gap: 10,
};

const accountAvatarButtonStyle: CSSProperties = {
  width: 50,
  height: 50,
  borderRadius: radius.pill,
  border: "2px solid rgba(255, 255, 255, 0.7)",
  background: "transparent",
  boxShadow: shadows.lg,
  padding: 0,
  overflow: "hidden",
  cursor: "pointer",
};

const accountAvatarImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: radius.pill,
  objectFit: "cover",
  display: "block",
};

const guestAvatarStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: radius.pill,
  position: "relative",
  display: "block",
  color: uiTextColor,
  background: "linear-gradient(135deg, #d8e1e8, #8697a5)",
  overflow: "hidden",
};

const guestAvatarHeadStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "19%",
  width: "32%",
  height: "32%",
  borderRadius: radius.pill,
  transform: "translateX(-50%)",
  background: "rgba(255, 255, 255, 0.9)",
};

const guestAvatarBodyStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "10%",
  width: "66%",
  height: "38%",
  borderRadius: "999px 999px 38px 38px",
  transform: "translateX(-50%)",
  background: "rgba(255, 255, 255, 0.9)",
};

const accountPopoverStyle: CSSProperties = {
  ...glassPanelStyle,
  width: "min(132px, calc(100vw - 40px))",
  display: "grid",
  gap: 9,
  padding: 12,
  textAlign: "left",
};

const accountCloudRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 12,
  fontWeight: 950,
};

const accountCloudDotStyle = (available: boolean): CSSProperties => ({
  width: 9,
  height: 9,
  borderRadius: radius.pill,
  background: available ? "#2dd4bf" : "#f97316",
  boxShadow: available ? "0 0 10px rgba(45, 212, 191, 0.75)" : "0 0 10px rgba(249, 115, 22, 0.65)",
});

const accountKickerStyle: CSSProperties = {
  color: uiMutedTextColor,
  textShadow: uiTextShadow,
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
};

const accountDetailStyle: CSSProperties = {
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 13,
  fontWeight: 800,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const accountButtonStyle: CSSProperties = {
  justifySelf: "start",
  width: 132,
  minHeight: 34,
  fontSize: 12,
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
  color: uiMutedTextColor,
  textShadow: uiTextShadow,
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 0.3,
  textDecoration: "none",
};
