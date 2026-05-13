import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { EnergyIcon } from "./EnergyIcon";
import { AbilityReadyBadge } from "./AbilityReadyBadge";
import { AttachedToolBadge } from "./AttachedToolBadge";
import { SpecialConditionBadges } from "./SpecialConditionBadges";
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
  displayHpOverride?: number | undefined;
  displayAttachedEnergiesOverride?: EnergyType[] | undefined;
  koImpacting?: boolean;
  koCrumbling?: boolean;
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
  displayHpOverride,
  displayAttachedEnergiesOverride,
  koImpacting = false,
  koCrumbling = false,
}: UmaCardProps) {
  const [hovered, setHovered] = useState(false);
  const card = getUmamusumeCard(umamusume);
  const shadowColor = hidden ? "rgba(17, 24, 39, 0.24)" : alphaColor(typeAccentColors[card.type], 0.42);
  const activeHover = hovered && !hidden && !isDimmed;

  return (
    <button
      type="button"
      data-battle-effect-card={umamusume.uid}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 420,
        aspectRatio: CARD_ASPECT_RATIO,
        containerType: "inline-size",
        isolation: "isolate",
        padding: 0,
        border: 0,
        borderRadius: CARD_INSPECT_IMAGE_RADIUS,
        background: "transparent",
        overflow: "visible",
        cursor: "pointer",
        opacity: isDimmed ? 0.45 : 1,
        boxShadow: hidden ? `0 18px 28px ${shadowColor}` : activeHover ? `0 34px 52px ${shadowColor}` : `0 28px 42px ${shadowColor}`,
        transform: hidden ? "none" : activeHover ? "translateY(-10px) rotate(0.8deg) scale(1.025)" : "translateY(0) rotate(0deg) scale(1)",
        transformStyle: "flat",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        willChange: hidden ? undefined : koCrumbling || koImpacting ? "transform, opacity, filter" : "transform",
        animation: koCrumbling
          ? "uma-ko-dissolve 860ms cubic-bezier(0.2, 0.72, 0.2, 1) both"
          : koImpacting
            ? "uma-ko-impact 1360ms cubic-bezier(0.2, 0.8, 0.2, 1) both"
            : undefined,
        transition: `opacity ${transitions.board}, transform ${transitions.slow}, box-shadow ${transitions.slow}`,
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
      <style>{ENERGY_APPEAR_KEYFRAMES}</style>
      <style>{KO_CRUMBLE_KEYFRAMES}</style>
      {hidden ? (
        <FaceDownCard sleeveImage={sleeveImage} fontSize={18} />
      ) : (
        <>
          <div style={cardClippedFrameStyle(CARD_INSPECT_IMAGE_RADIUS)} aria-hidden="true">
            <HoloCardImage card={card} src={card.portrait} alt={card.name} imageStyle={umaCardImageStyle} radiusOverride={CARD_INSPECT_IMAGE_RADIUS} />
            <div style={cardHpCornerBlurStyle} aria-hidden="true" />
          </div>
          <CardHpOverlay
            hp={displayHpOverride ?? umamusume.hp}
            maxHp={umamusume.maxHp}
            size="lg"
            identityKey={`${umamusume.uid}:${umamusume.cardId}`}
            sourceKey={displayHpOverride === undefined ? "state" : "visual"}
          />
          {abilityReady && <AbilityReadyBadge corner="topLeft" />}
          <SpecialConditionBadges conditions={umamusume.specialConditions} size="md" />
          <AttachedToolBadge toolCardId={umamusume.toolCardId} onInspect={onToolInspect} />
          <AttachedEnergyPips energies={displayAttachedEnergiesOverride ?? getAttachedEnergy(umamusume)} size="lg" />
        </>
      )}
    </button>
  );
}

export function CardHpOverlay({
  hp,
  maxHp,
  size = "md",
  identityKey,
  sourceKey = "state",
}: {
  hp: number;
  maxHp: number;
  size?: "sm" | "md" | "lg";
  identityKey?: string | number | undefined;
  sourceKey?: string | number | undefined;
}) {
  const previousHpRef = useRef(hp);
  const previousIdentityRef = useRef(identityKey);
  const previousSourceRef = useRef(sourceKey);
  const clearDeltaTimeoutRef = useRef<number | null>(null);
  const [hpDelta, setHpDelta] = useState<number | null>(null);
  const percent = maxHp > 0 ? Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100))) : 0;
  const fillColor = percent <= 25 ? "#f59e0b" : percent <= 50 ? "#facc15" : "#29e6bd";

  useLayoutEffect(() => {
    if (previousIdentityRef.current !== identityKey || previousSourceRef.current !== sourceKey) {
      previousIdentityRef.current = identityKey;
      previousSourceRef.current = sourceKey;
      previousHpRef.current = hp;
      setHpDelta(null);
      if (clearDeltaTimeoutRef.current !== null) {
        window.clearTimeout(clearDeltaTimeoutRef.current);
        clearDeltaTimeoutRef.current = null;
      }
      return;
    }
    const previousHp = previousHpRef.current;
    previousHpRef.current = hp;
    if (previousHp === hp) return;
    setHpDelta(hp - previousHp);
    if (clearDeltaTimeoutRef.current !== null) window.clearTimeout(clearDeltaTimeoutRef.current);
    clearDeltaTimeoutRef.current = window.setTimeout(() => {
      setHpDelta(null);
      clearDeltaTimeoutRef.current = null;
    }, 760);
  }, [hp, identityKey, sourceKey]);

  useEffect(() => () => {
    if (clearDeltaTimeoutRef.current !== null) window.clearTimeout(clearDeltaTimeoutRef.current);
  }, []);

  return (
    <div style={hpOverlayStyle(size)} aria-label={`${hp} of ${maxHp} HP`}>
      <style>{HP_DELTA_KEYFRAMES}</style>
      <div style={hpContentStyle(size)}>
        <div
          key={`${hp}-${maxHp}`}
          style={{
            ...hpNumberStyle(size),
            animation: hpDelta !== null ? `hp-number-tick 300ms ${transitions.spring} both` : undefined,
          }}
        >
          {hp}
          {hpDelta !== null && hpDelta < 0 && <span style={hpStrikeStyle(size)} />}
        </div>
        <div style={hpTrackStyle(size)}>
          <div
            style={{
              ...hpFillStyle,
              width: `${percent}%`,
              background: fillColor,
              animation: hpDelta !== null ? `hp-fill-${hpDelta > 0 ? "gain" : "loss"} 520ms ease both` : undefined,
            }}
          />
        </div>
      </div>
      {hpDelta !== null && hpDelta !== 0 && (
        <span style={hpDeltaBadgeStyle(size, hpDelta)}>
          {hpDelta > 0 ? `+${hpDelta}` : hpDelta}
        </span>
      )}
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

export const ENERGY_APPEAR_KEYFRAMES = `
@keyframes energy-pip-appear {
  0% { opacity: 0; transform: translateY(6px) scale(0.78); filter: saturate(0.8); }
  55% { opacity: 1; transform: translateY(-2px) scale(1.08); filter: saturate(1.06); }
  100% { opacity: 1; transform: translateY(0) scale(1); filter: saturate(1); }
}
`;

export const KO_CRUMBLE_KEYFRAMES = `
@keyframes uma-ko-impact {
  0% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); filter: brightness(1) saturate(1); }
  12% { transform: translate3d(-1.4%, -0.8%, 0) rotate(-1.8deg) scale(1.018); filter: brightness(1.1) saturate(1.04); }
  24% { transform: translate3d(1.2%, 0.6%, 0) rotate(1.25deg) scale(1.01); filter: brightness(1.04) saturate(1.02); }
  40% { transform: translate3d(-0.6%, 0, 0) rotate(-0.65deg) scale(1.004); filter: brightness(1) saturate(1); }
  62% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); filter: brightness(1) saturate(1); }
  100% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); filter: brightness(1) saturate(1); }
}

@keyframes uma-ko-dissolve {
  0% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
    filter: grayscale(0) brightness(1) saturate(1) blur(0);
  }
  24% {
    opacity: 1;
    transform: translate3d(0, -2.5%, 0) scale(1.018);
    filter: grayscale(0) brightness(1.08) saturate(1) blur(0);
  }
  52% {
    opacity: 0.72;
    transform: translate3d(0, -1%, 0) scale(0.985);
    filter: grayscale(0.82) brightness(1.02) saturate(0.5) blur(1.2px);
  }
  76% {
    opacity: 0.32;
    transform: translate3d(0, 1.5%, 0) scale(0.94);
    filter: grayscale(1) brightness(0.9) saturate(0.22) blur(2.4px);
  }
  100% {
    opacity: 0;
    transform: translate3d(0, 5%, 0) scale(0.86);
    filter: grayscale(1) brightness(0.72) saturate(0) blur(4px);
  }
}

@keyframes uma-ko-exit {
  0% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
    filter: grayscale(0) brightness(1) saturate(1) blur(0);
  }
  24% {
    opacity: 1;
    transform: translate3d(0, -2.5%, 0) scale(1.018);
    filter: grayscale(0) brightness(1.08) saturate(1) blur(0);
  }
  52% {
    opacity: 0.72;
    transform: translate3d(0, -1%, 0) scale(0.985);
    filter: grayscale(0.82) brightness(1.02) saturate(0.5) blur(1.2px);
  }
  76% {
    opacity: 0.32;
    transform: translate3d(0, 1.5%, 0) scale(0.94);
    filter: grayscale(1) brightness(0.9) saturate(0.22) blur(2.4px);
  }
  100% {
    opacity: 0;
    transform: translate3d(0, 5%, 0) scale(0.86);
    filter: grayscale(1) brightness(0.72) saturate(0) blur(4px);
  }
}

@keyframes uma-ko-crumble {
  0% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); filter: grayscale(0) brightness(1) saturate(1) blur(0); }
  24% { opacity: 1; transform: translate3d(0, -2.5%, 0) scale(1.018); filter: grayscale(0) brightness(1.08) saturate(1) blur(0); }
  52% { opacity: 0.72; transform: translate3d(0, -1%, 0) scale(0.985); filter: grayscale(0.82) brightness(1.02) saturate(0.5) blur(1.2px); }
  76% { opacity: 0.32; transform: translate3d(0, 1.5%, 0) scale(0.94); filter: grayscale(1) brightness(0.9) saturate(0.22) blur(2.4px); }
  100% { opacity: 0; transform: translate3d(0, 5%, 0) scale(0.86); filter: grayscale(1) brightness(0.72) saturate(0) blur(4px); }
}
`;

const HP_DELTA_KEYFRAMES = `
@keyframes hp-number-tick {
  0% { transform: translateY(0) scale(1); filter: brightness(1); }
  45% { transform: translateY(-2px) scale(1.08); filter: brightness(1.18); }
  100% { transform: translateY(0) scale(1); filter: brightness(1); }
}
@keyframes hp-fill-loss {
  0% { filter: brightness(1.4) saturate(1.25); }
  100% { filter: brightness(1) saturate(1); }
}
@keyframes hp-fill-gain {
  0% { filter: brightness(1.45) saturate(1.2); box-shadow: 0 0 12px rgba(34, 197, 94, 0.75), inset 0 1px 1px rgba(255, 255, 255, 0.42); }
  100% { filter: brightness(1) saturate(1); box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.42); }
}
@keyframes hp-delta-float {
  0% { opacity: 0; transform: translate(10px, 10px) scale(0.72); }
  16% { opacity: 1; transform: translate(0, -3px) scale(1.14); }
  56% { opacity: 1; transform: translate(0, -8px) scale(1); }
  100% { opacity: 0; transform: translate(0, -36px) scale(0.94); }
}
@keyframes hp-damage-strike {
  0% { opacity: 0; transform: scaleX(0) rotate(-9deg); }
  24% { opacity: 1; transform: scaleX(1) rotate(-9deg); }
  70% { opacity: 1; transform: scaleX(1) rotate(-9deg); }
  100% { opacity: 0; transform: scaleX(0.96) rotate(-9deg); }
}
`;

function hpOverlayStyle(size: "sm" | "md" | "lg"): CSSProperties {
  return {
    position: "absolute",
    top: size === "lg" ? "2%" : size === "md" ? "1.1%" : "1.8%",
    right: size === "lg" ? "3%" : size === "md" ? "2.5%" : "3.5%",
    zIndex: 3,
    width: size === "lg" ? "86px" : size === "md" ? "48px" : "28px",
    gap: size === "lg" ? 2 : 1,
    pointerEvents: "none",
    overflow: "visible",
  };
}

function hpContentStyle(size: "sm" | "md" | "lg"): CSSProperties {
  return {
    position: "relative",
    zIndex: 1,
    display: "grid",
    width: "100%",
    justifyItems: "end",
    gap: size === "sm" ? 2 : 5,
  };
}

function hpNumberStyle(size: "sm" | "md" | "lg"): CSSProperties {
  return {
    position: "relative",
    width: "100%",
    textAlign: "right",
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
    width: "100%",
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

function hpDeltaBadgeStyle(size: "sm" | "md" | "lg", delta: number): CSSProperties {
  const isGain = delta > 0;
  return {
    position: "absolute",
    top: size === "lg" ? -30 : size === "md" ? -22 : -19,
    right: size === "lg" ? -8 : size === "md" ? -8 : -6,
    minWidth: size === "lg" ? 62 : 42,
    padding: size === "lg" ? "7px 10px" : "4px 7px",
    borderRadius: radius.pill,
    border: "2px solid rgba(255, 255, 255, 0.7)",
    background: isGain
      ? "linear-gradient(135deg, #22c55e 0%, #bbf7d0 100%)"
      : "linear-gradient(135deg, #f43f5e 0%, #fb923c 100%)",
    color: isGain ? "#052e16" : colors.white,
    textAlign: "center",
    fontSize: size === "lg" ? 24 : size === "md" ? 15 : 12,
    lineHeight: 1,
    fontWeight: 950,
    letterSpacing: 0,
    textShadow: isGain ? "none" : "0 2px 5px rgba(15, 23, 42, 0.48)",
    boxShadow: isGain ? "0 10px 22px rgba(34, 197, 94, 0.34)" : "0 10px 22px rgba(244, 63, 94, 0.42)",
    animation: "hp-delta-float 760ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
    whiteSpace: "nowrap",
    zIndex: 4,
  };
}

function hpStrikeStyle(size: "sm" | "md" | "lg"): CSSProperties {
  return {
    position: "absolute",
    left: size === "lg" ? "-6%" : "-4%",
    right: size === "lg" ? "-10%" : "-8%",
    top: "52%",
    height: size === "lg" ? 7 : size === "md" ? 4 : 3,
    borderRadius: radius.pill,
    background: "linear-gradient(90deg, transparent 0%, #fef2f2 10%, #ef4444 46%, #fb923c 78%, transparent 100%)",
    boxShadow: "0 0 12px rgba(239, 68, 68, 0.75), 0 2px 4px rgba(15, 23, 42, 0.35)",
    transformOrigin: "left center",
    animation: "hp-damage-strike 520ms cubic-bezier(0.18, 0.8, 0.22, 1) both",
    pointerEvents: "none",
  };
}

function hiddenCardStyle(fontSize: number): CSSProperties {
  return {
    width: "99.3%",
    height: "99.4%",
    display: "grid",
    placeItems: "center",
    position: "relative",
    overflow: "hidden",
    borderRadius: radius.xl,
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
  borderRadius: radius.xl,
};

const umaCardImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: radius.md,
  objectFit: "contain",
  display: "block",
};

const cardHpCornerBlurStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  width: "38%",
  height: "15%",
  zIndex: 2,
  pointerEvents: "none",
  borderRadius: `0 ${radius.xl + 8}px 32px 40px`,
  background: "linear-gradient(135deg, rgba(248, 250, 252, 0.9) 0%, rgba(248, 250, 252, 0.8) 48%, rgba(248, 250, 252, 0.5) 72%, rgba(248, 250, 252, 0) 100%)",
  backdropFilter: "blur(72px) saturate(0.78) brightness(1.16)",
  WebkitBackdropFilter: "blur(72px) saturate(0.78) brightness(1.16)",
  WebkitMaskImage: "linear-gradient(90deg, transparent 0%, rgba(0, 0, 0, 0.18) 20%, rgba(0, 0, 0, 0.86) 40%, black 100%), linear-gradient(180deg, black 0%, black 44%, rgba(0, 0, 0, 0.76) 64%, rgba(0, 0, 0, 0.22) 84%, transparent 100%)",
  maskImage: "linear-gradient(90deg, transparent 0%, rgba(0, 0, 0, 0.18) 20%, rgba(0, 0, 0, 0.86) 40%, black 100%), linear-gradient(180deg, black 0%, black 44%, rgba(0, 0, 0, 0.76) 64%, rgba(0, 0, 0, 0.22) 84%, transparent 100%)",
  WebkitMaskComposite: "source-in",
  maskComposite: "intersect",
};

function cardClippedFrameStyle(borderRadius: number): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    overflow: "hidden",
    borderRadius,
    zIndex: 0,
  };
}
