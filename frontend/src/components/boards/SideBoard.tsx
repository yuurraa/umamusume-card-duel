import { type CSSProperties, type DragEvent, useState } from "react";
import { Bench } from "./Bench";
import { hasTextDragPayload, readDragPayload, writeDragPayload } from "../drag/dragData";
import { UmaCard } from "../cards/UmaCard";
import { getUmamusumeCard } from "../../game/engine";
import { MAX_POINTS } from "../../../../shared/src/gameData";
import type { EnergyType, UmamusumeInstance, UmamusumeType, SideId, SideState } from "../../../../shared/src/types";
import type { InspectTarget } from "../../inspect";

type SideBoardProps = {
  side: SideState;
  sideId: SideId;
  onInspect: (target: InspectTarget) => void;
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
  sleeveImage?: string | null | undefined;
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
  sleeveImage = null,
}: SideBoardProps) {
  const isPlayer = sideId === "player";
  const activeType = hidden ? null : side.active ? getUmamusumeCard(side.active).type : null;
  const tone = getTypeTone(activeType);
  const hpColor = tone.accent;
  const activeCard = side.active ? getUmamusumeCard(side.active) : null;
  const hpPercent = side.active ? Math.max(0, Math.round((side.active.hp / side.active.maxHp) * 100)) : 0;
  const activeSelectable = Boolean(side.active && selectableUmamusumeUids?.has(side.active.uid));
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

  const health = hidden
    ? <HiddenHealthBar />
    : side.active
      ? <HealthBar hp={side.active.hp} maxHp={side.active.maxHp} percent={hpPercent} color={hpColor} />
      : <EmptyHealthBar />;
  const active = side.active ? (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        overflow: "visible",
        borderRadius: 12,
        boxShadow: activeDropHovered ? `0 0 0 5px ${tone.hoverRingColor}, 0 0 36px ${tone.hoverGlowColor}` : "none",
        transition: "box-shadow 120ms ease",
      }}
      draggable={setupMode && !hidden && activeSetupHandIndex !== undefined}
      onDragStart={(event) => {
        if (setupMode) {
          if (hidden || activeSetupHandIndex === undefined) return;
          event.dataTransfer.effectAllowed = "move";
          writeDragPayload(event.dataTransfer, { kind: "setup-hand", handIndex: activeSetupHandIndex });
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
        onInspect={() => {
          if (hidden) return;
          if (activeSelectable) {
            onUmamusumeSelect?.(side.active!);
            return;
          }
          onInspect({ card: activeCard!, umamusume: side.active!, sideId, isActive: true });
        }}
      />
    </div>
  ) : (
    <div
      style={{
        ...emptyActiveSpotStyle,
        border: activeDropHovered ? `2px solid ${tone.hoverBorderColor}` : emptyActiveSpotStyle.border,
        background: activeDropHovered ? tone.hoverBackground : emptyActiveSpotStyle.background,
        boxShadow: activeDropHovered ? `0 0 0 5px ${tone.hoverRingColor}, 0 0 30px ${tone.hoverGlowColor}` : "none",
        transition: "border-color 120ms ease, background 120ms ease, box-shadow 120ms ease",
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
  const bench = (
    <div style={{ width: 164, overflow: "visible", alignSelf: "stretch" }}>
      <Bench
        side={side}
        onInspect={onInspect}
        hidden={hidden}
        setupMode={setupMode}
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
    <div style={{ boxSizing: "border-box", height: 48, borderRadius: 8, background: "rgba(238, 243, 238, 0.68)", border: "1px solid rgba(217, 225, 218, 0.72)", color: "#000000", padding: 8, boxShadow: "0 12px 30px rgba(17, 24, 39, 0.12)", backdropFilter: "blur(5px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, lineHeight: "12px", fontWeight: 900 }}>
        <span>{hp}/{maxHp}</span>
        <span>{percent}%</span>
      </div>
      <div style={{ height: 10, marginTop: 7, overflow: "hidden", borderRadius: 999, background: "#e2e8f0" }}>
        <div style={{ height: "100%", width: `${percent}%`, borderRadius: 999, background: color, transition: "width 180ms ease" }} />
      </div>
    </div>
  );
}

function HiddenHealthBar() {
  return (
    <div style={{ boxSizing: "border-box", height: 48, borderRadius: 8, background: "rgba(238, 243, 238, 0.68)", border: "1px solid rgba(217, 225, 218, 0.72)", padding: 8, boxShadow: "0 12px 30px rgba(17, 24, 39, 0.12)", display: "grid", placeItems: "center", color: "#000000", fontSize: 12, fontWeight: 900, backdropFilter: "blur(5px)" }}>
      Face Down
    </div>
  );
}

function EmptyHealthBar() {
  return (
    <div style={{ boxSizing: "border-box", height: 48, borderRadius: 8, border: "1px dashed rgba(0, 0, 0, 0.45)", background: "rgba(238, 243, 238, 0.34)", display: "grid", placeItems: "center", color: "#000000", fontSize: 12, fontWeight: 900, backdropFilter: "blur(4px)" }}>
      No Active
    </div>
  );
}

function ScorePips({ points, fillColor }: { points: number; fillColor: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", height: 36, borderRadius: 999, border: "1px solid rgba(217, 225, 218, 0.72)", background: "rgba(238, 243, 238, 0.56)", padding: "0 12px", boxShadow: "0 8px 18px rgba(17, 24, 39, 0.1)", backdropFilter: "blur(5px)" }} aria-label={`${points} of ${MAX_POINTS} points`}>
      {Array.from({ length: MAX_POINTS }, (_, index) => (
        <span
          key={index}
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            border: `2px solid ${index < points ? fillColor : "#cbd5e1"}`,
            background: index < points ? fillColor : "rgba(238, 243, 238, 0.9)",
            boxShadow: "0 3px 8px rgba(17, 24, 39, 0.12)",
          }}
        />
      ))}
    </div>
  );
}

function boardStyle(tone: SideTone): CSSProperties {
  return {
    position: "relative",
    overflow: "visible",
    borderRadius: 8,
    border: `1px solid ${tone.borderColor}`,
    background: tone.surfaceBackground,
    padding: "70px 16px 20px",
    boxShadow: "0 26px 80px rgba(17, 24, 39, 0.16)",
  };
}

function layoutStyle(isPlayer: boolean): CSSProperties {
  return {
    position: "relative",
    display: "grid",
    gridTemplateColumns: isPlayer ? "164px minmax(340px, 420px)" : "minmax(340px, 420px) 164px",
    gridTemplateRows: "48px 586px",
    columnGap: 28,
    rowGap: 28,
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
    borderRadius: 999,
    background: tone.glowBackground,
    filter: "blur(56px)",
    pointerEvents: "none",
  };
}

const typeToneBases: Record<UmamusumeType, string> = {
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

const neutralTone: SideTone = {
  accent: "#94a3b8",
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
  const base = typeToneBases[type];
  return {
    accent: base,
    fillColor: base,
    borderColor: alphaColor(base, 0.3),
    surfaceBackground: `linear-gradient(180deg, ${alphaColor(base, 0.1)} 0%, rgba(238, 243, 238, 0.3) 100%)`,
    glowBackground: alphaColor(base, 0.18),
    hoverBorderColor: alphaColor(base, 0.6),
    hoverBackground: alphaColor(base, 0.12),
    hoverRingColor: alphaColor(base, 0.26),
    hoverGlowColor: alphaColor(base, 0.32),
  };
}

function alphaColor(hex: string, alpha: number): string {
  const { red, green, blue } = hexToRgb(hex);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  };
}

const emptyActiveSpotStyle: CSSProperties = {
  width: "100%",
  maxWidth: 420,
  aspectRatio: "745 / 1040",
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  border: "1px dashed rgba(0, 0, 0, 0.45)",
  background: "rgba(238, 243, 238, 0.3)",
  color: "#000000",
  fontSize: 16,
  fontWeight: 900,
};
