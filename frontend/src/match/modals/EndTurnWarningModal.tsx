import type { CSSProperties } from "react";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { colors, overlayBackdropStyle, overlayButtonStyle, overlaySurfaceStyle } from "../../styles/shared";

export function EndTurnWarningModal({
  actions,
  suppressForGame,
  onSuppressForGameChange,
  onCancel,
  onConfirm,
}: {
  actions: string[] | null;
  suppressForGame: boolean;
  onSuppressForGameChange: (next: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!actions || actions.length === 0) return null;

  return (
    <div style={warningBackdropStyle} onClick={onCancel}>
      <section style={warningShellStyle} onClick={(event) => event.stopPropagation()}>
        <header style={warningHeaderStyle}>
          <h2 style={warningTitleStyle}>Are you sure you want to end your turn?</h2>
        </header>
        <ul style={warningListStyle}>
          {actions.map((action) => (
            <li key={action} style={warningListItemStyle}>{formatActionLabel(action)}</li>
          ))}
        </ul>
        <div style={warningActionsStyle}>
          <label style={warningCheckboxRowStyle}>
            <input
              type="checkbox"
              checked={suppressForGame}
              onChange={(event) => onSuppressForGameChange(event.target.checked)}
            />
            <span>Do not show me again for this game</span>
          </label>
          <div style={warningButtonRowStyle}>
            <NeutralButton style={warningButtonStyle} onClick={onCancel}>Cancel</NeutralButton>
            <NeutralButton tone="danger" style={warningButtonStyle} onClick={onConfirm}>End Turn</NeutralButton>
          </div>
        </div>
      </section>
    </div>
  );
}

function formatActionLabel(action: string): string {
  if (action === "attach Energy") return "You can still attach an Energy.";
  if (action === "attack") return "You can still attack.";
  return action;
}

const warningBackdropStyle: CSSProperties = {
  ...overlayBackdropStyle,
  zIndex: 70,
};

const warningShellStyle: CSSProperties = {
  ...overlaySurfaceStyle,
  width: "min(520px, calc(100vw - 40px))",
  display: "grid",
  gap: 8,
  padding: 18,
  color: colors.black,
  textShadow: "none",
};

const warningHeaderStyle: CSSProperties = {
  display: "block",
};

const warningTitleStyle: CSSProperties = {
  margin: 0,
  color: colors.black,
  textShadow: "none",
  fontSize: 22,
  lineHeight: 1.15,
  fontWeight: 950,
};

const warningListStyle: CSSProperties = {
  margin: "4px 0 8px",
  paddingLeft: 22,
  display: "grid",
  gap: 2,
};

const warningListItemStyle: CSSProperties = {
  color: colors.black,
  textShadow: "none",
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1.35,
};

const warningCheckboxRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
  color: colors.black,
  textShadow: "none",
  fontSize: 13,
  fontWeight: 800,
  userSelect: "none",
};

const warningActionsStyle: CSSProperties = {
  marginTop: 4,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const warningButtonRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginLeft: "auto",
};

const warningButtonStyle: CSSProperties = {
  ...overlayButtonStyle,
  minWidth: 108,
};
