import type { CSSProperties } from "react";
import { getCard } from "../../game/engine";
import { HoloCardImage } from "../../components/cards/HoloCardImage";
import { CARD_ASPECT_RATIO, CARD_INSPECT_IMAGE_RADIUS, colors, radius, shadows } from "../../styles/shared";

export function ShuffleCardReveal({ cardId, onDone }: { cardId: string; onDone: () => void }) {
  const card = getCard(cardId);
  const image = card.kind === "umamusume" ? card.portrait : card.image;

  return (
    <div style={revealRootStyle} aria-live="polite">
      <style>{SHUFFLE_REVEAL_KEYFRAMES}</style>
      <div style={revealDimStyle} />
      <div style={revealCardWrapStyle} onAnimationEnd={onDone}>
        <HoloCardImage
          card={card}
          src={image}
          alt={card.name}
          imageStyle={revealCardImageStyle}
          radiusOverride={CARD_INSPECT_IMAGE_RADIUS}
          disableHoverAnimation
        />
      </div>
    </div>
  );
}

const revealRootStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 70,
  pointerEvents: "none",
  display: "grid",
  placeItems: "center",
};

const revealDimStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: colors.black,
  animation: "shuffle-reveal-dim 2100ms ease both",
};

const revealCardWrapStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  width: "min(310px, 38vw)",
  aspectRatio: CARD_ASPECT_RATIO,
  borderRadius: radius.md,
  boxShadow: shadows.xl,
  transformOrigin: "center center",
  animation: "shuffle-reveal-card 2100ms cubic-bezier(0.2, 0.8, 0.18, 1) both",
};

const revealCardImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: radius.md,
  objectFit: "contain",
  display: "block",
};

const SHUFFLE_REVEAL_KEYFRAMES = `
@keyframes shuffle-reveal-dim {
  0% { opacity: 0; }
  12% { opacity: 0.34; }
  66% { opacity: 0.34; }
  100% { opacity: 0; }
}

@keyframes shuffle-reveal-card {
  0% {
    opacity: 0;
    transform: translate3d(0, 10px, 0) scale(0.94);
  }
  12% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
  66% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate3d(calc(-50vw + 100px), calc(50vh - 116px), 0) scale(0.16);
  }
}
`;
