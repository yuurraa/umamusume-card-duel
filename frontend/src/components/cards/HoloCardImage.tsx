import type { CSSProperties, MouseEvent } from "react";
import { getCardRarity } from "../../../../shared/src/cardRarity";
import type { Card } from "../../../../shared/src/types";

type HoloCardImageProps = {
  card: Card;
  src: string;
  alt: string;
  imageStyle: CSSProperties;
  draggable?: boolean;
  radiusOverride?: number;
  shineVariant?: "default" | "compact";
  wrapperStyle?: CSSProperties;
  onClick?: (event: MouseEvent<HTMLImageElement>) => void;
};

export function HoloCardImage({ card, src, alt, imageStyle, draggable = false, radiusOverride, shineVariant = "default", wrapperStyle, onClick }: HoloCardImageProps) {
  const rarity = getCardRarity(card);
  const hasHolo = rarity === "rare" || rarity === "doubleRare";
  const shadow = imageStyle.boxShadow;
  const borderRadius = radiusOverride ?? imageStyle.borderRadius ?? 8;

  return (
    <span
      style={{
        position: "relative",
        display: "block",
        width: imageStyle.width ?? "100%",
        height: imageStyle.height,
        aspectRatio: imageStyle.aspectRatio,
        maxWidth: imageStyle.maxWidth,
        maxHeight: imageStyle.maxHeight,
        justifySelf: imageStyle.justifySelf,
        alignSelf: imageStyle.alignSelf,
        borderRadius,
        boxShadow: typeof shadow === "string" ? shadow : undefined,
        overflow: "hidden",
        ...wrapperStyle,
      }}
    >
      <img
        style={{
          ...imageStyle,
          display: "block",
          boxShadow: "none",
          borderRadius,
        }}
        src={src}
        alt={alt}
        draggable={draggable}
        onClick={onClick}
      />
      {hasHolo && (
        <>
          <span style={holoSparkleOverlayStyle(rarity, borderRadius)} aria-hidden="true" />
          <span style={holoSheenOverlayStyle(rarity, shineVariant)} aria-hidden="true" />
        </>
      )}
    </span>
  );
}

function holoSparkleOverlayStyle(rarity: ReturnType<typeof getCardRarity>, borderRadius: CSSProperties["borderRadius"]): CSSProperties {
  const isUltraRare = rarity === "doubleRare";

  return {
    position: "absolute",
    inset: 0,
    borderRadius,
    pointerEvents: "none",
    background: isUltraRare
      ? "radial-gradient(circle at 16% 18%, rgba(255, 255, 255, 0.72) 0 0.8px, rgba(255, 231, 122, 0.24) 1.4px, transparent 3px), radial-gradient(circle at 74% 24%, rgba(142, 235, 255, 0.58) 0 0.9px, rgba(255, 115, 210, 0.2) 1.5px, transparent 3.2px), radial-gradient(circle at 38% 72%, rgba(255, 255, 255, 0.62) 0 0.8px, rgba(112, 255, 199, 0.2) 1.4px, transparent 3px), radial-gradient(circle at 86% 82%, rgba(255, 166, 229, 0.54) 0 0.8px, transparent 3px), radial-gradient(circle at 28% 48%, rgba(255, 255, 180, 0.5) 0 0.7px, transparent 2.8px), radial-gradient(circle at 62% 58%, rgba(139, 255, 226, 0.42) 0 0.7px, transparent 2.8px), radial-gradient(circle at 48% 30%, rgba(255, 150, 235, 0.44) 0 0.7px, transparent 2.8px)"
      : "radial-gradient(circle at 18% 22%, rgba(255, 255, 255, 0.52) 0 0.8px, rgba(202, 232, 247, 0.18) 1.4px, transparent 3px), radial-gradient(circle at 72% 66%, rgba(255, 255, 255, 0.42) 0 0.8px, rgba(202, 232, 247, 0.14) 1.4px, transparent 3px), radial-gradient(circle at 42% 38%, rgba(255, 255, 255, 0.36) 0 0.7px, transparent 2.8px)",
    backgroundRepeat: "no-repeat",
    mixBlendMode: "screen",
    animation: isUltraRare ? "card-holo-sparkle-pulse 4.8s ease-in-out infinite" : "card-holo-sparkle-pulse 6s ease-in-out infinite",
  };
}

function holoSheenOverlayStyle(rarity: ReturnType<typeof getCardRarity>, variant: "default" | "compact"): CSSProperties {
  const isUltraRare = rarity === "doubleRare";
  const compact = variant === "compact";

  return {
    position: "absolute",
    top: compact ? "-48%" : "-70%",
    bottom: compact ? "-48%" : "-70%",
    left: compact ? "-54%" : "-82%",
    width: compact ? "116%" : "170%",
    pointerEvents: "none",
    borderRadius: "44%",
    background: isUltraRare
      ? "linear-gradient(90deg, black 0%, black 18%, hsl(314, 45%, 28%) 34%, hsl(52, 72%, 72%) 50%, hsl(188, 58%, 66%) 62%, hsl(270, 48%, 36%) 76%, black 92%, black 100%)"
      : "linear-gradient(90deg, black 0%, black 24%, hsl(210, 14%, 26%) 40%, hsl(198, 70%, 78%) 54%, hsl(245, 34%, 68%) 68%, black 86%, black 100%)",
    mixBlendMode: "color-dodge",
    opacity: compact ? (isUltraRare ? 0.24 : 0.16) : (isUltraRare ? 0.38 : 0.24),
    animation: isUltraRare ? "card-holo-shimmer-contained 6s linear infinite" : "card-holo-shimmer-contained 8s linear infinite",
  };
}
