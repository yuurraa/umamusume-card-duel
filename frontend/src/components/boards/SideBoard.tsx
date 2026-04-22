import { type CSSProperties, type DragEvent, useState } from "react";
import { Bench } from "./Bench";
import { applyDragPreview, hasTextDragPayload, readDragPayload, writeDragPayload } from "../drag/dragData";
import { UmaCard } from "../cards/UmaCard";
import { getCard, getUmamusumeCard } from "../../game/engine";
import { MAX_POINTS } from "../../../../shared/src/gameData";
import type { EnergyType, UmamusumeInstance, UmamusumeType, SideId, SideState } from "../../../../shared/src/types";
import type { InspectTarget } from "../../inspect";
import { CARD_ASPECT_RATIO, borders, colors, filters, radius, shadows, transitions, uiTextColor, uiTextShadow } from "../../styles/shared";
import { alphaColor, typeAccentColors } from "../../utils/color";

type SideBoardProps = {
  side: SideState;
  sideId: SideId;
  onInspect: (target: InspectTarget) => void;
  abilityReadyUmamusumeUids?: Set<number> | undefined;
  hidden?: boolean;
  hiddenBenchCount?: number;
  setupMode?: boolean;
  selectableUmamusumeUids?: Set<number> | undefined;
  abilityEnergyTypes?: Set<EnergyType> | undefined;
  onUmamusumeSelect?: ((umamusume: UmamusumeInstance) => void) | undefined;
  onSetupDropActive?: ((handIndex: number) => void) | undefined;
  onSetupDropBench?: ((handIndex: number) => void) | undefined;
  onSetupPromoteToActive?: ((handIndex: number) => void) | undefined;
  onHandCardDropOnActive?: ((handIndex: number, umamusumeUid: number) => void) | undefined;
  onHandCardDropOnBenchSlot?: ((handIndex: number) => void) | undefined;
  onHandCardDropOnUmamusume?: ((handIndex: number, umamusumeUid: number) => void) | undefined;
  onEnergyDropOnUmamusume?: ((umamusumeUid: number) => void) | undefined;
  onAbilityEnergyDropOnActive?: ((sourceUmamusumeUid: number, energyType: EnergyType) => void) | undefined;
  setupDragHandIndexByUid?: Record<number, number>;
  dimUnselectableActive?: boolean | undefined;
  sleeveImage?: string | null | undefined;
  animateSetupReveal?: boolean;
  setupRevealToken?: number;
};

type SideTone = {
  accent: string;
  fillColor: string;
  borderColor: string;
  surfaceBackground: string;
  glowBackground: string;
  hoverBorderColor: string;
  hoverBackground: string;
  hoverRingColor: string;
  hoverGlowColor: string;
};

export function SideBoard({
  side,
  sideId,
  onInspect,
  abilityReadyUmamusumeUids,
  hidden = false,
  hiddenBenchCount,
  setupMode = false,
  selectableUmamusumeUids,
  abilityEnergyTypes,
  onUmamusumeSelect,
  onSetupDropActive,
  onSetupDropBench,
  onSetupPromoteToActive,
  onHandCardDropOnActive,
  onHandCardDropOnBenchSlot,
  onHandCardDropOnUmamusume,
  onEnergyDropOnUmamusume,
  onAbilityEnergyDropOnActive,
  setupDragHandIndexByUid = {},
  dimUnselectableActive = true,
  sleeveImage = null,
  animateSetupReveal = false,
  setupRevealToken = 0,
}: SideBoardProps) {
  const isPlayer = sideId === "player";
  const activeType = hidden ? null : side.active ? getUmamusumeCard(side.active).type : null;
  const tone = getTypeTone(activeType);
  const hpColor = tone.accent;
  const activeCard = side.active ? getUmamusumeCard(side.active) : null;
  const hpPercent = side.active ? Math.max(0, Math.round((side.active.hp / side.active.maxHp) * 100)) : 0;
  const activeSelectable = Boolean(side.active && selectableUmamusumeUids?.has(side.active.uid));
  const isChoosingUmamusume = Boolean(selectableUmamusumeUids);
  const activeAbilityReady = Boolean(side.active && abilityReadyUmamusumeUids?.has(side.active.uid));
  const [activeDropHovered, setActiveDropHovered] = useState(false);
  const activeSetupHandIndex = side.active ? setupDragHandIndexByUid[side.active.uid] : undefined;

  const handleActiveDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!setupMode || hidden) return;
    const payload = readDragPayload(event.dataTransfer);
    if (payload?.kind !== "setup-hand") return;
    const handIndex = payload.handIndex;
    if (side.active?.uid !== undefined && setupDragHandIndexByUid[side.active.uid] !== undefined && onSetupPromoteToActive) {
      const currentActiveHandIndex = setupDragHandIndexByUid[side.active.uid];
      if (currentActiveHandIndex !== handIndex && Object.values(setupDragHandIndexByUid).includes(handIndex)) {
        onSetupPromoteToActive(handIndex);
        return;
      }
    }
    onSetupDropActive?.(handIndex);
  };

  const handlePlayActiveDrop = (event: DragEvent<HTMLDivElement>) => {
    if (setupMode || hidden || !side.active) return;
    const payload = readDragPayload(event.dataTransfer);
    if (payload?.kind === "hand-card") {
      onHandCardDropOnActive?.(payload.handIndex, side.active.uid);
      return;
    }
    if (payload?.kind === "energy-token") onEnergyDropOnUmamusume?.(side.active.uid);
    if (payload?.kind === "ability-energy") onAbilityEnergyDropOnActive?.(payload.sourceUmamusumeUid, payload.energyType);
  };

  const baseHealth = hidden
    ? <HiddenHealthBar />
    : side.active
      ? <HealthBar key={setupMode ? "health-setup-active" : `health-${side.active.uid}`} hp={side.active.hp} maxHp={side.active.maxHp} percent={hpPercent} color={hpColor} />
      : <EmptyHealthBar />;
  const health = baseHealth;
  const baseActive = side.active ? (
    <div
      key={animateSetupReveal ? `active-reveal-${setupRevealToken}` : "active-steady"}
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        overflow: "visible",
        borderRadius: radius.lg,
        boxShadow: activeDropHovered
          ? `0 0 0 5px ${tone.hoverRingColor}, 0 0 36px ${tone.hoverGlowColor}`
          : shadows.none,
        animation: animateSetupReveal ? `setup-reveal-slide-up 320ms ${transitions.spring} 0ms both` : undefined,
        transition: `box-shadow ${transitions.fast}`,
      }}
      draggable={setupMode && !hidden && activeSetupHandIndex !== undefined}
      onDragStart={(event) => {
        if (setupMode) {
          if (hidden || activeSetupHandIndex === undefined) return;
          event.dataTransfer.effectAllowed = "move";
          writeDragPayload(event.dataTransfer, { kind: "setup-hand", handIndex: activeSetupHandIndex });
          applyDragPreview(event, { width: 184, height: 258 });
        }
      }}
      onDragOver={(event) => {
        if (setupMode) {
          if (!onSetupDropActive || hidden || !hasTextDragPayload(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setActiveDropHovered(true);
          return;
        }
        if (hidden || !hasTextDragPayload(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setActiveDropHovered(true);
      }}
      onDragEnter={(event) => {
        if (hidden) return;
        if (!hasTextDragPayload(event)) return;
        setActiveDropHovered(true);
      }}
      onDragLeave={() => setActiveDropHovered(false)}
      onDrop={(event) => {
        event.preventDefault();
        setActiveDropHovered(false);
        if (setupMode) {
          if (!onSetupDropActive || hidden) return;
          handleActiveDrop(event);
          return;
        }
        handlePlayActiveDrop(event);
      }}
    >
      <UmaCard
        umamusume={side.active}
        hidden={hidden}
        sleeveImage={sleeveImage}
        isSelectable={activeSelectable}
        isDimmed={dimUnselectableActive && isChoosingUmamusume && !activeSelectable}
        abilityReady={activeAbilityReady}
        onInspect={() => {
          if (hidden) return;
          if (activeSelectable) {
            onUmamusumeSelect?.(side.active!);
            return;
          }
          onInspect({ card: activeCard!, umamusume: side.active!, sideId, isActive: true });
        }}
        onToolInspect={(toolCardId) => {
          const tool = getCard(toolCardId);
          if (tool.kind === "trainer") onInspect({ card: tool });
        }}
      />
    </div>
  ) : (
    <div
      style={{
        ...emptyActiveSpotStyle,
        border: activeDropHovered ? `2px solid ${tone.hoverBorderColor}` : emptyActiveSpotStyle.border,
        background: activeDropHovered ? tone.hoverBackground : emptyActiveSpotStyle.background,
        boxShadow: activeDropHovered ? `0 0 0 5px ${tone.hoverRingColor}, 0 0 30px ${tone.hoverGlowColor}` : shadows.none,
        transition: `border-color ${transitions.fast}, background ${transitions.fast}, box-shadow ${transitions.fast}`,
      }}
      onDragOver={(event) => {
        if (!setupMode || !onSetupDropActive || hidden || !hasTextDragPayload(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setActiveDropHovered(true);
      }}
      onDragEnter={(event) => {
        if (!setupMode || hidden || !hasTextDragPayload(event)) return;
        setActiveDropHovered(true);
      }}
      onDragLeave={() => setActiveDropHovered(false)}
      onDrop={(event) => {
        event.preventDefault();
        if (!setupMode || !onSetupDropActive || hidden) return;
        const payload = readDragPayload(event.dataTransfer);
        if (payload?.kind !== "setup-hand") return;
        setActiveDropHovered(false);
        handleActiveDrop(event);
      }}
    >
      Active Spot
    </div>
  );
  const active = (
    <div style={{ position: "relative", width: "var(--board-active-width)", maxWidth: "100%", justifySelf: "center" }}>
      {baseActive}
    </div>
  );
  const bench = (
    <div style={{ width: "var(--board-bench-width)", overflow: "visible", alignSelf: "stretch" }}>
      <Bench
        side={side}
        onInspect={onInspect}
        hidden={hidden}
        animateOnNewCards={!hidden && !setupMode}
        animateSetupReveal={animateSetupReveal}
        setupRevealToken={setupRevealToken}
        setupMode={setupMode}
        abilityReadyUmamusumeUids={abilityReadyUmamusumeUids}
        selectableUmamusumeUids={selectableUmamusumeUids}
        abilityEnergyTypes={abilityEnergyTypes}
        onUmamusumeSelect={onUmamusumeSelect}
        onSetupDropBench={onSetupDropBench}
        onSetupPromoteToActive={onSetupPromoteToActive}
        activeSetupHandIndex={activeSetupHandIndex}
        onHandCardDropOnBenchSlot={onHandCardDropOnBenchSlot}
        onHandCardDropOnUmamusume={onHandCardDropOnUmamusume}
        onEnergyDropOnUmamusume={onEnergyDropOnUmamusume}
        setupDragHandIndexByUid={setupDragHandIndexByUid}
        hoverBorderColor={tone.hoverBorderColor}
        hoverBackground={tone.hoverBackground}
        hoverRingColor={tone.hoverRingColor}
        hoverGlowColor={tone.hoverGlowColor}
        sleeveImage={sleeveImage}
        {...(hiddenBenchCount !== undefined ? { hiddenBenchCount } : {})}
      />
    </div>
  );

  return (
    <section style={boardStyle(tone)}>
      <style>{SETUP_REVEAL_KEYFRAMES}</style>
      <div style={glowStyle(tone)} />
      <div style={scorePositionStyle(isPlayer)}>
        <ScorePips points={side.points} fillColor={tone.fillColor} />
      </div>
      <div style={layoutStyle(isPlayer)}>
        {isPlayer ? (
          <>
            <div style={{ gridColumn: 1, gridRow: "1 / span 2" }}>{bench}</div>
            <div style={{ gridColumn: 2, gridRow: 1 }}>{health}</div>
            <div style={{ gridColumn: 2, gridRow: 2 }}>{active}</div>
          </>
        ) : (
          <>
            <div style={{ gridColumn: 1, gridRow: 1 }}>{health}</div>
            <div style={{ gridColumn: 1, gridRow: 2 }}>{active}</div>
            <div style={{ gridColumn: 2, gridRow: "1 / span 2" }}>{bench}</div>
          </>
        )}
      </div>
    </section>
  );
}

function HealthBar({ hp, maxHp, percent, color }: { hp: number; maxHp: number; percent: number; color: string }) {
  return (
    <div style={{ boxSizing: "border-box", height: "var(--board-health-height)", borderRadius: radius.md, background: colors.glassMedium, border: borders.glass, color: uiTextColor, textShadow: uiTextShadow, padding: "clamp(6px, 0.417vw, 8px)", boxShadow: "0 12px 30px rgba(17, 24, 39, 0.12)", backdropFilter: filters.glassBlur, animation: "hp-bar-appear 220ms ease-out both" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "clamp(10px, 0.625vw, 12px)", lineHeight: "12px", fontWeight: 900 }}>
        <span>{hp}/{maxHp}</span>
        <span>{percent}%</span>
      </div>
      <div style={{ height: "clamp(8px, 0.521vw, 10px)", marginTop: "clamp(5px, 0.365vw, 7px)", overflow: "hidden", borderRadius: radius.pill, background: colors.glassMedium }}>
        <div style={{ height: "100%", width: `${percent}%`, borderRadius: radius.pill, background: color, transition: `width ${transitions.slow}` }} />
      </div>
    </div>
  );
}

function HiddenHealthBar() {
  return (
    <div style={{ boxSizing: "border-box", height: "var(--board-health-height)", borderRadius: radius.md, background: colors.glassMedium, border: borders.glass, padding: "clamp(6px, 0.417vw, 8px)", boxShadow: "0 12px 30px rgba(17, 24, 39, 0.12)", display: "grid", placeItems: "center", color: uiTextColor, textShadow: uiTextShadow, fontSize: "clamp(10px, 0.625vw, 12px)", fontWeight: 900, backdropFilter: filters.glassBlur }}>
      Hidden
    </div>
  );
}

function EmptyHealthBar() {
  return (
    <div style={{ boxSizing: "border-box", height: "var(--board-health-height)", borderRadius: radius.md, border: borders.neutralDashed, background: colors.glassMedium, display: "grid", placeItems: "center", color: uiTextColor, textShadow: uiTextShadow, fontSize: "clamp(10px, 0.625vw, 12px)", fontWeight: 900, backdropFilter: filters.glassBlurSoft }}>
      No Active
    </div>
  );
}

function ScorePips({ points, fillColor }: { points: number; fillColor: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", height: 36, borderRadius: radius.pill, border: borders.glass, background: "rgba(238, 243, 238, 0.56)", padding: "0 12px", boxShadow: shadows.md, backdropFilter: filters.glassBlur }} aria-label={`${points} of ${MAX_POINTS} points`}>
      {Array.from({ length: MAX_POINTS }, (_, index) => (
        <span
          key={index}
          style={{
            width: 16,
            height: 16,
            borderRadius: radius.circle,
            border: `2px solid ${index < points ? fillColor : colors.slate300}`,
            background: index < points ? fillColor : colors.glassStrong,
            boxShadow: "0 3px 8px rgba(17, 24, 39, 0.12)",
          }}
        />
      ))}
    </div>
  );
}

function boardStyle(tone: SideTone): CSSProperties {
  return {
    ...boardMetricVars,
    position: "relative",
    overflow: "visible",
    borderRadius: radius.md,
    border: `1px solid ${tone.borderColor}`,
    background: tone.surfaceBackground,
    padding: "var(--board-pad-top) var(--board-pad-x) var(--board-pad-bottom)",
    boxShadow: shadows.board,
  };
}

function layoutStyle(isPlayer: boolean): CSSProperties {
  return {
    position: "relative",
    display: "grid",
    gridTemplateColumns: isPlayer ? "var(--board-bench-width) var(--board-active-width)" : "var(--board-active-width) var(--board-bench-width)",
    gridTemplateRows: "var(--board-health-height) var(--board-active-height)",
    columnGap: "var(--board-column-gap)",
    rowGap: "var(--board-row-gap)",
    justifyContent: "center",
    alignItems: "start",
    overflow: "visible",
  };
}

function scorePositionStyle(isPlayer: boolean): CSSProperties {
  return {
    position: "absolute",
    top: 16,
    left: isPlayer ? 16 : "auto",
    right: isPlayer ? "auto" : 16,
    zIndex: 2,
  };
}

function glowStyle(tone: SideTone): CSSProperties {
  return {
    position: "absolute",
    left: 70,
    right: 70,
    top: 118,
    height: 220,
    borderRadius: radius.pill,
    background: tone.glowBackground,
    filter: "blur(56px)",
    pointerEvents: "none",
  };
}

const neutralTone: SideTone = {
  accent: colors.slate400,
  fillColor: "#b4bfcc",
  borderColor: "rgba(148, 163, 184, 0.24)",
  surfaceBackground: "rgba(148, 163, 184, 0.08)",
  glowBackground: "rgba(148, 163, 184, 0.12)",
  hoverBorderColor: "rgba(148, 163, 184, 0.5)",
  hoverBackground: "rgba(148, 163, 184, 0.1)",
  hoverRingColor: "rgba(148, 163, 184, 0.22)",
  hoverGlowColor: "rgba(148, 163, 184, 0.28)",
};

function getTypeTone(type: UmamusumeType | null): SideTone {
  if (!type) return neutralTone;
  const base = typeAccentColors[type];
  return {
    accent: base,
    fillColor: base,
    borderColor: alphaColor(base, 0.3),
    surfaceBackground: `linear-gradient(180deg, ${alphaColor(base, 0.1)} 0%, ${colors.glassMedium} 100%)`,
    glowBackground: alphaColor(base, 0.18),
    hoverBorderColor: alphaColor(base, 0.6),
    hoverBackground: alphaColor(base, 0.12),
    hoverRingColor: alphaColor(base, 0.26),
    hoverGlowColor: alphaColor(base, 0.32),
  };
}

const emptyActiveSpotStyle: CSSProperties = {
  width: "100%",
  maxWidth: "var(--board-active-width)",
  aspectRatio: CARD_ASPECT_RATIO,
  display: "grid",
  placeItems: "center",
  borderRadius: radius.md,
  border: borders.neutralDashed,
  background: colors.glassMedium,
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 16,
  fontWeight: 900,
};

const boardMetricVars = {
  "--board-active-width": "clamp(336px, 21.875vw, 420px)",
  "--board-active-height": "clamp(469px, 30.521vw, 586px)",
  "--board-bench-width": "clamp(131px, 8.542vw, 164px)",
  "--board-bench-card-height": "clamp(126px, 8.229vw, 158px)",
  "--board-bench-health-height": "clamp(18px, 1.146vw, 22px)",
  "--board-bench-inner-gap": "clamp(6px, 0.417vw, 8px)",
  "--board-bench-slot-height": "clamp(150px, 9.792vw, 188px)",
  "--board-bench-gap": "clamp(10px, 0.625vw, 12px)",
  "--board-column-gap": "clamp(22px, 1.458vw, 28px)",
  "--board-row-gap": "clamp(22px, 1.458vw, 28px)",
  "--board-health-height": "clamp(38px, 2.5vw, 48px)",
  "--board-pad-top": "clamp(59px, 3.854vw, 74px)",
  "--board-pad-x": "clamp(19px, 1.25vw, 24px)",
  "--board-pad-bottom": "clamp(19px, 1.25vw, 24px)",
} as Record<string, string>;

const SETUP_REVEAL_KEYFRAMES = `
@keyframes setup-reveal-slide-up {
  from { opacity: 0; transform: translateY(26px) scale(0.96); filter: blur(2px); }
  to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}
@keyframes hp-bar-appear {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
`;
