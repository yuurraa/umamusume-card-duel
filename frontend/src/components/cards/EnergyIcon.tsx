import { type CSSProperties, useState } from "react";
import { energyImages } from "../../../../shared/src/gameData";
import type { EnergyType } from "../../../../shared/src/types";
import { energyLabel } from "../../game/engine";
import { colors, radius } from "../../styles/shared";
import { energyAccentColors } from "../../utils/color";

type EnergyIconProps = {
  type: EnergyType;
  size?: "sm" | "md" | "lg";
};

const sizes: Record<NonNullable<EnergyIconProps["size"]>, number> = {
  sm: 20,
  md: 30,
  lg: 42,
};

const inertStyle: CSSProperties = {
  pointerEvents: "none",
  userSelect: "none",
};

const fallbackLabels: Record<EnergyType, string> = {
  grass: "G",
  fire: "F",
  water: "W",
  lightning: "L",
  psychic: "P",
  fighting: "Fg",
  darkness: "D",
  steel: "M",
  colorless: "C",
  dragon: "Dr",
};

export function EnergyIcon({ type, size = "md" }: EnergyIconProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const pixels = sizes[size];
  const style: CSSProperties = {
    width: pixels,
    height: pixels,
    borderRadius: radius.circle,
    objectFit: "contain",
    display: "block",
    filter: "drop-shadow(0 6px 8px rgba(17, 24, 39, 0.2))",
  };

  if (imageFailed) {
    return (
      <span
        aria-label={energyLabel(type)}
        title={energyLabel(type)}
        style={{
          ...style,
          ...inertStyle,
          display: "grid",
          placeItems: "center",
          background: energyAccentColors[type],
          color: colors.white,
          fontSize: pixels * 0.34,
          fontWeight: 900,
          lineHeight: 1,
          userSelect: "none",
        }}
      >
        {fallbackLabels[type]}
      </span>
    );
  }

  return <img style={{ ...style, ...inertStyle }} src={energyImages[type]} alt={energyLabel(type)} draggable={false} onError={() => setImageFailed(true)} />;
}
