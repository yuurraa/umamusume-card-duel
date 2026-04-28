import { type CSSProperties, useEffect, useRef, useState } from "react";
import { EnergyIcon } from "./EnergyIcon";
import { AbilityReadyBadge } from "./AbilityReadyBadge";
import { AttachedToolBadge } from "./AttachedToolBadge";
import { HoloCardImage } from "./HoloCardImage";
import { getAttachedEnergy } from "../cards/attachedEnergy";
import { applyDragPreview, writeDragPayload } from "../drag/dragData";
import { getUmamusumeCard } from "../../game/engine";
import type { EnergyType, UmamusumeInstance } from "../../../../shared/src/types";
import { CARD_ASPECT_RATIO, CARD_INSPECT_IMAGE_RADIUS, borders, colors, radius, transitions } from "../../styles/shared";
import { alphaColor, typeAccentColors } from "../../utils/color";

type UmaCardProps = {
  umamusume: UmamusumeInstance;
  onInspect?: () => void;
  onToolInspect?: (toolCardId: string) => void;
  hidden?: boolean;
  isSelectable?: boolean;
  isDimmed?: boolean;
  abilityReady?: boolean;
  sleeveImage?: string | null | undefined;
  blurPrintedHpCorner?: boolean;
};

export function UmaCard({
  umamusume,
  onInspect,
  onToolInspect,
  hidden = false,
  isSelectable = false,
  isDimmed = false,
  abilityReady = false,
  sleeveImage = null,
  blurPrintedHpCorner = false,
}: UmaCardProps) {
  const [hovered, setHovered] = useState(false);
  const card = getUmamusumeCard(umamusume);
  const shadowColor = hidden ? "rgba(17, 24, 39, 0.24)" : alphaColor(typeAccentColors[card.type], 0.42);
  const activeHover = hovered && !hidden && !isDimmed;

  return (
    <button
      type="button"
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 420,
        aspectRatio: CARD_ASPECT_RATIO,
        containerType: "inline-size",
        isolation: "isolate",
        padding: 0,
        border: 0,
        borderRadius: radius.md,
        background: "transparent",
        cursor: "pointer",
        opacity: isDimmed ? 0.45 : 1,
        filter: hidden
          ? `drop-shadow(0 18px 28px ${shadowColor})`
          : activeHover
            ? `drop-shadow(0 34px 52px ${shadowColor}) saturate(1.06)`
            : `drop-shadow(0 28px 42px ${shadowColor})`,
        transform: hidden ? "none" : activeHover ? "translateY(-10px) rotate(0.8deg) scale(1.025)" : "translateY(0) rotate(0deg) scale(1)",
        transition: `opacity ${transitions.board}, transform ${transitions.slow}, filter ${transitions.slow}`,
      }}
      onMouseEnter={() => {
        if (!hidden && !isDimmed) setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => {
        if (!hidden && !isDimmed) setHovered(true);
      }}
      onBlur={() => setHovered(false)}
      onClick={hidden ? undefined : onInspect}
      aria-label={hidden ? "Face-down card" : `Inspect ${card.name}`}
    >
      {hidden ? (
        <FaceDownCard sleeveImage={sleeveImage} fontSize={18} />
      ) : (
        <>
          <HoloCardImage card={card} src={card.portrait} alt={card.name} imageStyle={umaCardImageStyle} radiusOverride={CARD_INSPECT_IMAGE_RADIUS} />
          {blurPrintedHpCorner && <div style={printedHpCornerBlurStyle} aria-hidden="true" />}
          <CardHpOverlay hp={umamusume.hp} maxHp={umamusume.maxHp} size="lg" />
          {abilityReady && <AbilityReadyBadge corner="topLeft" />}
          <AttachedToolBadge toolCardId={umamusume.toolCardId} onInspect={onToolInspect} />
          <AttachedEnergyPips energies={getAttachedEnergy(umamusume)} size="lg" />
        </>
      )}
    </button>
  );
}

export function CardHpOverlay({ hp, maxHp, size = "md" }: { hp: number; maxHp: number; size?: "sm" | "md" | "lg" }) {
  const percent = maxHp > 0 ? Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100))) : 0;
  const fillColor = percent <= 25 ? "#f59e0b" : percent <= 50 ? "#facc15" : "#29e6bd";
  return (
    <div style={hpOverlayStyle(size)} aria-label={`${hp} of ${maxHp} HP`}>
      <div style={hpDiffuseBlurStyle(size)} />
      <div style={hpContentStyle(size)}>
        <div style={hpNumberStyle(size)}>{hp}</div>
        <div style={hpTrackStyle(size)}>
          <div style={{ ...hpFillStyle, width: `${percent}%`, background: fillColor }} />
        </div>
      </div>
    </div>
  );
}

export function FaceDownCard({ sleeveImage, fontSize = 12 }: { sleeveImage?: string | null | undefined; fontSize?: number }) {
  return (
    <div style={hiddenCardStyle(fontSize)}>
      {sleeveImage ? (
        <img style={hiddenSleeveImageStyle} src={sleeveImage} alt="" draggable={false} />
      ) : (
        "Hidden"
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
  const [addedByType, setAddedByType] = useState<Partial<Record<EnergyType, number>>>({});
  const previousCountsRef = useRef<Partial<Record<EnergyType, number>>>({});
  const clearAnimationTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const currentCounts = energies.reduce<Partial<Record<EnergyType, number>>>((counts, type) => {
      counts[type] = (counts[type] ?? 0) + 1;
      return counts;
    }, {});
    const previousCounts = previousCountsRef.current;
    const nextAddedByType = (Object.keys(currentCounts) as EnergyType[]).reduce<Partial<Record<EnergyType, number>>>((added, type) => {
      const previous = previousCounts[type] ?? 0;
      const current = currentCounts[type] ?? 0;
      const delta = current - previous;
      if (delta > 0) added[type] = delta;
      return added;
    }, {});

    if (Object.keys(nextAddedByType).length > 0) {
      setAddedByType(nextAddedByType);
      if (clearAnimationTimeoutRef.current !== null) window.clearTimeout(clearAnimationTimeoutRef.current);
      clearAnimationTimeoutRef.current = window.setTimeout(() => {
        setAddedByType({});
        clearAnimationTimeoutRef.current = null;
      }, 420);
    }

    previousCountsRef.current = currentCounts;
  }, [energies]);

  useEffect(() => () => {
    if (clearAnimationTimeoutRef.current !== null) window.clearTimeout(clearAnimationTimeoutRef.current);
  }, []);

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
  const occurrenceByType: Partial<Record<EnergyType, number>> = {};

  return (
    <div style={style}>
      <style>{ENERGY_APPEAR_KEYFRAMES}</style>
      {energies.map((type, index) => {
        const occurrenceIndex = occurrenceByType[type] ?? 0;
        occurrenceByType[type] = occurrenceIndex + 1;
        const shouldAnimate = occurrenceIndex < (addedByType[type] ?? 0);
        return (
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
            applyDragPreview(event);
          }}
          style={{
            width: ringSize,
            height: ringSize,
            marginLeft: index === 0 ? 0 : -7,
            display: "grid",
            placeItems: "center",
            borderRadius: radius.circle,
            border: borders.glass,
            background: "rgba(238, 243, 238, 0.74)",
            boxShadow: "0 8px 16px rgba(17, 24, 39, 0.22)",
            cursor: draggableEnergyTypes?.has(type) ? "grab" : "default",
            animation: shouldAnimate ? `energy-pip-appear 280ms ${transitions.spring} ${index * 28}ms both` : undefined,
          }}
        >
          <EnergyIcon type={type} size={iconSize} />
        </span>
        );
      })}
    </div>
  );
}

const ENERGY_APPEAR_KEYFRAMES = `
@keyframes energy-pip-appear {
  0% { opacity: 0; transform: translateY(6px) scale(0.78); filter: saturate(0.8); }
  55% { opacity: 1; transform: translateY(-2px) scale(1.08); filter: saturate(1.06); }
  100% { opacity: 1; transform: translateY(0) scale(1); filter: saturate(1); }
}
`;

function hpOverlayStyle(size: "sm" | "md" | "lg"): CSSProperties {
  return {
    position: "absolute",
    top: size === "lg" ? "2%" : size === "md" ? "1.1%" : "1.8%",
    right: size === "lg" ? "3%" : size === "md" ? "2.5%" : "14.5%",
    zIndex: 3,
    width: "fit-content",
    minWidth: size === "lg" ? "74px" : size === "md" ? "39px" : "32px",
    gap: size === "lg" ? 2 : 1,
    pointerEvents: "none",
  };
}

function hpDiffuseBlurStyle(size: "sm" | "md" | "lg"): CSSProperties {
  const inset = size === "lg" ? "-24px -30px -28px -34px" : size === "md" ? "-16px -20px -19px -23px" : "-13px -17px -16px -19px";
  const mask = "radial-gradient(ellipse at 70% 48%, rgba(0, 0, 0, 0.82) 0%, rgba(0, 0, 0, 0.52) 28%, rgba(0, 0, 0, 0.16) 47%, rgba(0, 0, 0, 0.04) 58%, transparent 68%)";
  const backdrop = size === "lg" ? "blur(10px) saturate(1.22)" : size === "md" ? "blur(8px) saturate(1.18)" : "blur(6px) saturate(1.14)";
  return {
    position: "absolute",
    inset,
    borderRadius: size === "lg" ? 14 : 10,
    background: "transparent",
    backdropFilter: backdrop,
    WebkitBackdropFilter: backdrop,
    WebkitMaskImage: mask,
    maskImage: mask,
  };
}

function hpContentStyle(size: "sm" | "md" | "lg"): CSSProperties {
  return {
    position: "relative",
    zIndex: 1,
    display: "grid",
    justifyItems: "end",
    gap: size === "sm" ? 2 : 5,
  };
}

function hpNumberStyle(size: "sm" | "md" | "lg"): CSSProperties {
  return {
    color: colors.white,
    fontSize: size === "lg" ? "clamp(34px, 13.2cqw, 52px)" : size === "md" ? "clamp(16px, 14.2cqw, 25px)" : "clamp(13px, 13.6cqw, 20px)",
    lineHeight: 0.86,
    fontWeight: 950,
    letterSpacing: 0,
    filter: "drop-shadow(0 3px 4px rgba(15, 23, 42, 0.4))",
    textShadow: [
      "0 0 2px rgba(15, 23, 42, 0.96)",
      "1.5px 1.5px 0 rgba(31, 41, 55, 0.9)",
      "-1.5px 1.5px 0 rgba(31, 41, 55, 0.9)",
      "1.5px -1.5px 0 rgba(31, 41, 55, 0.9)",
      "-1.5px -1.5px 0 rgba(31, 41, 55, 0.9)",
      "0 0 6px rgba(255, 255, 255, 0.42)",
      "0 7px 12px rgba(17, 24, 39, 0.4)",
    ].join(", "),
  };
}

function hpTrackStyle(size: "sm" | "md" | "lg"): CSSProperties {
  return {
    width: size === "lg" ? "92%" : "88%",
    height: size === "lg" ? "clamp(7px, 2.35cqw, 10px)" : size === "md" ? "clamp(4px, 2.3cqw, 6px)" : "clamp(3px, 2.1cqw, 5px)",
    marginTop: size === "sm" ? 2 : 0,
    overflow: "hidden",
    borderRadius: radius.pill,
    border: size === "lg" ? "2px solid rgba(15, 23, 42, 0.86)" : "1px solid rgba(15, 23, 42, 0.86)",
    background: "rgba(80, 88, 99, 0.88)",
    boxShadow: "0 2px 5px rgba(17, 24, 39, 0.38), inset 0 1px 1px rgba(255, 255, 255, 0.22), 0 0 0 1px rgba(15, 23, 42, 0.38)",
  };
}

const hpFillStyle: CSSProperties = {
  height: "100%",
  borderRadius: radius.pill,
  transition: `width ${transitions.slow}, background ${transitions.slow}`,
  boxShadow: "inset 0 1px 1px rgba(255, 255, 255, 0.42)",
};

function hiddenCardStyle(fontSize: number): CSSProperties {
  return {
    width: "100%",
    height: "100%",
    display: "grid",
    placeItems: "center",
    position: "relative",
    overflow: "hidden",
    borderRadius: radius.md,
    border: "1px solid rgba(23, 33, 28, 0.2)",
    background: "linear-gradient(180deg, #26312d 0%, #17211c 100%)",
    color: colors.white,
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

const umaCardImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: radius.md,
  objectFit: "contain",
  display: "block",
};

const printedHpCornerBlurStyle: CSSProperties = {
  position: "absolute",
  top: "2.8%",
  right: "4%",
  width: "38%",
  height: "25%",
  zIndex: 2,
  pointerEvents: "none",
  borderTopRightRadius: radius.md,
  background: "transparent",
  backdropFilter: "blur(30px) saturate(1.06)",
  WebkitMaskImage: "radial-gradient(ellipse at 88% 12%, rgba(0, 0, 0, 0.99) 0%, rgba(0, 0, 0, 0.95) 28%, rgba(0, 0, 0, 0.72) 48%, rgba(0, 0, 0, 0.44) 62%, rgba(0, 0, 0, 0.2) 74%, rgba(0, 0, 0, 0.08) 83%, transparent 91%)",
  maskImage: "radial-gradient(ellipse at 88% 12%, rgba(0, 0, 0, 0.99) 0%, rgba(0, 0, 0, 0.95) 28%, rgba(0, 0, 0, 0.72) 48%, rgba(0, 0, 0, 0.44) 62%, rgba(0, 0, 0, 0.2) 74%, rgba(0, 0, 0, 0.08) 83%, transparent 91%)",
};
