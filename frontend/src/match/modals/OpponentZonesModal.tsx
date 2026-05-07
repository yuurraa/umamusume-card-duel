import type { CSSProperties } from "react";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { borders, colors, overlayBackdropStyle, overlayButtonStyle, overlaySurfaceStyle, previewKickerStyle } from "../../styles/shared";

type OpponentZonesModalProps = {
  handCount: number;
  deckCount: number;
  discardCount: number;
  onOpenDiscard: () => void;
  onClose: () => void;
};

export function OpponentZonesModal({
  handCount,
  deckCount,
  discardCount,
  onOpenDiscard,
  onClose,
}: OpponentZonesModalProps) {
  return (
    <div style={backdropStyle} onClick={onClose}>
      <section style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={headerStyle}>
          <div>
            <div style={kickerStyle}>Opponent</div>
            <h2 style={titleStyle}>Zones</h2>
          </div>
          <NeutralButton style={closeButtonStyle} onClick={onClose}>Close</NeutralButton>
        </header>
        <div style={statsGridStyle}>
          <ZoneStat label="Hand" count={handCount} />
          <ZoneStat label="Deck" count={deckCount} />
          <ZoneStat label="Discard" count={discardCount} />
        </div>
        <NeutralButton style={discardButtonStyle} onClick={onOpenDiscard}>
          View Opponent Discard
        </NeutralButton>
      </section>
    </div>
  );
}

function ZoneStat({ label, count }: { label: string; count: number }) {
  return (
    <div style={zoneStatStyle}>
      <div style={zoneCountStyle}>{count}</div>
      <div style={zoneLabelStyle}>{label}</div>
    </div>
  );
}

const backdropStyle: CSSProperties = {
  ...overlayBackdropStyle,
  zIndex: 48,
};

const modalStyle: CSSProperties = {
  ...overlaySurfaceStyle,
  width: "min(540px, calc(100vw - 48px))",
  display: "grid",
  gap: 12,
  padding: 16,
  background: colors.glassOverlay,
  color: colors.black,
  textShadow: "none",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
};

const titleStyle: CSSProperties = {
  margin: "2px 0 0",
  color: colors.black,
  textShadow: "none",
  fontSize: 24,
  lineHeight: 1.05,
  fontWeight: 950,
};

const kickerStyle: CSSProperties = {
  ...previewKickerStyle,
  color: colors.black,
  textShadow: "none",
};

const closeButtonStyle: CSSProperties = {
  ...overlayButtonStyle,
  minWidth: 76,
};

const statsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const zoneStatStyle: CSSProperties = {
  borderRadius: 10,
  border: borders.neutral,
  background: "rgba(238, 243, 238, 0.78)",
  padding: "10px 8px",
  textAlign: "center",
};

const zoneCountStyle: CSSProperties = {
  color: colors.black,
  fontSize: 22,
  fontWeight: 900,
  lineHeight: 1,
};

const zoneLabelStyle: CSSProperties = {
  marginTop: 4,
  color: colors.slate700,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const discardButtonStyle: CSSProperties = {
  height: 44,
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: "0.04em",
};
