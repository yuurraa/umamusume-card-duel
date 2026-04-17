import { type CSSProperties, useState } from "react";
import { EnergyIcon } from "./EnergyIcon";
import { getAttachedEnergy } from "../cards/attachedEnergy";
import { writeDragPayload } from "../drag/dragData";
import { getUmamusumeCard } from "../../game/engine";
import type { EnergyType, UmamusumeInstance, UmamusumeType } from "../../../../shared/src/types";

type UmaCardProps = {
  umamusume: UmamusumeInstance;
  onInspect?: () => void;
  hidden?: boolean;
  isSelectable?: boolean;
  sleeveImage?: string | null | undefined;
};

const typeShadowColors: Record<UmamusumeType, string> = {
  Grass: "rgba(123, 192, 62, 0.42)",
  Fire: "rgba(232, 136, 90, 0.42)",
  Water: "rgba(90, 168, 232, 0.42)",
  Lightning: "rgba(219, 185, 74, 0.42)",
  Psychic: "rgba(184, 130, 216, 0.42)",
  Fighting: "rgba(184, 138, 96, 0.42)",
  Darkness: "rgba(68, 80, 99, 0.42)",
  Steel: "rgba(127, 140, 155, 0.42)",
  Colorless: "rgba(167, 173, 186, 0.42)",
  Dragon: "rgba(212, 167, 44, 0.42)",
};

export function UmaCard({ umamusume, onInspect, hidden = false, isSelectable = false, sleeveImage = null }: UmaCardProps) {
  const [hovered, setHovered] = useState(false);
  const card = getUmamusumeCard(umamusume);
  const shadowColor = hidden ? "rgba(17, 24, 39, 0.24)" : typeShadowColors[card.type];

  return (
    <button
      type="button"
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 420,
        aspectRatio: "745 / 1040",
        padding: 0,
        border: 0,
        borderRadius: 8,
        background: "transparent",
        cursor: "pointer",
        filter: hidden
          ? `drop-shadow(0 18px 28px ${shadowColor})`
          : hovered
            ? `drop-shadow(0 34px 52px ${shadowColor}) saturate(1.06)`
            : `drop-shadow(0 28px 42px ${shadowColor})`,
        transform: hidden ? "none" : hovered ? "translateY(-10px) rotate(0.8deg) scale(1.025)" : "translateY(0) rotate(0deg) scale(1)",
        transition: "transform 180ms ease, filter 180ms ease",
      }}
      onMouseEnter={() => {
        if (!hidden) setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => {
        if (!hidden) setHovered(true);
      }}
      onBlur={() => setHovered(false)}
      onClick={hidden ? undefined : onInspect}
      aria-label={hidden ? "Face-down card" : `Inspect ${card.name}`}
    >
      {hidden ? (
        <FaceDownCard sleeveImage={sleeveImage} fontSize={18} />
      ) : (
        <>
          <img
            style={{ width: "100%", height: "100%", borderRadius: 8, objectFit: "contain", display: "block" }}
            src={card.portrait}
            alt={card.name}
          />
          <AttachedEnergyPips energies={getAttachedEnergy(umamusume)} size="lg" />
        </>
      )}
    </button>
  );
}

export function FaceDownCard({ sleeveImage, fontSize = 12 }: { sleeveImage?: string | null | undefined; fontSize?: number }) {
  return (
    <div style={hiddenCardStyle(fontSize)}>
      {sleeveImage ? (
        <img style={hiddenSleeveImageStyle} src={sleeveImage} alt="" draggable={false} />
      ) : (
        "Face Down"
      )}
    </div>
  );
}

export function AttachedEnergyPips({
  energies,
  size = "sm",
  draggableEnergyTypes,
  sourceUmamusumeUid,
}: {
  energies: EnergyType[];
  size?: "sm" | "lg";
  draggableEnergyTypes?: Set<EnergyType> | undefined;
  sourceUmamusumeUid?: number | undefined;
}) {
  if (energies.length === 0) return null;

  const ringSize = size === "lg" ? 38 : 24;
  const iconSize = size === "lg" ? "md" : "sm";
  const style: CSSProperties = {
    position: "absolute",
    right: size === "lg" ? -13 : -5,
    bottom: size === "lg" ? 26 : 14,
    zIndex: 2,
    display: "flex",
    gap: 0,
    pointerEvents: draggableEnergyTypes ? "auto" : "none",
  };

  return (
    <div style={style}>
      {energies.map((type, index) => (
        <span
          key={`${type}-${index}`}
          draggable={Boolean(draggableEnergyTypes?.has(type) && sourceUmamusumeUid !== undefined)}
          onClick={(event) => {
            if (draggableEnergyTypes?.has(type)) event.stopPropagation();
          }}
          onDragStart={(event) => {
            if (!draggableEnergyTypes?.has(type) || sourceUmamusumeUid === undefined) return;
            event.stopPropagation();
            event.dataTransfer.effectAllowed = "move";
            writeDragPayload(event.dataTransfer, { kind: "ability-energy", energyType: type, sourceUmamusumeUid });
          }}
          style={{
            width: ringSize,
            height: ringSize,
            marginLeft: index === 0 ? 0 : -7,
            display: "grid",
            placeItems: "center",
            borderRadius: "50%",
            border: "1px solid rgba(217, 225, 218, 0.9)",
            background: "rgba(238, 243, 238, 0.74)",
            boxShadow: "0 8px 16px rgba(17, 24, 39, 0.22)",
            cursor: draggableEnergyTypes?.has(type) ? "grab" : "default",
          }}
        >
          <EnergyIcon type={type} size={iconSize} />
        </span>
      ))}
    </div>
  );
}

function hiddenCardStyle(fontSize: number): CSSProperties {
  return {
    width: "100%",
    height: "100%",
    display: "grid",
    placeItems: "center",
    position: "relative",
    overflow: "hidden",
    borderRadius: 8,
    border: "1px solid rgba(23, 33, 28, 0.2)",
    background: "linear-gradient(180deg, #26312d 0%, #17211c 100%)",
    color: "#ffffff",
    fontSize,
    fontWeight: 950,
    letterSpacing: 0.3,
  };
}

const hiddenSleeveImageStyle: CSSProperties = {
  position: "absolute",
  inset: "-6%",
  width: "112%",
  height: "112%",
  objectFit: "cover",
  display: "block",
};
