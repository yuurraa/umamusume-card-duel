import { type CSSProperties, type DragEvent, useState } from "react";
import { AttachedEnergyPips } from "./UmaCard";
import { getAttachedEnergy } from "./attachedEnergy";
import { hasTextDragPayload, readDragPayload, writeDragPayload } from "./dragData";
import { getPokemonCard } from "../game/engine";
import { MAX_BENCH } from "../../../shared/src/gameData";
import type { PokemonInstance, PokemonType, SideState } from "../../../shared/src/types";
import type { InspectTarget } from "../inspect";

type BenchProps = {
  side: SideState;
  onInspect: (target: InspectTarget) => void;
  hidden?: boolean;
  hiddenBenchCount?: number;
  setupMode?: boolean;
  selectablePokemonUids?: Set<number> | undefined;
  onPokemonSelect?: ((pokemon: PokemonInstance) => void) | undefined;
  onSetupDropBench?: ((handIndex: number) => void) | undefined;
  onSetupPromoteToActive?: ((handIndex: number) => void) | undefined;
  activeSetupHandIndex?: number | undefined;
  onHandCardDropOnBenchSlot?: ((handIndex: number) => void) | undefined;
  onHandCardDropOnPokemon?: ((handIndex: number, pokemonUid: number) => void) | undefined;
  onEnergyDropOnPokemon?: ((pokemonUid: number) => void) | undefined;
  onRetreatDropOnPokemon?: ((pokemonUid: number) => void) | undefined;
  setupDragHandIndexByUid?: Record<number, number>;
  hoverBorderColor?: string;
  hoverBackground?: string;
  hoverRingColor?: string;
  hoverGlowColor?: string;
};

const benchTypeColors: Record<PokemonType, string> = {
  Grass: "#7bc03e",
  Fire: "#e8885a",
  Water: "#5aa8e8",
  Lightning: "#dbb94a",
  Psychic: "#b882d8",
  Fighting: "#b88a60",
  Darkness: "#445063",
  Metal: "#7f8c9b",
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
  hidden = false,
  hiddenBenchCount,
  setupMode = false,
  selectablePokemonUids,
  onPokemonSelect,
  onSetupDropBench,
  onSetupPromoteToActive,
  activeSetupHandIndex,
  onHandCardDropOnBenchSlot,
  onHandCardDropOnPokemon,
  onEnergyDropOnPokemon,
  onRetreatDropOnPokemon,
  setupDragHandIndexByUid = {},
  hoverBorderColor = "rgba(196, 125, 164, 0.6)",
  hoverBackground = "rgba(196, 125, 164, 0.12)",
  hoverRingColor = "rgba(196, 125, 164, 0.26)",
  hoverGlowColor = "rgba(196, 125, 164, 0.32)",
}: BenchProps) {
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const visibleBenchCount = hidden ? (hiddenBenchCount ?? side.bench.length) : side.bench.length;

  return (
    <div style={{ display: "grid", gridTemplateRows: `repeat(${MAX_BENCH}, 188px)`, gap: 12, overflow: "visible" }}>
      {Array.from({ length: MAX_BENCH }, (_, index) => {
        if (hidden && index < visibleBenchCount) {
          return (
            <div key={`bench-hidden-${index}`} style={slotStyle}>
              <div style={hiddenCardFaceStyle}>Face Down</div>
              <div style={{ height: 22, borderRadius: 8, background: "rgba(255, 255, 255, 0.72)", padding: 4, boxShadow: "0 6px 14px rgba(17, 24, 39, 0.1)", display: "grid", placeItems: "center", color: "#647168", fontSize: 9, fontWeight: 900 }}>
                Hidden
              </div>
            </div>
          );
        }
        const pokemon = side.bench[index];
        if (!pokemon) {
          return (
            <div key={`bench-empty-${index}`} style={slotStyle}>
              <div
                style={{
                  display: "grid",
                  placeItems: "center",
                  border: hoveredSlot === index ? `2px solid ${hoverBorderColor}` : "1px dashed #cbd5e1",
                  borderRadius: 8,
                  background: hoveredSlot === index ? hoverBackground : "rgba(255, 255, 255, 0.28)",
                  color: "#647168",
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

        const card = getPokemonCard(pokemon);
        const hpPercent = Math.max(0, Math.round((pokemon.hp / pokemon.maxHp) * 100));
        const fillColor = benchTypeColors[card.type];

        return (
          <BenchSlot
            key={`bench-pokemon-${pokemon.uid}`}
            card={card}
            pokemon={pokemon}
            side={side}
            hidden={hidden}
            setupMode={setupMode}
            activeSetupHandIndex={activeSetupHandIndex}
            setupDragHandIndex={setupDragHandIndexByUid[pokemon.uid]}
            onSetupPromoteToActive={onSetupPromoteToActive}
            onHandCardDropOnPokemon={onHandCardDropOnPokemon}
            onEnergyDropOnPokemon={onEnergyDropOnPokemon}
            onRetreatDropOnPokemon={onRetreatDropOnPokemon}
            hpPercent={hpPercent}
            fillColor={fillColor}
            hoverBorderColor={hoverBorderColor}
            hoverBackground={hoverBackground}
            hoverRingColor={hoverRingColor}
            hoverGlowColor={hoverGlowColor}
            isSelectable={Boolean(selectablePokemonUids?.has(pokemon.uid))}
            onInspect={onInspect}
            onPokemonSelect={onPokemonSelect}
          />
        );
      })}
    </div>
  );
}

function BenchSlot({ card, pokemon, side, hidden, setupMode, activeSetupHandIndex, setupDragHandIndex, onSetupPromoteToActive, onHandCardDropOnPokemon, onEnergyDropOnPokemon, onRetreatDropOnPokemon, hpPercent, fillColor, hoverBorderColor, hoverBackground, hoverRingColor, hoverGlowColor, isSelectable, onInspect, onPokemonSelect }: { card: ReturnType<typeof getPokemonCard>; pokemon: PokemonInstance; side: SideState; hidden: boolean; setupMode: boolean; activeSetupHandIndex: number | undefined; setupDragHandIndex: number | undefined; onSetupPromoteToActive?: ((handIndex: number) => void) | undefined; onHandCardDropOnPokemon?: ((handIndex: number, pokemonUid: number) => void) | undefined; onEnergyDropOnPokemon?: ((pokemonUid: number) => void) | undefined; onRetreatDropOnPokemon?: ((pokemonUid: number) => void) | undefined; hpPercent: number; fillColor: string; hoverBorderColor: string; hoverBackground: string; hoverRingColor: string; hoverGlowColor: string; isSelectable: boolean; onInspect: (target: InspectTarget) => void; onPokemonSelect?: ((pokemon: PokemonInstance) => void) | undefined }) {
  const [hovered, setHovered] = useState(false);
  const [dropHovered, setDropHovered] = useState(false);

  return (
    <div style={slotStyle}>
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
          overflow: "visible",
          filter: hovered ? "drop-shadow(0 18px 24px rgba(17, 24, 39, 0.22)) saturate(1.06)" : "drop-shadow(0 14px 18px rgba(17, 24, 39, 0.18))",
          transform: hovered ? "translateY(-6px) rotate(0.8deg) scale(1.035)" : "translateY(0) rotate(0deg) scale(1)",
          boxShadow: dropHovered ? `0 0 0 4px ${hoverRingColor}, 0 0 24px ${hoverGlowColor}` : "none",
          transition: "transform 160ms ease, filter 160ms ease, box-shadow 120ms ease",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        draggable={setupMode && setupDragHandIndex !== undefined && !hidden}
        onDragStart={(event) => {
          if (!setupMode || setupDragHandIndex === undefined || hidden) return;
          event.dataTransfer.effectAllowed = "move";
          writeDragPayload(event.dataTransfer, { kind: "setup-hand", handIndex: setupDragHandIndex });
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
            onHandCardDropOnPokemon?.(payload.handIndex, pokemon.uid);
            return;
          }
          if (payload?.kind === "energy-token") {
            onEnergyDropOnPokemon?.(pokemon.uid);
            return;
          }
          if (payload?.kind === "active-retreat") onRetreatDropOnPokemon?.(pokemon.uid);
        }}
        onClick={() => {
          if (hidden) return;
          if (isSelectable) {
            onPokemonSelect?.(pokemon);
            return;
          }
          onInspect({ card, pokemon, sideId: side.id, isActive: false });
        }}
        aria-label={`Inspect benched ${card.name}`}
      >
        {hidden ? (
          <div style={hiddenCardFaceStyle}>Face Down</div>
        ) : (
          <>
            <img
              style={{ width: "100%", height: "100%", borderRadius: 8, objectFit: "contain", display: "block" }}
              src={card.portrait}
              alt={card.name}
              draggable={false}
            />
            <AttachedEnergyPips energies={getAttachedEnergy(pokemon)} />
          </>
        )}
      </button>
      {hidden ? (
        <div style={{ height: 22, borderRadius: 8, background: "rgba(255, 255, 255, 0.72)", padding: 4, boxShadow: "0 6px 14px rgba(17, 24, 39, 0.1)", display: "grid", placeItems: "center", color: "#647168", fontSize: 9, fontWeight: 900 }}>
          Hidden
        </div>
      ) : (
        <div style={{ height: 22, borderRadius: 8, background: "rgba(255, 255, 255, 0.72)", padding: 4, boxShadow: "0 6px 14px rgba(17, 24, 39, 0.1)" }}>
          <div style={{ height: 7, fontSize: 9, lineHeight: "7px", fontWeight: 900 }}>{pokemon.hp}/{pokemon.maxHp}</div>
          <div style={{ marginTop: 3, height: 5, overflow: "hidden", borderRadius: 999, background: "#e2e8f0" }}>
            <div style={{ width: `${hpPercent}%`, height: "100%", borderRadius: 999, background: fillColor, transition: "width 180ms ease" }} />
          </div>
        </div>
      )}
    </div>
  );
}

const hiddenCardFaceStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  border: "1px solid rgba(23, 33, 28, 0.18)",
  background: "linear-gradient(180deg, #26312d 0%, #17211c 100%)",
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 0.2,
};
