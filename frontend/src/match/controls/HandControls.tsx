import { useEffect, useState, type CSSProperties } from "react";
import type { EnergyType } from "../../../../shared/src/types";
import { energyLabel } from "../../game/engine";
import { writeDragPayload } from "../../components/drag/dragData";
import { EnergyIcon } from "../../components/cards/EnergyIcon";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { attackButtonStyle } from "../../styles/shared";
import { alphaColor } from "../../utils/color";

export function PlayHandHeader({
  canAttach,
  energyRefreshKey,
  energyType,
  extraCount,
  canEndTurn,
  menuOpen,
  log,
  canSurrender,
  onEndTurn,
  onToggleMenu,
  onSurrender,
}: {
  canAttach: boolean;
  energyRefreshKey: number;
  energyType: EnergyType | null;
  extraCount: number;
  canEndTurn: boolean;
  menuOpen: boolean;
  log: string[];
  canSurrender: boolean;
  onEndTurn: () => void;
  onToggleMenu: () => void;
  onSurrender: () => void;
}) {
  return (
    <div style={playHandHeaderStyle}>
      <EnergyDragToken canDrag={canAttach} refreshNonce={energyRefreshKey} energyType={energyType} extraCount={extraCount} />
      <div style={playHandActionRowStyle}>
        <NeutralButton style={endTurnButtonStyle(canEndTurn)} disabled={!canEndTurn} onClick={onEndTurn}>
          End Turn
        </NeutralButton>
        <MatchMenuControl
          menuOpen={menuOpen}
          log={log}
          canSurrender={canSurrender}
          placement="top-end"
          onToggleMenu={onToggleMenu}
          onSurrender={onSurrender}
        />
      </div>
    </div>
  );
}

export function MatchMenuControl({
  menuOpen,
  log,
  canSurrender,
  placement = "top-start",
  onToggleMenu,
  onSurrender,
}: {
  menuOpen: boolean;
  log: string[];
  canSurrender: boolean;
  placement?: "top-start" | "top-end";
  onToggleMenu: () => void;
  onSurrender: () => void;
}) {
  const [menuHovered, setMenuHovered] = useState(false);

  return (
    <div style={matchMenuControlWrapStyle}>
      <button
        type="button"
        style={menuButtonStyle(menuOpen, menuHovered)}
        onClick={onToggleMenu}
        onMouseEnter={() => setMenuHovered(true)}
        onMouseLeave={() => setMenuHovered(false)}
        onFocus={() => setMenuHovered(true)}
        onBlur={() => setMenuHovered(false)}
        aria-label="Open battle menu"
      >
        <span style={hamburgerLineStyle} />
        <span style={hamburgerLineStyle} />
        <span style={hamburgerLineStyle} />
      </button>
      {menuOpen && <BattleMenu placement={placement} log={log} canSurrender={canSurrender} onSurrender={onSurrender} />}
    </div>
  );
}

function EnergyDragToken({ canDrag, refreshNonce, energyType, extraCount }: { canDrag: boolean; refreshNonce: number; energyType: EnergyType | null; extraCount: number }) {
  const [hovered, setHovered] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!energyType) {
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    const timeoutId = window.setTimeout(() => setRefreshing(false), 320);
    return () => window.clearTimeout(timeoutId);
  }, [refreshNonce, energyType]);

  return (
    <div
      style={energyTokenStyle(canDrag, energyType, hovered, refreshing)}
      draggable={canDrag}
      onDragStart={(event) => {
        if (!canDrag) return;
        event.dataTransfer.effectAllowed = "move";
        writeDragPayload(event.dataTransfer, { kind: "energy-token" });
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      tabIndex={canDrag ? 0 : -1}
      aria-label={energyType ? `Drag ${energyLabel(energyType)}` : "No Energy available"}
    >
      {energyType ? <EnergyIcon type={energyType} size="md" /> : <span style={energyTokenEmptyStyle}>?</span>}
      {extraCount > 0 && <span style={energyTokenBadgeStyle}>+{extraCount}</span>}
    </div>
  );
}

function BattleMenu({ placement, log, canSurrender, onSurrender }: { placement: "top-start" | "top-end"; log: string[]; canSurrender: boolean; onSurrender: () => void }) {
  return (
    <section style={battleMenuStyle(placement)}>
      <div style={battleMenuHeaderStyle}>
        <div>
          <div style={battleMenuKickerStyle}>Menu</div>
          <strong style={battleMenuTitleStyle}>Battle Log</strong>
        </div>
        <NeutralButton tone="danger" style={surrenderButtonStyle(canSurrender)} disabled={!canSurrender} onClick={onSurrender}>
          Surrender
        </NeutralButton>
      </div>
      <div style={battleLogListStyle}>
        {log.length === 0 ? (
          <span style={battleLogEmptyStyle}>No actions yet.</span>
        ) : (
          log.map((entry, index) => (
            <div key={`${entry}-${index}`} style={battleLogEntryStyle(index)}>
              {entry}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

const playHandHeaderStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 0,
  marginBottom: 0,
  zIndex: 6,
};

const playHandActionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const matchMenuControlWrapStyle: CSSProperties = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
};

function endTurnButtonStyle(enabled: boolean): CSSProperties {
  return attackButtonStyle(enabled);
}

function menuButtonStyle(active: boolean, hovered: boolean): CSSProperties {
  const ringBorder = active
    ? (hovered ? "1px solid rgba(23, 33, 28, 0.58)" : "1px solid rgba(23, 33, 28, 0.32)")
    : (hovered ? "1px solid rgba(0, 0, 0, 0.36)" : "1px solid rgba(217, 225, 218, 0.82)");
  const ringBackground = active
    ? (hovered ? "#0f1713" : "#17211c")
    : (hovered ? "rgba(238, 243, 238, 0.9)" : "rgba(238, 243, 238, 0.82)");
  const ringShadow = active
    ? (hovered ? "0 14px 30px rgba(23, 33, 28, 0.24)" : "0 12px 26px rgba(23, 33, 28, 0.18)")
    : (hovered ? "0 12px 24px rgba(17, 24, 39, 0.14)" : "0 8px 18px rgba(17, 24, 39, 0.08)");

  return {
    width: 42,
    height: 42,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: "50%",
    border: ringBorder,
    background: ringBackground,
    color: active ? "#ffffff" : "#000000",
    cursor: "pointer",
    boxShadow: ringShadow,
    transform: hovered ? "translateY(-1px)" : undefined,
    transition: "background 140ms ease, border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease",
    padding: 0,
  };
}

const hamburgerLineStyle: CSSProperties = {
  width: 15,
  height: 2,
  borderRadius: 999,
  background: "currentColor",
  color: "inherit",
  display: "block",
};

function battleMenuStyle(placement: "top-start" | "top-end"): CSSProperties {
  return {
    position: "absolute",
    ...(placement === "top-end" ? { right: 0 } : { left: 0 }),
    bottom: 54,
    zIndex: 20,
    width: 360,
    maxWidth: "calc(100vw - 48px)",
    borderRadius: 8,
    border: "1px solid rgba(217, 225, 218, 0.86)",
    background: "rgba(238, 243, 238, 0.86)",
    color: "#000000",
    textShadow: "none",
    boxShadow: "0 24px 70px rgba(17, 24, 39, 0.18)",
    padding: 12,
  };
}

const battleMenuHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const battleMenuTitleStyle: CSSProperties = {
  display: "block",
  marginTop: 2,
  color: "#000000",
  textShadow: "none",
  fontSize: 18,
  lineHeight: 1.1,
  fontWeight: 950,
};

const battleMenuKickerStyle: CSSProperties = {
  color: "#000000",
  textShadow: "none",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0,
  textTransform: "uppercase",
};

function surrenderButtonStyle(_enabled: boolean): CSSProperties {
  return {
    minWidth: 102,
    height: 38,
    padding: "0 12px",
    fontSize: 12,
    fontWeight: 950,
  };
}

const battleLogListStyle: CSSProperties = {
  marginTop: 12,
  maxHeight: 280,
  overflow: "auto",
  display: "grid",
  gap: 7,
};

function battleLogEntryStyle(index: number): CSSProperties {
  return {
    borderRadius: 8,
    border: "1px solid rgba(0, 0, 0, 0.12)",
    background: index === 0 ? "rgba(214, 81, 157, 0.1)" : "rgba(247,250,248,0.82)",
    color: "#000000",
    textShadow: "none",
    padding: "8px 10px",
    fontSize: 12,
    lineHeight: 1.35,
    fontWeight: 850,
    overflowWrap: "anywhere",
  };
}

const battleLogEmptyStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px dashed rgba(185, 198, 188, 0.88)",
  color: "#000000",
  textShadow: "none",
  padding: 12,
  fontSize: 12,
  fontWeight: 850,
};

const energyGlowColors: Record<EnergyType, string> = {
  grass: "#63b65f",
  fire: "#ef7a3d",
  water: "#4c93f0",
  lightning: "#e6b93d",
  psychic: "#d6519d",
  fighting: "#b26a4a",
  darkness: "#374151",
  steel: "#94a3b8",
  colorless: "#a7adba",
  dragon: "#d4a72c",
};

function energyTokenStyle(enabled: boolean, energyType: EnergyType | null, hovered: boolean, refreshing: boolean): CSSProperties {
  const glowColor = energyType ? energyGlowColors[energyType] : null;
  const borderColor = glowColor
    ? alphaColor(glowColor, refreshing ? 0.58 : hovered ? 0.52 : 0.34)
    : "rgba(217, 225, 218, 0.82)";
  const tokenShadow = glowColor
    ? (refreshing
      ? `0 0 0 4px ${alphaColor(glowColor, 0.24)}, 0 16px 34px ${alphaColor(glowColor, 0.4)}`
      : `0 0 0 2px ${alphaColor(glowColor, hovered ? 0.2 : 0.12)}, 0 12px 28px ${alphaColor(glowColor, hovered ? 0.36 : 0.24)}`)
    : (hovered ? "0 10px 20px rgba(17, 24, 39, 0.12)" : "0 8px 18px rgba(17, 24, 39, 0.08)");
  const translateY = enabled && hovered ? -1 : 0;
  const scale = refreshing ? 1.08 : 1;

  return {
    position: "relative",
    width: 42,
    height: 42,
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    border: `1px solid ${borderColor}`,
    background: "rgba(238, 243, 238, 0.82)",
    color: "#000000",
    textShadow: "none",
    boxShadow: tokenShadow,
    cursor: enabled ? "grab" : "not-allowed",
    opacity: enabled ? 1 : 0.46,
    userSelect: "none",
    transform: refreshing || hovered ? `translateY(${translateY}px) scale(${scale})` : undefined,
    transition: "border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease",
  };
}

const energyTokenEmptyStyle: CSSProperties = {
  color: "#000000",
  textShadow: "none",
  fontSize: 16,
  fontWeight: 900,
};

const energyTokenBadgeStyle: CSSProperties = {
  position: "absolute",
  right: -4,
  bottom: -4,
  minWidth: 18,
  height: 18,
  display: "grid",
  placeItems: "center",
  padding: "0 4px",
  borderRadius: 999,
  background: "#d6519d",
  color: "#ffffff",
  fontSize: 10,
  fontWeight: 900,
  boxShadow: "0 6px 14px rgba(214, 81, 157, 0.28)",
};
