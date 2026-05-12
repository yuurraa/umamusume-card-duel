import { type CSSProperties, type DragEvent, useEffect, useRef, useState } from "react";
import { AttachedEnergyPips, CardHpOverlay, ENERGY_APPEAR_KEYFRAMES, FaceDownCard, KO_CRUMBLE_KEYFRAMES } from "../cards/UmaCard";
import { AbilityReadyBadge } from "../cards/AbilityReadyBadge";
import { AttachedToolBadge } from "../cards/AttachedToolBadge";
import { SpecialConditionBadges } from "../cards/SpecialConditionBadges";
import { HoloCardImage } from "../cards/HoloCardImage";
import { getAttachedEnergy } from "../cards/attachedEnergy";
import { applyDragPreview, hasTextDragPayload, readDragPayload, writeDragPayload } from "../drag/dragData";
import { getCard, getUmamusumeCard } from "../../game/engine";
import { MAX_BENCH } from "../../../../shared/src/gameData";
import type { EnergyType, UmamusumeInstance, SideState } from "../../../../shared/src/types";
import type { InspectTarget } from "../../inspect";
import { CARD_ASPECT_RATIO, borders, colors, radius, shadows, transitions, uiTextColor, uiTextShadow } from "../../styles/shared";

type BenchProps = {
  side: SideState;
  onInspect: (target: InspectTarget) => void;
  abilityReadyUmamusumeUids?: Set<number> | undefined;
  hidden?: boolean;
  hiddenBenchCount?: number;
  setupMode?: boolean;
  setupInteractionsEnabled?: boolean;
  selectableUmamusumeUids?: Set<number> | undefined;
  abilityEnergyTypes?: Set<EnergyType> | undefined;
  onUmamusumeSelect?: ((umamusume: UmamusumeInstance) => void) | undefined;
  onAttachedToolSelect?: ((umamusumeUid: number) => void) | undefined;
  onSetupDropBench?: ((handIndex: number) => void) | undefined;
  onSetupPromoteToActive?: ((handIndex: number) => void) | undefined;
  activeSetupHandIndex?: number | undefined;
  onHandCardDropOnBenchSlot?: ((handIndex: number) => void) | undefined;
  onHandCardDropOnUmamusume?: ((handIndex: number, umamusumeUid: number) => void) | undefined;
  onEnergyDropOnUmamusume?: ((umamusumeUid: number) => void) | undefined;
  setupDragHandIndexByUid?: Record<number, number>;
  hoverBorderColor?: string;
  hoverBackground?: string;
  hoverRingColor?: string;
  hoverGlowColor?: string;
  sleeveImage?: string | null | undefined;
  animateSetupReveal?: boolean;
  animateOnNewCards?: boolean;
  visualHpByUid?: Record<number, number> | undefined;
  visualAttachedEnergyByUid?: Record<number, EnergyType[]> | undefined;
  koAnimatingUids?: Set<number> | undefined;
};

const slotStyle: CSSProperties = {
  width: "var(--board-bench-width)",
  height: "var(--board-bench-card-height)",
  display: "grid",
  gridTemplateRows: "var(--board-bench-card-height)",
  overflow: "visible",
};

export function Bench({
  side,
  onInspect,
  abilityReadyUmamusumeUids,
  hidden = false,
  hiddenBenchCount,
  setupMode = false,
  setupInteractionsEnabled = true,
  selectableUmamusumeUids,
  abilityEnergyTypes,
  onUmamusumeSelect,
  onAttachedToolSelect,
  onSetupDropBench,
  onSetupPromoteToActive,
  activeSetupHandIndex,
  onHandCardDropOnBenchSlot,
  onHandCardDropOnUmamusume,
  onEnergyDropOnUmamusume,
  setupDragHandIndexByUid = {},
  hoverBorderColor = "rgba(196, 125, 164, 0.6)",
  hoverBackground = "rgba(196, 125, 164, 0.12)",
  hoverRingColor = "rgba(196, 125, 164, 0.26)",
  hoverGlowColor = "rgba(196, 125, 164, 0.32)",
  sleeveImage = null,
  animateSetupReveal = false,
  animateOnNewCards = false,
  visualHpByUid,
  visualAttachedEnergyByUid,
  koAnimatingUids,
}: BenchProps) {
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [playedBenchRevealOrderByUid, setPlayedBenchRevealOrderByUid] = useState<Record<number, number>>({});
  const [benchShiftOffsetByUid, setBenchShiftOffsetByUid] = useState<Record<number, number>>({});
  const revealClearTimeoutRef = useRef<number | null>(null);
  const shiftClearTimeoutRef = useRef<number | null>(null);
  const shiftAnimationFrameRef = useRef<number | null>(null);
  const previousBenchUidsRef = useRef<Set<number>>(new Set(side.bench.map((umamusume) => umamusume.uid)));
  const previousActiveUidRef = useRef<number | null>(side.active?.uid ?? null);
  const previousBenchOrderRef = useRef<number[]>(side.bench.map((umamusume) => umamusume.uid));
  const wasAnimateOnNewCardsRef = useRef(animateOnNewCards);
  const isChoosingUmamusume = Boolean(selectableUmamusumeUids);
  const visibleBenchCount = hidden ? (hiddenBenchCount ?? side.bench.length) : side.bench.length;

  useEffect(() => {
    if (!animateOnNewCards) {
      wasAnimateOnNewCardsRef.current = false;
      previousBenchUidsRef.current = new Set(side.bench.map((umamusume) => umamusume.uid));
      previousActiveUidRef.current = side.active?.uid ?? null;
      return;
    }
    if (!wasAnimateOnNewCardsRef.current) {
      wasAnimateOnNewCardsRef.current = true;
      previousBenchUidsRef.current = new Set(side.bench.map((umamusume) => umamusume.uid));
      previousActiveUidRef.current = side.active?.uid ?? null;
      return;
    }

    const currentBenchUids = side.bench.map((umamusume) => umamusume.uid);
    const previousBenchUids = previousBenchUidsRef.current;
    const previousActiveUid = previousActiveUidRef.current;
    const newlyBenchedUids = currentBenchUids.filter((uid) => !previousBenchUids.has(uid) && uid !== previousActiveUid);

    if (newlyBenchedUids.length > 0) {
      const revealOrderByUid = Object.fromEntries(newlyBenchedUids.map((uid, order) => [uid, order])) as Record<number, number>;
      setPlayedBenchRevealOrderByUid(revealOrderByUid);
      if (revealClearTimeoutRef.current !== null) window.clearTimeout(revealClearTimeoutRef.current);
      revealClearTimeoutRef.current = window.setTimeout(() => {
        setPlayedBenchRevealOrderByUid({});
        revealClearTimeoutRef.current = null;
      }, 1100);
    }

    previousBenchUidsRef.current = new Set(currentBenchUids);
    previousActiveUidRef.current = side.active?.uid ?? null;
  }, [animateOnNewCards, side.active?.uid, side.bench]);

  useEffect(() => () => {
    if (revealClearTimeoutRef.current !== null) window.clearTimeout(revealClearTimeoutRef.current);
    if (shiftClearTimeoutRef.current !== null) window.clearTimeout(shiftClearTimeoutRef.current);
    if (shiftAnimationFrameRef.current !== null) window.cancelAnimationFrame(shiftAnimationFrameRef.current);
  }, []);

  useEffect(() => {
    const currentBenchOrder = side.bench.map((umamusume) => umamusume.uid);
    const previousBenchOrder = previousBenchOrderRef.current;

    if (!hidden && !setupMode) {
      const shiftedOffsets = currentBenchOrder.reduce<Record<number, number>>((offsets, uid, newIndex) => {
        const previousIndex = previousBenchOrder.indexOf(uid);
        if (previousIndex > newIndex) offsets[uid] = (previousIndex - newIndex) * 200;
        return offsets;
      }, {});

      if (Object.keys(shiftedOffsets).length > 0) {
        setBenchShiftOffsetByUid(shiftedOffsets);
        if (shiftAnimationFrameRef.current !== null) window.cancelAnimationFrame(shiftAnimationFrameRef.current);
        shiftAnimationFrameRef.current = window.requestAnimationFrame(() => {
          shiftAnimationFrameRef.current = window.requestAnimationFrame(() => {
            setBenchShiftOffsetByUid((current) => {
              const next = { ...current };
              Object.keys(shiftedOffsets).forEach((uid) => { next[Number(uid)] = 0; });
              return next;
            });
            shiftAnimationFrameRef.current = null;
          });
        });
        if (shiftClearTimeoutRef.current !== null) window.clearTimeout(shiftClearTimeoutRef.current);
        shiftClearTimeoutRef.current = window.setTimeout(() => {
          setBenchShiftOffsetByUid((current) => {
            const next = { ...current };
            Object.keys(shiftedOffsets).forEach((uid) => { delete next[Number(uid)]; });
            return next;
          });
          shiftClearTimeoutRef.current = null;
        }, 360);
      }
    }

    previousBenchOrderRef.current = currentBenchOrder;
  }, [hidden, setupMode, side.bench]);

  return (
    <div style={{ position: "relative", display: "grid", gridTemplateRows: `repeat(${MAX_BENCH}, var(--board-bench-slot-height))`, gap: "var(--board-bench-gap)", overflow: "visible" }}>
      {Array.from({ length: MAX_BENCH }, (_, index) => {
        if (hidden && index < visibleBenchCount) {
          return (
            <div
              key={`bench-hidden-${index}`}
              style={{
                ...slotStyle,
                animation: animateSetupReveal ? `setup-reveal-slide-up 320ms cubic-bezier(0.2, 0.8, 0.2, 1) ${180 + index * 120}ms both` : undefined,
              }}
            >
              <div style={hiddenBenchCardWrapStyle}>
                <div style={hiddenBenchCardFrameStyle}>
                  <FaceDownCard sleeveImage={sleeveImage} />
                </div>
              </div>
            </div>
          );
        }
        const umamusume = side.bench[index];
        if (!umamusume) {
          return (
            <div key={`bench-empty-${index}`} style={slotStyle}>
              <div
                style={{
                  display: "grid",
                  placeItems: "center",
                  border: hoveredSlot === index ? `2px solid ${hoverBorderColor}` : "2px dashed rgba(226, 232, 240, 0.68)",
                  borderRadius: radius.md,
                  background: hoveredSlot === index ? hoverBackground : "rgba(226, 232, 240, 0.1)",
                  color: uiTextColor,
                  textShadow: uiTextShadow,
                  fontSize: "clamp(10px, 0.625vw, 12px)",
                  fontWeight: 900,
                  boxShadow: hoveredSlot === index ? `0 0 0 4px ${hoverRingColor}, 0 0 22px ${hoverGlowColor}` : shadows.none,
                  transition: `border-color ${transitions.fast}, background ${transitions.fast}, box-shadow ${transitions.fast}`,
                  position: "relative",
                  justifySelf: "center",
                  height: "100%",
                  width: "auto",
                  aspectRatio: CARD_ASPECT_RATIO,
                }}
                onDragOver={(event) => {
                  if (setupMode) {
                    if (!setupInteractionsEnabled || !onSetupDropBench || !hasTextDragPayload(event)) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setHoveredSlot(index);
                    return;
                  }
                  if (!onHandCardDropOnBenchSlot || !hasTextDragPayload(event)) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setHoveredSlot(index);
                }}
                onDragEnter={(event) => {
                  if (setupMode) {
                    if (!setupInteractionsEnabled || !onSetupDropBench || !hasTextDragPayload(event)) return;
                  } else if (!onHandCardDropOnBenchSlot || !hasTextDragPayload(event)) {
                    return;
                  }
                  setHoveredSlot(index);
                }}
                onDragLeave={() => setHoveredSlot((current) => (current === index ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  setHoveredSlot(null);
                  if (setupMode) {
                    if (!setupInteractionsEnabled || !onSetupDropBench) return;
                    const payload = readDragPayload(event.dataTransfer);
                    if (payload?.kind !== "setup-hand") return;
                    onSetupDropBench(payload.handIndex);
                    return;
                  }
                  if (!onHandCardDropOnBenchSlot) return;
                  const payload = readDragPayload(event.dataTransfer);
                  if (payload?.kind !== "hand-card") return;
                  onHandCardDropOnBenchSlot(payload.handIndex);
                }}
              >
                Bench
              </div>
              <div />
            </div>
          );
        }

        const card = getUmamusumeCard(umamusume);
        return (
          <BenchSlot
            key={`bench-umamusume-${umamusume.uid}`}
            card={card}
            umamusume={umamusume}
            side={side}
            hidden={hidden}
            setupMode={setupMode}
            setupInteractionsEnabled={setupInteractionsEnabled}
            activeSetupHandIndex={activeSetupHandIndex}
            setupDragHandIndex={setupDragHandIndexByUid[umamusume.uid]}
            onSetupPromoteToActive={onSetupPromoteToActive}
            onHandCardDropOnUmamusume={onHandCardDropOnUmamusume}
            onEnergyDropOnUmamusume={onEnergyDropOnUmamusume}
            abilityReady={Boolean(abilityReadyUmamusumeUids?.has(umamusume.uid))}
            hoverBorderColor={hoverBorderColor}
            hoverBackground={hoverBackground}
            hoverRingColor={hoverRingColor}
            hoverGlowColor={hoverGlowColor}
            isSelectable={Boolean(selectableUmamusumeUids?.has(umamusume.uid))}
            isDimmed={isChoosingUmamusume && !selectableUmamusumeUids?.has(umamusume.uid)}
            abilityEnergyTypes={abilityEnergyTypes}
            sleeveImage={sleeveImage}
            visualHpByUid={visualHpByUid}
            displayAttachedEnergiesOverride={visualAttachedEnergyByUid?.[umamusume.uid]}
            koCrumbling={Boolean(koAnimatingUids?.has(umamusume.uid))}
            revealOrder={animateSetupReveal ? index : playedBenchRevealOrderByUid[umamusume.uid]}
            shiftOffset={benchShiftOffsetByUid[umamusume.uid]}
            onInspect={onInspect}
            onUmamusumeSelect={onUmamusumeSelect}
            onAttachedToolSelect={onAttachedToolSelect}
          />
        );
      })}
    </div>
  );
}

function BenchSlot({ card, umamusume, side, hidden, setupMode, setupInteractionsEnabled, activeSetupHandIndex, setupDragHandIndex, onSetupPromoteToActive, onHandCardDropOnUmamusume, onEnergyDropOnUmamusume, abilityReady, hoverBorderColor, hoverBackground, hoverRingColor, hoverGlowColor, isSelectable, isDimmed, abilityEnergyTypes, sleeveImage, visualHpByUid, displayAttachedEnergiesOverride, koCrumbling, revealOrder, shiftOffset, onInspect, onUmamusumeSelect, onAttachedToolSelect }: { card: ReturnType<typeof getUmamusumeCard>; umamusume: UmamusumeInstance; side: SideState; hidden: boolean; setupMode: boolean; setupInteractionsEnabled: boolean; activeSetupHandIndex: number | undefined; setupDragHandIndex: number | undefined; onSetupPromoteToActive?: ((handIndex: number) => void) | undefined; onHandCardDropOnUmamusume?: ((handIndex: number, umamusumeUid: number) => void) | undefined; onEnergyDropOnUmamusume?: ((umamusumeUid: number) => void) | undefined; abilityReady: boolean; hoverBorderColor: string; hoverBackground: string; hoverRingColor: string; hoverGlowColor: string; isSelectable: boolean; isDimmed: boolean; abilityEnergyTypes?: Set<EnergyType> | undefined; sleeveImage?: string | null | undefined; visualHpByUid?: Record<number, number> | undefined; displayAttachedEnergiesOverride?: EnergyType[] | undefined; koCrumbling?: boolean | undefined; revealOrder?: number | undefined; shiftOffset?: number | undefined; onInspect: (target: InspectTarget) => void; onUmamusumeSelect?: ((umamusume: UmamusumeInstance) => void) | undefined; onAttachedToolSelect?: ((umamusumeUid: number) => void) | undefined }) {
  const [hovered, setHovered] = useState(false);
  const [dropHovered, setDropHovered] = useState(false);
  const activeHover = hovered && !isDimmed;
  return (
    <div
      style={{
        ...slotStyle,
        position: "relative",
        transform: shiftOffset !== undefined ? `translateY(${shiftOffset}px)` : undefined,
        transition: shiftOffset !== undefined ? `transform 280ms ${transitions.spring}` : undefined,
      }}
    >
      <div style={benchSlotBackdropStyle} aria-hidden="true" />
      <button
        type="button"
        data-battle-effect-card={umamusume.uid}
        style={{
          position: "relative",
          height: "var(--board-bench-card-height)",
          width: "auto",
          aspectRatio: CARD_ASPECT_RATIO,
          containerType: "inline-size",
          justifySelf: "center",
          zIndex: 1,
          padding: 0,
          border: dropHovered ? `2px solid ${hoverBorderColor}` : 0,
          borderRadius: radius.md,
          background: dropHovered ? hoverBackground : "transparent",
          cursor: "pointer",
          opacity: isDimmed ? 0.45 : 1,
          overflow: "visible",
          filter: activeHover ? "drop-shadow(0 18px 24px rgba(17, 24, 39, 0.22)) saturate(1.06)" : "drop-shadow(0 14px 18px rgba(17, 24, 39, 0.18))",
          transform: activeHover ? "translateY(-6px) rotate(0.8deg) scale(1.035)" : "translateY(0) rotate(0deg) scale(1)",
          willChange: koCrumbling ? "transform, opacity, filter" : undefined,
          animation: koCrumbling
            ? "uma-ko-dissolve 860ms cubic-bezier(0.2, 0.72, 0.2, 1) both"
            : revealOrder !== undefined
              ? `setup-reveal-slide-up 320ms ${transitions.spring} ${revealOrder * 120}ms both`
              : undefined,
          boxShadow: dropHovered ? `0 0 0 4px ${hoverRingColor}, 0 0 24px ${hoverGlowColor}` : shadows.none,
          transition: `opacity ${transitions.board}, transform ${transitions.board}, filter ${transitions.board}, box-shadow ${transitions.fast}, border-color ${transitions.fast}`,
        }}
        onMouseEnter={() => {
          if (!isDimmed) setHovered(true);
        }}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => {
          if (!isDimmed) setHovered(true);
        }}
        onBlur={() => setHovered(false)}
        draggable={setupMode && setupInteractionsEnabled && setupDragHandIndex !== undefined && !hidden}
        onDragStart={(event) => {
          if (!setupMode || !setupInteractionsEnabled || setupDragHandIndex === undefined || hidden) return;
          event.dataTransfer.effectAllowed = "move";
          writeDragPayload(event.dataTransfer, { kind: "setup-hand", handIndex: setupDragHandIndex });
          applyDragPreview(event, { width: 184, height: 258 });
        }}
        onDragOver={(event) => {
          if (hidden) return;
          if (setupMode) {
            if (!setupInteractionsEnabled || activeSetupHandIndex === undefined || setupDragHandIndex === undefined) return;
            if (!hasTextDragPayload(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropHovered(true);
            return;
          }
          if (!hasTextDragPayload(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDropHovered(true);
        }}
        onDragEnter={(event) => {
          if (hidden) return;
          if (setupMode) {
            if (!setupInteractionsEnabled || activeSetupHandIndex === undefined || setupDragHandIndex === undefined) return;
            if (!hasTextDragPayload(event)) return;
          } else if (!hasTextDragPayload(event)) {
            return;
          }
          setDropHovered(true);
        }}
        onDragLeave={() => setDropHovered(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDropHovered(false);
          if (hidden) return;
          if (setupMode) {
            if (!setupInteractionsEnabled || activeSetupHandIndex === undefined || setupDragHandIndex === undefined || !onSetupPromoteToActive) return;
            const payload = readDragPayload(event.dataTransfer);
            if (payload?.kind !== "setup-hand" || payload.handIndex !== activeSetupHandIndex) return;
            onSetupPromoteToActive(setupDragHandIndex);
            return;
          }
          const payload = readDragPayload(event.dataTransfer);
          if (payload?.kind === "hand-card") {
            onHandCardDropOnUmamusume?.(payload.handIndex, umamusume.uid);
            return;
          }
          if (payload?.kind === "energy-token") {
            onEnergyDropOnUmamusume?.(umamusume.uid);
            return;
          }
        }}
        onClick={() => {
          if (hidden) return;
          if (isSelectable) {
            onUmamusumeSelect?.(umamusume);
            return;
          }
          onInspect({ card, umamusume, sideId: side.id, isActive: false });
        }}
        aria-label={`Inspect benched ${card.name}`}
      >
        <style>{ENERGY_APPEAR_KEYFRAMES}</style>
        <style>{KO_CRUMBLE_KEYFRAMES}</style>
        {hidden ? (
          <div style={hiddenBenchCardWrapStyle}>
            <div style={hiddenBenchCardFrameStyle}>
              <FaceDownCard sleeveImage={sleeveImage} />
            </div>
          </div>
        ) : (
          <>
            <HoloCardImage
              card={card}
              src={card.portrait}
              alt={card.name}
              imageStyle={benchCardImageStyle}
              draggable={false}
              shineVariant="compact"
              wrapperStyle={benchHoloImageWrapStyle}
            />
            <div style={benchHpCornerBlurStyle} aria-hidden="true" />
            <CardHpOverlay
              hp={visualHpByUid?.[umamusume.uid] ?? umamusume.hp}
              maxHp={umamusume.maxHp}
              size="sm"
              identityKey={`${umamusume.uid}:${umamusume.cardId}`}
              sourceKey={visualHpByUid?.[umamusume.uid] === undefined ? "state" : "visual"}
            />
            {abilityReady && <AbilityReadyBadge corner="topLeft" size="xs" nudgeX={14} />}
            <SpecialConditionBadges conditions={umamusume.specialConditions} size="sm" />
            <AttachedToolBadge
              toolCardId={umamusume.toolCardId}
              size="sm"
              onInspect={(toolCardId) => {
                if (onAttachedToolSelect) {
                  onAttachedToolSelect(umamusume.uid);
                  return;
                }
                const tool = getCard(toolCardId);
                if (tool.kind === "trainer") onInspect({ card: tool });
              }}
            />
            <AttachedEnergyPips energies={displayAttachedEnergiesOverride ?? getAttachedEnergy(umamusume)} draggableEnergyTypes={abilityEnergyTypes} sourceUmamusumeUid={umamusume.uid} />
          </>
        )}
      </button>
    </div>
  );
}

const hiddenBenchCardWrapStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
};

const hiddenBenchCardFrameStyle: CSSProperties = {
  height: "100%",
  width: "auto",
  aspectRatio: CARD_ASPECT_RATIO,
};

const benchSlotBackdropStyle: CSSProperties = {
  position: "absolute",
  top: "-1%",
  bottom: "-1%",
  left: "14.5%",
  right: "14.5%",
  borderRadius: radius.md,
  border: "2px dashed rgba(226, 232, 240, 0.68)",
  background: "rgba(226, 232, 240, 0.1)",
  boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.14)",
  pointerEvents: "none",
};

const benchCardImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: radius.md,
  objectFit: "contain",
  display: "block",
};

const benchHoloImageWrapStyle: CSSProperties = {
  width: "auto",
  height: "100%",
  aspectRatio: CARD_ASPECT_RATIO,
  margin: "0 auto",
};

const benchHpCornerBlurStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  right: "14%",
  width: "29%",
  height: "15%",
  zIndex: 2,
  pointerEvents: "none",
  borderRadius: `0 ${radius.md}px 10px 14px`,
  background: "linear-gradient(135deg, rgba(248, 250, 252, 0.64) 0%, rgba(248, 250, 252, 0.46) 58%, rgba(248, 250, 252, 0) 100%)",
  backdropFilter: "blur(18px) saturate(0.9) brightness(1.08)",
  WebkitBackdropFilter: "blur(18px) saturate(0.9) brightness(1.08)",
  WebkitMaskImage: "linear-gradient(90deg, transparent 0%, rgba(0, 0, 0, 0.2) 24%, rgba(0, 0, 0, 0.85) 46%, black 100%), linear-gradient(180deg, black 0%, black 48%, rgba(0, 0, 0, 0.62) 72%, transparent 100%)",
  maskImage: "linear-gradient(90deg, transparent 0%, rgba(0, 0, 0, 0.2) 24%, rgba(0, 0, 0, 0.85) 46%, black 100%), linear-gradient(180deg, black 0%, black 48%, rgba(0, 0, 0, 0.62) 72%, transparent 100%)",
  WebkitMaskComposite: "source-in",
  maskComposite: "intersect",
};
