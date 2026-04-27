import { type CSSProperties, type DragEvent, useEffect, useRef, useState } from "react";
import { AttachedEnergyPips, CardHpOverlay, FaceDownCard } from "../cards/UmaCard";
import { AbilityReadyBadge } from "../cards/AbilityReadyBadge";
import { AttachedToolBadge } from "../cards/AttachedToolBadge";
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
  selectableUmamusumeUids?: Set<number> | undefined;
  abilityEnergyTypes?: Set<EnergyType> | undefined;
  onUmamusumeSelect?: ((umamusume: UmamusumeInstance) => void) | undefined;
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
  setupRevealToken?: number;
  animateOnNewCards?: boolean;
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
  selectableUmamusumeUids,
  abilityEnergyTypes,
  onUmamusumeSelect,
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
  setupRevealToken = 0,
  animateOnNewCards = false,
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
  const isChoosingUmamusume = Boolean(selectableUmamusumeUids);
  const visibleBenchCount = hidden ? (hiddenBenchCount ?? side.bench.length) : side.bench.length;

  useEffect(() => {
    if (!animateOnNewCards) {
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
              key={`bench-hidden-${index}-${animateSetupReveal ? setupRevealToken : 0}`}
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
                  border: hoveredSlot === index ? `2px solid ${hoverBorderColor}` : borders.neutralDashed,
                  borderRadius: radius.md,
                  background: hoveredSlot === index ? hoverBackground : colors.glassSoft,
                  color: uiTextColor,
                  textShadow: uiTextShadow,
                  fontSize: "clamp(10px, 0.625vw, 12px)",
                  fontWeight: 900,
                  boxShadow: hoveredSlot === index ? `0 0 0 4px ${hoverRingColor}, 0 0 22px ${hoverGlowColor}` : shadows.none,
                  transition: `border-color ${transitions.fast}, background ${transitions.fast}, box-shadow ${transitions.fast}`,
                }}
                onDragOver={(event) => {
                  if (setupMode) {
                    if (!onSetupDropBench || !hasTextDragPayload(event)) return;
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
                    if (!onSetupDropBench || !hasTextDragPayload(event)) return;
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
                    if (!onSetupDropBench) return;
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
            key={`bench-umamusume-${umamusume.uid}-${animateSetupReveal ? setupRevealToken : 0}`}
            card={card}
            umamusume={umamusume}
            side={side}
            hidden={hidden}
            setupMode={setupMode}
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
            revealOrder={animateSetupReveal ? index : playedBenchRevealOrderByUid[umamusume.uid]}
            shiftOffset={benchShiftOffsetByUid[umamusume.uid]}
            onInspect={onInspect}
            onUmamusumeSelect={onUmamusumeSelect}
          />
        );
      })}
    </div>
  );
}

function BenchSlot({ card, umamusume, side, hidden, setupMode, activeSetupHandIndex, setupDragHandIndex, onSetupPromoteToActive, onHandCardDropOnUmamusume, onEnergyDropOnUmamusume, abilityReady, hoverBorderColor, hoverBackground, hoverRingColor, hoverGlowColor, isSelectable, isDimmed, abilityEnergyTypes, sleeveImage, revealOrder, shiftOffset, onInspect, onUmamusumeSelect }: { card: ReturnType<typeof getUmamusumeCard>; umamusume: UmamusumeInstance; side: SideState; hidden: boolean; setupMode: boolean; activeSetupHandIndex: number | undefined; setupDragHandIndex: number | undefined; onSetupPromoteToActive?: ((handIndex: number) => void) | undefined; onHandCardDropOnUmamusume?: ((handIndex: number, umamusumeUid: number) => void) | undefined; onEnergyDropOnUmamusume?: ((umamusumeUid: number) => void) | undefined; abilityReady: boolean; hoverBorderColor: string; hoverBackground: string; hoverRingColor: string; hoverGlowColor: string; isSelectable: boolean; isDimmed: boolean; abilityEnergyTypes?: Set<EnergyType> | undefined; sleeveImage?: string | null | undefined; revealOrder?: number | undefined; shiftOffset?: number | undefined; onInspect: (target: InspectTarget) => void; onUmamusumeSelect?: ((umamusume: UmamusumeInstance) => void) | undefined }) {
  const [hovered, setHovered] = useState(false);
  const [dropHovered, setDropHovered] = useState(false);
  const activeHover = hovered && !isDimmed;
  return (
    <div
      style={{
        ...slotStyle,
        transform: shiftOffset !== undefined ? `translateY(${shiftOffset}px)` : undefined,
        transition: shiftOffset !== undefined ? `transform 280ms ${transitions.spring}` : undefined,
        animation: revealOrder !== undefined ? `setup-reveal-slide-up 320ms ${transitions.spring} ${revealOrder * 120}ms both` : undefined,
      }}
    >
      <button
        type="button"
        style={{
          position: "relative",
          height: "var(--board-bench-card-height)",
          width: "100%",
          containerType: "inline-size",
          padding: 0,
          border: dropHovered ? `2px solid ${hoverBorderColor}` : 0,
          borderRadius: radius.md,
          background: dropHovered ? hoverBackground : "transparent",
          cursor: "pointer",
          opacity: isDimmed ? 0.45 : 1,
          overflow: "visible",
          filter: activeHover ? "drop-shadow(0 18px 24px rgba(17, 24, 39, 0.22)) saturate(1.06)" : "drop-shadow(0 14px 18px rgba(17, 24, 39, 0.18))",
          transform: activeHover ? "translateY(-6px) rotate(0.8deg) scale(1.035)" : "translateY(0) rotate(0deg) scale(1)",
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
        draggable={setupMode && setupDragHandIndex !== undefined && !hidden}
        onDragStart={(event) => {
          if (!setupMode || setupDragHandIndex === undefined || hidden) return;
          event.dataTransfer.effectAllowed = "move";
          writeDragPayload(event.dataTransfer, { kind: "setup-hand", handIndex: setupDragHandIndex });
          applyDragPreview(event, { width: 184, height: 258 });
        }}
        onDragOver={(event) => {
          if (hidden) return;
          if (setupMode) {
            if (activeSetupHandIndex === undefined || setupDragHandIndex === undefined) return;
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
            if (activeSetupHandIndex === undefined || setupDragHandIndex === undefined) return;
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
            if (activeSetupHandIndex === undefined || setupDragHandIndex === undefined || !onSetupPromoteToActive) return;
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
        {hidden ? (
          <div style={hiddenBenchCardWrapStyle}>
            <div style={hiddenBenchCardFrameStyle}>
              <FaceDownCard sleeveImage={sleeveImage} />
            </div>
          </div>
        ) : (
          <>
            <img
              style={benchCardImageStyle}
              src={card.portrait}
              alt={card.name}
              draggable={false}
            />
            <CardHpOverlay hp={umamusume.hp} maxHp={umamusume.maxHp} size="sm" />
            {abilityReady && <AbilityReadyBadge corner="topLeft" size="xs" nudgeX={14} />}
            <AttachedToolBadge
              toolCardId={umamusume.toolCardId}
              size="sm"
              onInspect={(toolCardId) => {
                const tool = getCard(toolCardId);
                if (tool.kind === "trainer") onInspect({ card: tool });
              }}
            />
            <AttachedEnergyPips energies={getAttachedEnergy(umamusume)} draggableEnergyTypes={abilityEnergyTypes} sourceUmamusumeUid={umamusume.uid} />
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

const benchCardImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: radius.md,
  objectFit: "contain",
  display: "block",
};
