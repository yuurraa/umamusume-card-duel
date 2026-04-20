import { type CSSProperties, type DragEvent, useEffect, useRef, useState } from "react";
import { AttachedEnergyPips, FaceDownCard } from "../cards/UmaCard";
import { AbilityReadyBadge } from "../cards/AbilityReadyBadge";
import { AttachedToolBadge } from "../cards/AttachedToolBadge";
import { getAttachedEnergy } from "../cards/attachedEnergy";
import { applyDragPreview, hasTextDragPayload, readDragPayload, writeDragPayload } from "../drag/dragData";
import { getCard, getUmamusumeCard } from "../../game/engine";
import { MAX_BENCH } from "../../../../shared/src/gameData";
import type { EnergyType, UmamusumeInstance, UmamusumeType, SideState } from "../../../../shared/src/types";
import type { InspectTarget } from "../../inspect";
import { uiTextColor, uiTextShadow } from "../../styles/shared";

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

const benchTypeColors: Record<UmamusumeType, string> = {
  Grass: "#7bc03e",
  Fire: "#e8885a",
  Water: "#5aa8e8",
  Lightning: "#dbb94a",
  Psychic: "#b882d8",
  Fighting: "#b88a60",
  Darkness: "#445063",
  Steel: "#7f8c9b",
  Colorless: "#a7adba",
  Dragon: "#d4a72c",
};

const slotStyle: CSSProperties = {
  width: 164,
  height: 188,
  display: "grid",
  gridTemplateRows: "158px 22px",
  gap: 8,
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
    <div style={{ position: "relative", display: "grid", gridTemplateRows: `repeat(${MAX_BENCH}, 188px)`, gap: 12, overflow: "visible" }}>
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
              <div style={{ height: 22, borderRadius: 8, background: "rgba(238, 243, 238, 0.3)", padding: 4, boxShadow: "0 6px 14px rgba(17, 24, 39, 0.1)", display: "grid", placeItems: "center", color: uiTextColor, textShadow: uiTextShadow, fontSize: 9, fontWeight: 900, backdropFilter: "blur(4px)" }}>
                Hidden
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
                  border: hoveredSlot === index ? `2px solid ${hoverBorderColor}` : "1px dashed rgba(185, 198, 188, 0.88)",
                  borderRadius: 8,
                  background: hoveredSlot === index ? hoverBackground : "rgba(238, 243, 238, 0.24)",
                  color: uiTextColor,
                  textShadow: uiTextShadow,
                  fontSize: 12,
                  fontWeight: 900,
                  boxShadow: hoveredSlot === index ? `0 0 0 4px ${hoverRingColor}, 0 0 22px ${hoverGlowColor}` : "none",
                  transition: "border-color 120ms ease, background 120ms ease, box-shadow 120ms ease",
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
        const hpPercent = Math.max(0, Math.round((umamusume.hp / umamusume.maxHp) * 100));
        const fillColor = benchTypeColors[card.type];

        return (
          <BenchSlot
            key={`bench-umamusume-${umamusume.uid}`}
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
            hpPercent={hpPercent}
            fillColor={fillColor}
            abilityReady={Boolean(abilityReadyUmamusumeUids?.has(umamusume.uid))}
            hoverBorderColor={hoverBorderColor}
            hoverBackground={hoverBackground}
            hoverRingColor={hoverRingColor}
            hoverGlowColor={hoverGlowColor}
            isSelectable={Boolean(selectableUmamusumeUids?.has(umamusume.uid))}
            isDimmed={isChoosingUmamusume && !selectableUmamusumeUids?.has(umamusume.uid)}
            abilityEnergyTypes={abilityEnergyTypes}
            sleeveImage={sleeveImage}
            revealOrder={playedBenchRevealOrderByUid[umamusume.uid]}
            shiftOffset={benchShiftOffsetByUid[umamusume.uid]}
            onInspect={onInspect}
            onUmamusumeSelect={onUmamusumeSelect}
          />
        );
      })}
    </div>
  );
}

function BenchSlot({ card, umamusume, side, hidden, setupMode, activeSetupHandIndex, setupDragHandIndex, onSetupPromoteToActive, onHandCardDropOnUmamusume, onEnergyDropOnUmamusume, hpPercent, fillColor, abilityReady, hoverBorderColor, hoverBackground, hoverRingColor, hoverGlowColor, isSelectable, isDimmed, abilityEnergyTypes, sleeveImage, revealOrder, shiftOffset, onInspect, onUmamusumeSelect }: { card: ReturnType<typeof getUmamusumeCard>; umamusume: UmamusumeInstance; side: SideState; hidden: boolean; setupMode: boolean; activeSetupHandIndex: number | undefined; setupDragHandIndex: number | undefined; onSetupPromoteToActive?: ((handIndex: number) => void) | undefined; onHandCardDropOnUmamusume?: ((handIndex: number, umamusumeUid: number) => void) | undefined; onEnergyDropOnUmamusume?: ((umamusumeUid: number) => void) | undefined; hpPercent: number; fillColor: string; abilityReady: boolean; hoverBorderColor: string; hoverBackground: string; hoverRingColor: string; hoverGlowColor: string; isSelectable: boolean; isDimmed: boolean; abilityEnergyTypes?: Set<EnergyType> | undefined; sleeveImage?: string | null | undefined; revealOrder?: number | undefined; shiftOffset?: number | undefined; onInspect: (target: InspectTarget) => void; onUmamusumeSelect?: ((umamusume: UmamusumeInstance) => void) | undefined }) {
  const [hovered, setHovered] = useState(false);
  const [dropHovered, setDropHovered] = useState(false);
  const activeHover = hovered && !isDimmed;
  return (
    <div
      style={{
        ...slotStyle,
        transform: shiftOffset !== undefined ? `translateY(${shiftOffset}px)` : undefined,
        transition: shiftOffset !== undefined ? "transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1)" : undefined,
        animation: revealOrder !== undefined ? `setup-reveal-slide-up 320ms cubic-bezier(0.2, 0.8, 0.2, 1) ${revealOrder * 120}ms both` : undefined,
      }}
    >
      <button
        type="button"
        style={{
          position: "relative",
          height: 158,
          width: "100%",
          padding: 0,
          border: dropHovered ? `2px solid ${hoverBorderColor}` : 0,
          borderRadius: 8,
          background: dropHovered ? hoverBackground : "transparent",
          cursor: "pointer",
          opacity: isDimmed ? 0.45 : 1,
          overflow: "visible",
          filter: activeHover ? "drop-shadow(0 18px 24px rgba(17, 24, 39, 0.22)) saturate(1.06)" : "drop-shadow(0 14px 18px rgba(17, 24, 39, 0.18))",
          transform: activeHover ? "translateY(-6px) rotate(0.8deg) scale(1.035)" : "translateY(0) rotate(0deg) scale(1)",
          boxShadow: dropHovered ? `0 0 0 4px ${hoverRingColor}, 0 0 24px ${hoverGlowColor}` : "none",
          transition: "opacity 160ms ease, transform 160ms ease, filter 160ms ease, box-shadow 120ms ease, border-color 120ms ease",
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
              style={{ width: "100%", height: "100%", borderRadius: 8, objectFit: "contain", display: "block" }}
              src={card.portrait}
              alt={card.name}
              draggable={false}
            />
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
      {hidden ? (
        <div style={{ height: 22, borderRadius: 8, background: "rgba(238, 243, 238, 0.3)", padding: 4, boxShadow: "0 6px 14px rgba(17, 24, 39, 0.1)", display: "grid", placeItems: "center", color: uiTextColor, textShadow: uiTextShadow, fontSize: 9, fontWeight: 900, backdropFilter: "blur(4px)", animation: revealOrder !== undefined ? `hp-bar-appear 220ms ease-out ${80 + revealOrder * 120}ms both` : undefined }}>
          Hidden
        </div>
      ) : (
          <div style={{ height: 22, borderRadius: 8, background: "rgba(238, 243, 238, 0.3)", color: uiTextColor, textShadow: uiTextShadow, padding: 4, boxShadow: "0 6px 14px rgba(17, 24, 39, 0.1)", backdropFilter: "blur(4px)", animation: revealOrder !== undefined ? `hp-bar-appear 220ms ease-out ${80 + revealOrder * 120}ms both` : undefined }}>
            <div style={{ height: 7, fontSize: 9, lineHeight: "7px", fontWeight: 900 }}>{umamusume.hp}/{umamusume.maxHp}</div>
            <div style={{ marginTop: 3, height: 5, overflow: "hidden", borderRadius: 999, background: "rgba(238, 243, 238, 0.3)" }}>
              <div style={{ width: `${hpPercent}%`, height: "100%", borderRadius: 999, background: fillColor, transition: "width 180ms ease" }} />
            </div>
          </div>
      )}
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
  aspectRatio: "745 / 1040",
};

function alphaColor(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
