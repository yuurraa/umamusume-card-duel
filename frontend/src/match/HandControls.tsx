import type { CSSProperties } from "react";
import type { EnergyType } from "../../../shared/src/types";
import { energyLabel } from "../game/engine";
import { writeDragPayload } from "../components/dragData";
import { EnergyIcon } from "../components/EnergyIcon";
import { NeutralButton } from "../components/NeutralButton";
import { neutralButtonStyle, previewKickerStyle } from "../styles/shared";

export function PlayHandHeader({
  canAttach,
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
      <div style={playHandActionRowStyle}>
        <button type="button" style={menuButtonStyle(menuOpen)} onClick={onToggleMenu} aria-label="Open battle menu">
          <span style={hamburgerLineStyle} />
          <span style={hamburgerLineStyle} />
          <span style={hamburgerLineStyle} />
        </button>
        <EnergyDragToken canDrag={canAttach} energyType={energyType} extraCount={extraCount} />
      </div>
      <NeutralButton style={endTurnButtonStyle(canEndTurn)} disabled={!canEndTurn} onClick={onEndTurn}>
        End Turn
      </NeutralButton>
      {menuOpen && <BattleMenu log={log} canSurrender={canSurrender} onSurrender={onSurrender} />}
    </div>
  );
}

function EnergyDragToken({ canDrag, energyType, extraCount }: { canDrag: boolean; energyType: EnergyType | null; extraCount: number }) {
  return (
    <div
      style={energyTokenStyle(canDrag)}
      draggable={canDrag}
      onDragStart={(event) => {
        if (!canDrag) return;
        event.dataTransfer.effectAllowed = "move";
        writeDragPayload(event.dataTransfer, { kind: "energy-token" });
      }}
      aria-label={energyType ? `Drag ${energyLabel(energyType)}` : "No Energy available"}
    >
      {energyType ? <EnergyIcon type={energyType} size="md" /> : <span style={energyTokenEmptyStyle}>?</span>}
      {extraCount > 0 && <span style={energyTokenBadgeStyle}>+{extraCount}</span>}
    </div>
  );
}

function BattleMenu({ log, canSurrender, onSurrender }: { log: string[]; canSurrender: boolean; onSurrender: () => void }) {
  return (
    <section style={battleMenuStyle}>
      <div style={battleMenuHeaderStyle}>
        <div>
          <div style={previewKickerStyle}>Menu</div>
          <strong style={battleMenuTitleStyle}>Battle Log</strong>
        </div>
        <NeutralButton style={surrenderButtonStyle(canSurrender)} disabled={!canSurrender} onClick={onSurrender}>
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
  gap: 12,
  marginBottom: 6,
  zIndex: 6,
};

const playHandActionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

function endTurnButtonStyle(enabled: boolean): CSSProperties {
  return { ...neutralButtonStyle(enabled, false) };
}

function menuButtonStyle(active: boolean): CSSProperties {
  return {
    width: 42,
    height: 42,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: "50%",
    border: active ? "1px solid rgba(23, 33, 28, 0.32)" : "1px solid rgba(255, 255, 255, 0.82)",
    background: active ? "#17211c" : "rgba(255, 255, 255, 0.92)",
    color: active ? "#ffffff" : "#17211c",
    cursor: "pointer",
    boxShadow: active ? "0 12px 26px rgba(23, 33, 28, 0.18)" : "0 8px 18px rgba(17, 24, 39, 0.08)",
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

const battleMenuStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  bottom: 54,
  zIndex: 20,
  width: 360,
  maxWidth: "calc(100vw - 48px)",
  borderRadius: 8,
  border: "1px solid rgba(255, 255, 255, 0.76)",
  background: "rgba(255, 255, 255, 0.94)",
  boxShadow: "0 24px 70px rgba(17, 24, 39, 0.18)",
  padding: 12,
};

const battleMenuHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const battleMenuTitleStyle: CSSProperties = {
  display: "block",
  marginTop: 2,
  color: "#17211c",
  fontSize: 18,
  lineHeight: 1.1,
  fontWeight: 950,
};

function surrenderButtonStyle(enabled: boolean): CSSProperties {
  return {
    ...neutralButtonStyle(enabled, false),
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
    border: "1px solid rgba(100,113,104,0.12)",
    background: index === 0 ? "rgba(214, 81, 157, 0.1)" : "rgba(247,250,248,0.82)",
    color: "#17211c",
    padding: "8px 10px",
    fontSize: 12,
    lineHeight: 1.35,
    fontWeight: 850,
  };
}

const battleLogEmptyStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px dashed rgba(100,113,104,0.24)",
  color: "#647168",
  padding: 12,
  fontSize: 12,
  fontWeight: 850,
};

function energyTokenStyle(enabled: boolean): CSSProperties {
  return {
    position: "relative",
    width: 42,
    height: 42,
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    border: "1px solid rgba(255, 255, 255, 0.82)",
    background: "rgba(255, 255, 255, 0.92)",
    boxShadow: enabled ? "0 12px 26px rgba(214, 81, 157, 0.18)" : "0 8px 18px rgba(17, 24, 39, 0.08)",
    cursor: enabled ? "grab" : "not-allowed",
    opacity: enabled ? 1 : 0.46,
    userSelect: "none",
  };
}

const energyTokenEmptyStyle: CSSProperties = {
  color: "#647168",
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
