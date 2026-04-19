import { type CSSProperties, useEffect, useState } from "react";
import type { EnergyType } from "../../../shared/src/types";
import { energyLabel, getCard } from "../game/engine";
import { getDeckCoverCard, getDeckEnergyTypes } from "../utils/deck";
import { NeutralButton } from "../components/buttons/NeutralButton";
import { EnergyIcon } from "../components/cards/EnergyIcon";
import type { PremadeDeck } from "../types/ui";
import { GLASS_TILE_BACKGROUND, GLASS_TILE_BACKDROP_FILTER, glassPanelStyle, overlayBackdropStyle, overlayButtonStyle, overlaySurfaceStyle, previewKickerStyle, uiTextColor, uiTextShadow } from "../styles/shared";

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
  const [openedDeckId, setOpenedDeckId] = useState<string | null>(null);
  const [inspectedDeckCardId, setInspectedDeckCardId] = useState<string | null>(null);
  const openedDeck = openedDeckId ? decks.find((deck) => deck.id === openedDeckId) ?? null : null;
  const inspectedDeckCard = inspectedDeckCardId ? getCard(inspectedDeckCardId) : null;

  useEffect(() => {
    const onDeckEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!inspectedDeckCardId && !openedDeckId) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (inspectedDeckCardId) {
        setInspectedDeckCardId(null);
        return;
      }
      setOpenedDeckId(null);
    };

    window.addEventListener("keydown", onDeckEscape, { capture: true });
    return () => window.removeEventListener("keydown", onDeckEscape, { capture: true });
  }, [openedDeckId, inspectedDeckCardId]);

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
          return <DeckBrowserTile key={deck.id} deck={deck} equipped={equipped} onOpen={() => setOpenedDeckId(deck.id)} />;
        })}
        <DeckBrowserLockedEditTile />
      </div>
      {openedDeck && (
        <DeckListModal
          deck={openedDeck}
          equipped={openedDeck.id === equippedDeckId}
          onClose={() => {
            setInspectedDeckCardId(null);
            setOpenedDeckId(null);
          }}
          onEquip={() => {
            onEquipDeck(openedDeck.id);
            setInspectedDeckCardId(null);
            setOpenedDeckId(null);
          }}
          onInspectCard={setInspectedDeckCardId}
        />
      )}
      {inspectedDeckCard && (
        <DeckCardInspectModal
          card={inspectedDeckCard}
          onClose={() => setInspectedDeckCardId(null)}
        />
      )}
    </section>
  );
}

function DeckBrowserTile({ deck, equipped, onOpen }: { deck: PremadeDeck; equipped: boolean; onOpen: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      style={deckBrowserCardStyle(equipped, hovered)}
      onClick={onOpen}
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

function DeckBrowserLockedEditTile() {
  return (
    <button
      type="button"
      disabled
      aria-label="Edit deck unavailable"
      title="Deck editing is currently disabled"
      style={deckBrowserLockedEditCardStyle}
    >
      <span style={deckBrowserLockedEditIconStyle} aria-hidden="true">✎</span>
      <strong style={deckBrowserLockedEditLabelStyle}>Create Deck</strong>
    </button>
  );
}

function DeckListModal({
  deck,
  equipped,
  onClose,
  onEquip,
  onInspectCard,
}: {
  deck: PremadeDeck;
  equipped: boolean;
  onClose: () => void;
  onEquip: () => void;
  onInspectCard: (cardId: string) => void;
}) {
  const isPremadeDeck = true;
  const deckRows: (string | null)[][] = deck.cardIds.length === 20
    ? [
      deck.cardIds.slice(0, 7),
      deck.cardIds.slice(7, 14),
      [...deck.cardIds.slice(14, 20), null],
    ]
    : chunkDeckRows(deck.cardIds, 7);

  return (
    <div style={deckModalBackdropStyle} onClick={onClose}>
      <section style={deckModalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={deckModalHeaderStyle}>
          <div>
            <div style={deckModalMetaStyle}>
              <span style={deckModalKickerStyle}>Deck List</span>
              <span style={deckModalInlineCountStyle}>{deck.cardIds.length} cards</span>
            </div>
            <h2 style={deckModalTitleStyle}>{deck.name}</h2>
          </div>
          <NeutralButton style={closeDeckModalButtonStyle} onClick={onClose}>Close</NeutralButton>
        </header>
        <div style={deckCardGridStyle}>
          {deckRows.map((row, rowIndex) => (
            <div key={`deck-row-${rowIndex}`} style={deckCardRowStyle(row.length)}>
              {row.map((cardId, colIndex) => {
                if (!cardId) {
                  if (isPremadeDeck) {
                    return <DeckListLockedEditSlot key={`locked-edit-${rowIndex}-${colIndex}`} />;
                  }
                  return <div key={`spacer-${rowIndex}-${colIndex}`} style={deckCardSpacerStyle} aria-hidden="true" />;
                }
                const card = getCard(cardId);
                const image = card.kind === "umamusume" ? card.portrait : card.image;
                return (
                  <DeckListCardTile
                    key={`${cardId}-${rowIndex}-${colIndex}`}
                    image={image}
                    name={card.name}
                    onInspect={() => onInspectCard(cardId)}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div style={deckModalActionsStyle}>
          <NeutralButton style={deckModalActionButtonStyle} onClick={onClose}>Back</NeutralButton>
          <NeutralButton style={deckModalActionButtonStyle} disabled={equipped} onClick={onEquip}>
            {equipped ? "Equipped" : "Equip"}
          </NeutralButton>
        </div>
      </section>
    </div>
  );
}

function DeckListLockedEditSlot() {
  return (
    <button
      type="button"
      disabled
      aria-label="Edit deck unavailable for premade decks"
      title="Premade decks cannot be edited"
      style={deckLockedEditTileStyle}
    >
      <span style={deckLockedEditIconStyle} aria-hidden="true">✎</span>
    </button>
  );
}

function chunkDeckRows(cardIds: string[], perRow: number): (string | null)[][] {
  const rows: (string | null)[][] = [];
  for (let index = 0; index < cardIds.length; index += perRow) {
    rows.push(cardIds.slice(index, index + perRow));
  }
  return rows;
}

function DeckListCardTile({ image, name, onInspect }: { image: string; name: string; onInspect: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      style={deckCardTileStyle(hovered)}
      aria-label={`Inspect card`}
      onClick={onInspect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <img style={deckCardImageStyle} src={image} alt="" draggable={false} />
    </button>
  );
}

function DeckCardInspectModal({ card, onClose }: { card: ReturnType<typeof getCard>; onClose: () => void }) {
  const image = card.kind === "umamusume" ? card.portrait : card.image;

  return (
    <div style={deckInspectBackdropStyle} onClick={onClose}>
      <section style={deckInspectSurfaceStyle} onClick={(event) => event.stopPropagation()}>
        <img style={deckInspectImageStyle} src={image} alt="" draggable={false} />
      </section>
    </div>
  );
}

export function DeckSummaryCard({ deck, label, compact = false, framed = true }: { deck: PremadeDeck; label: string; compact?: boolean; framed?: boolean }) {
  const coverCard = getDeckCoverCard(deck);
  const energyTypes = getDeckEnergyTypes(deck);

  return (
    <div style={deckSummaryCardStyle(compact, framed)}>
      <img style={deckCoverImageStyle(compact)} src={coverCard.portrait} alt="" draggable={false} />
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
  color: uiTextColor,
  textShadow: uiTextShadow,
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
  ...glassPanelStyle,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  padding: 18,
};

const deckBrowserTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 36,
  lineHeight: 1,
  fontWeight: 950,
};

const deckBrowserSubtitleStyle: CSSProperties = {
  margin: "10px 0 0",
  color: uiTextColor,
  textShadow: uiTextShadow,
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
    background: GLASS_TILE_BACKGROUND,
    boxShadow: equipped
      ? "0 22px 60px rgba(17, 24, 39, 0.16)"
      : hovered
        ? "0 22px 56px rgba(17, 24, 39, 0.14)"
        : "0 16px 44px rgba(17, 24, 39, 0.1)",
    padding: 16,
    textAlign: "left",
    color: uiTextColor,
    textShadow: uiTextShadow,
    cursor: "pointer",
    transform: hovered && !equipped ? "translateY(-4px)" : "translateY(0)",
    transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease",
    backdropFilter: GLASS_TILE_BACKDROP_FILTER,
  };
}

const deckBrowserLockedEditCardStyle: CSSProperties = {
  ...deckBrowserCardStyle(false, false),
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 14,
  cursor: "not-allowed",
  opacity: 0.85,
  transform: "translateY(0)",
};

const deckBrowserLockedEditIconStyle: CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: "50%",
  border: "1px solid rgba(185, 198, 188, 0.88)",
  background: "rgba(238, 243, 238, 0.68)",
  display: "grid",
  placeItems: "center",
  color: "#000000",
  textShadow: "none",
  fontSize: 26,
  fontWeight: 900,
  lineHeight: 1,
  transform: "scaleX(-1)",
};

const deckBrowserLockedEditLabelStyle: CSSProperties = {
  ...deckSummaryNameStyle(false),
};

function deckSummaryCardStyle(compact: boolean, framed: boolean): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: compact ? 10 : 14,
    alignItems: "center",
    borderRadius: 8,
    border: framed ? "1px solid rgba(185, 198, 188, 0.9)" : 0,
    background: framed ? GLASS_TILE_BACKGROUND : "transparent",
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
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.16,
  textTransform: "uppercase",
};

function deckSummaryNameStyle(compact: boolean): CSSProperties {
  return {
    color: uiTextColor,
    textShadow: uiTextShadow,
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

const deckModalBackdropStyle: CSSProperties = {
  ...overlayBackdropStyle,
  zIndex: 60,
};

const deckModalStyle: CSSProperties = {
  ...overlaySurfaceStyle,
  width: "min(1320px, calc(100vw - 28px))",
  maxHeight: "calc(100vh - 28px)",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr) auto",
  gap: 10,
  padding: 12,
  background: "rgba(238, 243, 238, 0.95)",
  border: "1px solid rgba(185, 198, 188, 0.72)",
  boxShadow: "0 16px 44px rgba(17, 24, 39, 0.18)",
  color: "#000000",
  textShadow: "none",
};

const deckModalHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const deckModalTitleStyle: CSSProperties = {
  margin: "2px 0 0",
  color: "#000000",
  textShadow: "none",
  fontSize: 22,
  lineHeight: 1.05,
  fontWeight: 950,
};

const deckModalKickerStyle: CSSProperties = {
  ...previewKickerStyle,
  color: "#000000",
  textShadow: "none",
};

const closeDeckModalButtonStyle: CSSProperties = {
  ...overlayButtonStyle,
  minWidth: 78,
};

const deckModalMetaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const deckModalInlineCountStyle: CSSProperties = {
  color: "#000000",
  textShadow: "none",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.12,
  textTransform: "uppercase",
};

const deckCardGridStyle: CSSProperties = {
  minHeight: 0,
  overflow: "visible",
  display: "grid",
  gap: 10,
  padding: "14px 6px 4px",
  alignContent: "start",
};

function deckCardRowStyle(_count: number): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gap: 10,
  };
}

function deckCardTileStyle(hovered: boolean): CSSProperties {
  return {
    width: "100%",
    aspectRatio: "745 / 1040",
    borderRadius: 8,
    border: "1px solid rgba(185, 198, 188, 0.58)",
    background: "rgba(238, 243, 238, 0.52)",
    filter: hovered
      ? "drop-shadow(0 34px 52px rgba(17, 24, 39, 0.22)) saturate(1.06)"
      : "drop-shadow(0 28px 42px rgba(17, 24, 39, 0.18))",
    overflow: "hidden",
    cursor: "pointer",
    transform: hovered ? "translateY(-10px) rotate(0.8deg) scale(1.025)" : "translateY(0) rotate(0deg) scale(1)",
    transition: "transform 180ms ease, filter 180ms ease",
    padding: 0,
  };
}

const deckCardSpacerStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "745 / 1040",
};

const deckLockedEditTileStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "745 / 1040",
  borderRadius: 8,
  border: "1px dashed rgba(185, 198, 188, 0.88)",
  background: "rgba(238, 243, 238, 0.24)",
  display: "grid",
  placeItems: "center",
  boxShadow: "0 18px 34px rgba(17, 24, 39, 0.1)",
  opacity: 0.85,
  cursor: "not-allowed",
  padding: 0,
};

const deckLockedEditIconStyle: CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: "50%",
  border: "1px solid rgba(185, 198, 188, 0.88)",
  background: "rgba(238, 243, 238, 0.68)",
  display: "grid",
  placeItems: "center",
  color: "#000000",
  textShadow: "none",
  fontSize: 26,
  fontWeight: 900,
  lineHeight: 1,
  transform: "scaleX(-1)",
};

const deckCardImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
};

const deckModalActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  paddingTop: 0,
};

const deckModalActionButtonStyle: CSSProperties = {
  ...overlayButtonStyle,
  minWidth: 92,
};

const deckInspectBackdropStyle: CSSProperties = {
  ...overlayBackdropStyle,
  zIndex: 65,
};

const deckInspectSurfaceStyle: CSSProperties = {
  position: "relative",
  width: "min(520px, calc(100vw - 32px))",
  display: "grid",
  placeItems: "center",
};

const deckInspectImageStyle: CSSProperties = {
  width: "100%",
  maxHeight: "90vh",
  borderRadius: 8,
  objectFit: "contain",
  display: "block",
  boxShadow: "0 32px 100px rgba(0, 0, 0, 0.44)",
};
