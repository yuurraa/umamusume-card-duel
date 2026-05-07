import { useEffect, useState, type CSSProperties } from "react";
import type { EnergyType } from "../../../../shared/src/types";
import { energyLabel } from "../../game/engine";
import { applyDragPreview, writeDragPayload } from "../../components/drag/dragData";
import { EnergyIcon } from "../../components/cards/EnergyIcon";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { attackButtonStyle, borders, colors, radius, shadows, transitions } from "../../styles/shared";
import { alphaColor, abilityRuby, energyAccentColors } from "../../utils/color";

export function PlayHandHeader({
  canAttach,
  energyRefreshKey,
  energyType,
  extraCount,
  turnNumber,
  turnLabel,
  turnAlert,
  canEndTurn,
  menuOpen,
  log,
  canSurrender,
  onEndTurn,
  onSwitchPov,
  onToggleMenu,
  onOpenOpponentZones,
  onSurrender,
}: {
  canAttach: boolean;
  energyRefreshKey: number;
  energyType: EnergyType | null;
  extraCount: number;
  turnNumber: number;
  turnLabel?: string | undefined;
  turnAlert?: boolean | undefined;
  canEndTurn: boolean;
  menuOpen: boolean;
  log: string[];
  canSurrender: boolean;
  onEndTurn: () => void;
  onSwitchPov?: (() => void) | undefined;
  onToggleMenu: () => void;
  onOpenOpponentZones: () => void;
  onSurrender: () => void;
}) {
  const [opponentHovered, setOpponentHovered] = useState(false);
  return (
    <div style={playHandHeaderStyle}>
      <EnergyDragToken canDrag={canAttach} refreshNonce={energyRefreshKey} energyType={energyType} extraCount={extraCount} />
      <TurnPill label={turnLabel ?? `Turn ${turnNumber}`} alert={Boolean(turnAlert)} />
      <div style={playHandActionRowStyle}>
        {onSwitchPov && (
          <NeutralButton style={endTurnButtonStyle(true)} onClick={onSwitchPov}>
            Switch POV
          </NeutralButton>
        )}
        <NeutralButton style={endTurnButtonStyle(canEndTurn)} disabled={!canEndTurn} onClick={onEndTurn}>
          End Turn
        </NeutralButton>
        <button
          type="button"
          style={opponentZonesButtonStyle(opponentHovered)}
          onClick={onOpenOpponentZones}
          onMouseEnter={() => setOpponentHovered(true)}
          onMouseLeave={() => setOpponentHovered(false)}
          onFocus={() => setOpponentHovered(true)}
          onBlur={() => setOpponentHovered(false)}
          aria-label="Open opponent zones"
          title="Opponent zones"
        >
          <img src="/assets/opponent.png" alt="" draggable={false} style={opponentZonesImageStyle} />
        </button>
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

export function TurnPill({ label, alert = false }: { label: string; alert?: boolean }) {
  const [pulseOn, setPulseOn] = useState(false);

  useEffect(() => {
    if (!alert) {
      setPulseOn(false);
      return;
    }
    const intervalId = window.setInterval(() => {
      setPulseOn((current) => !current);
    }, 620);
    return () => window.clearInterval(intervalId);
  }, [alert]);

  return <div style={turnCounterStyle(alert, pulseOn)}>{label}</div>;
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
        applyDragPreview(event);
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

function turnCounterStyle(alert: boolean, pulseOn: boolean): CSSProperties {
  return {
    position: "absolute",
    left: "50%",
    transform: "translateX(-50%)",
    pointerEvents: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 88,
    height: 32,
    padding: "0 12px",
    borderRadius: radius.pill,
    border: alert ? "1px solid rgba(153, 27, 27, 0.92)" : "1px solid rgba(217, 225, 218, 0.86)",
    background: alert ? "rgba(254, 226, 226, 0.95)" : "rgba(238, 243, 238, 0.86)",
    color: alert ? "#7f1d1d" : colors.black,
    textShadow: "none",
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: 0.2,
    lineHeight: 1,
    boxShadow: alert
      ? (pulseOn ? "0 0 0 4px rgba(239, 68, 68, 0.28), 0 10px 24px rgba(127, 29, 29, 0.2)" : "0 0 0 2px rgba(239, 68, 68, 0.16), 0 8px 20px rgba(127, 29, 29, 0.14)")
      : "0 8px 20px rgba(17, 24, 39, 0.08)",
    transition: `box-shadow ${transitions.base}, border-color ${transitions.base}, background ${transitions.base}, color ${transitions.base}`,
  };
}

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
    color: active ? colors.white : colors.black,
    cursor: "pointer",
    boxShadow: ringShadow,
    transform: hovered ? "translateY(-1px)" : undefined,
    transition: `background ${transitions.base}, border-color ${transitions.base}, box-shadow ${transitions.base}, transform ${transitions.base}`,
    padding: 0,
  };
}

const hamburgerLineStyle: CSSProperties = {
  width: 15,
  height: 2,
  borderRadius: radius.pill,
  background: "currentColor",
  color: "inherit",
  display: "block",
};

function opponentZonesButtonStyle(hovered: boolean): CSSProperties {
  return {
    width: 42,
    height: 42,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    border: hovered ? "1px solid rgba(0, 0, 0, 0.36)" : "1px solid rgba(217, 225, 218, 0.82)",
    background: hovered ? "rgba(238, 243, 238, 0.9)" : "rgba(238, 243, 238, 0.82)",
    color: colors.black,
    cursor: "pointer",
    boxShadow: hovered ? "0 12px 24px rgba(17, 24, 39, 0.14)" : "0 8px 18px rgba(17, 24, 39, 0.08)",
    transform: hovered ? "translateY(-1px)" : undefined,
    transition: `background ${transitions.base}, border-color ${transitions.base}, box-shadow ${transitions.base}, transform ${transitions.base}`,
    padding: 0,
  };
}

const opponentZonesImageStyle: CSSProperties = {
  width: 20,
  height: 20,
  objectFit: "contain",
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
    borderRadius: radius.md,
    border: "1px solid rgba(217, 225, 218, 0.86)",
    background: "rgba(238, 243, 238, 0.86)",
    color: colors.black,
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
  color: colors.black,
  textShadow: "none",
  fontSize: 18,
  lineHeight: 1.1,
  fontWeight: 950,
};

const battleMenuKickerStyle: CSSProperties = {
  color: colors.black,
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
    borderRadius: radius.md,
    border: "1px solid rgba(0, 0, 0, 0.12)",
    background: index === 0 ? "rgba(214, 81, 157, 0.1)" : "rgba(247,250,248,0.82)",
    color: colors.black,
    textShadow: "none",
    padding: "8px 10px",
    fontSize: 12,
    lineHeight: 1.35,
    fontWeight: 850,
    overflowWrap: "anywhere",
  };
}

const battleLogEmptyStyle: CSSProperties = {
  borderRadius: radius.md,
  border: borders.neutralDashed,
  color: colors.black,
  textShadow: "none",
  padding: 12,
  fontSize: 12,
  fontWeight: 850,
};

function energyTokenStyle(enabled: boolean, energyType: EnergyType | null, hovered: boolean, refreshing: boolean): CSSProperties {
  const glowColor = energyType ? energyAccentColors[energyType] : null;
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
    borderRadius: radius.circle,
    border: `1px solid ${borderColor}`,
    background: "rgba(238, 243, 238, 0.82)",
    color: colors.black,
    textShadow: "none",
    boxShadow: tokenShadow,
    cursor: enabled ? "grab" : "not-allowed",
    opacity: enabled ? 1 : 0.46,
    userSelect: "none",
    transform: refreshing || hovered ? `translateY(${translateY}px) scale(${scale})` : undefined,
    transition: `border-color ${transitions.base}, box-shadow ${transitions.base}, transform ${transitions.base}`,
  };
}

const energyTokenEmptyStyle: CSSProperties = {
  color: colors.black,
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
  borderRadius: radius.pill,
  background: abilityRuby,
  color: colors.white,
  fontSize: 10,
  fontWeight: 900,
  boxShadow: shadows.sm,
};
