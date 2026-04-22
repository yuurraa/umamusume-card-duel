import { useRef, type CSSProperties } from "react";
import { NeutralButton } from "../components/buttons/NeutralButton";
import {
  borders,
  colors,
  fontStacks,
  filters,
  glassPanelStyle,
  radius,
  shadows,
  uiTextColor,
  uiTextShadow,
} from "../styles/shared";

export type PvpRole = "host" | "guest";

export function PvpLobbyScreen({
  role,
  statusDetail,
  localSignal,
  remoteSignal,
  connected,
  onBack,
  onSetRole,
  onCreateOffer,
  onJoinWithOffer,
  onRemoteSignalChange,
  onCopyLocalSignal,
  onClear,
}: {
  role: PvpRole | null;
  statusDetail: string;
  localSignal: string;
  remoteSignal: string;
  connected: boolean;
  onBack: () => void;
  onSetRole: (role: PvpRole) => void;
  onCreateOffer: () => void;
  onJoinWithOffer: () => void;
  onRemoteSignalChange: (value: string) => void;
  onCopyLocalSignal: () => void;
  onClear: () => void;
}) {
  const isHost = role === "host";
  const isGuest = role === "guest";
  const lastAutoJoinCodeRef = useRef("");
  const hasErrorStatus = /failed|invalid|error|not found|unable|closed|lost|timed out|ice/i.test(statusDetail);
  const loopStatus = connected
    ? "Opponent found!"
    : isHost
      ? (localSignal ? "Searching for opponent..." : "Searching for opponent...")
      : isGuest
        ? (remoteSignal.trim() ? "Searching for opponent..." : "Waiting for code...")
        : "Waiting for code...";
  const statusMessage = hasErrorStatus ? statusDetail : loopStatus;

  return (
    <section style={screenStyle}>
      <style>{`@keyframes pvp-loop { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={heroStyle}>
        <div style={titleRowStyle}>
          <img style={headerImageLeftStyle} src="/assets/header.png" alt="" draggable={false} />
          <h1 style={titleStyle}>Player vs Player</h1>
          <img style={headerImageRightStyle} src="/assets/header.png" alt="" draggable={false} />
        </div>
        <div style={panelStyle}>
          {!role ? (
            <div style={verticalOptionsStyle}>
              <NeutralButton style={optionButtonStyle} onClick={() => { onSetRole("host"); onCreateOffer(); }}>Host</NeutralButton>
              <NeutralButton style={optionButtonStyle} onClick={() => onSetRole("guest")}>Join</NeutralButton>
              <NeutralButton style={optionButtonStyle} onClick={onBack}>Back</NeutralButton>
            </div>
          ) : (
            <>
              <div style={roleContentStyle}>
                <div style={roleHeaderStyle}>{isHost ? "Game Code" : "Input Game Code"}</div>
                {isHost ? (
                  <input
                    readOnly
                    value={localSignal}
                    style={inputStyle}
                    placeholder="Generating code..."
                  />
                ) : (
                  <input
                    value={remoteSignal}
                    onChange={(event) => {
                      const value = event.target.value;
                      onRemoteSignalChange(value);
                      const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
                      if (normalized.length < 6 || normalized === lastAutoJoinCodeRef.current) return;
                      lastAutoJoinCodeRef.current = normalized;
                      onJoinWithOffer();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && remoteSignal.trim()) onJoinWithOffer();
                    }}
                    style={inputStyle}
                    placeholder="Enter game code"
                    maxLength={16}
                  />
                )}
              </div>

              <div style={searchRowStyle}>
                <span style={loopRingStyle(connected)} />
                <p style={statusStyle}>{statusMessage}</p>
              </div>

              <div style={footerRowStyle}>
                <NeutralButton onClick={onBack} style={backButtonStyle}>Back</NeutralButton>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

const screenStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

const heroStyle: CSSProperties = {
  display: "grid",
  justifyItems: "center",
  gap: 26,
  gridTemplateRows: "auto 320px",
};

const titleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "fit-content",
  maxWidth: "calc(100vw - 28px)",
  borderRadius: radius.pill,
  border: borders.glassStrong,
  background: colors.glass,
  boxShadow: shadows.xl,
  padding: "20px 30px",
  backdropFilter: filters.glassBlur,
};

const headerImageBase: CSSProperties = {
  flex: "0 0 auto",
  width: "clamp(64px, 10vw, 92px)",
  padding: "0 28px",
  height: "auto",
  objectFit: "contain",
  filter: "drop-shadow(0 10px 20px rgba(17, 24, 39, 0.14))",
};

const headerImageLeftStyle: CSSProperties = {
  ...headerImageBase,
  transform: "scaleX(-1)",
};

const headerImageRightStyle: CSSProperties = {
  ...headerImageBase,
};

const panelStyle: CSSProperties = {
  ...glassPanelStyle,
  minWidth: 280,
  width: "min(340px, calc(100vw - 28px))",
  display: "grid",
  placeItems: "center",
  gap: 12,
  padding: 14,
  alignSelf: "start",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: uiTextColor,
  textShadow: uiTextShadow,
  maxWidth: 900,
  fontSize: "clamp(36px, 5.4vw, 68px)",
  lineHeight: 0.92,
  fontWeight: 950,
  whiteSpace: "nowrap",
};

const verticalOptionsStyle: CSSProperties = {
  width: 260,
  display: "grid",
  gap: 10,
};

const optionButtonStyle: CSSProperties = {
  minHeight: 46,
};

const roleContentStyle: CSSProperties = {
  width: "100%",
  maxWidth: 260,
  display: "grid",
  gap: 10,
  justifyItems: "center",
  textAlign: "center",
};

const roleHeaderStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 900,
  color: uiTextColor,
  textShadow: uiTextShadow,
  letterSpacing: 0.5,
  textTransform: "uppercase",
};

function loopRingStyle(connected: boolean): CSSProperties {
  return {
    width: 34,
    height: 34,
    borderRadius: "50%",
    border: connected ? "4px solid rgba(22, 163, 74, 0.86)" : "4px solid rgba(38, 49, 45, 0.44)",
    borderTopColor: connected ? "rgba(34, 197, 94, 0.96)" : "rgba(38, 49, 45, 0.9)",
    animation: connected ? undefined : "pvp-loop 760ms linear infinite",
    boxShadow: connected ? "0 0 0 8px rgba(34, 197, 94, 0.18)" : "none",
  };
}

const searchRowStyle: CSSProperties = {
  width: "100%",
  maxWidth: 260,
  display: "grid",
  justifyItems: "center",
  alignItems: "center",
  gap: 10,
  minHeight: 78,
};

const statusStyle: CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 900,
  color: uiTextColor,
  textShadow: uiTextShadow,
  textAlign: "center",
};

const inputStyle: CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: radius.md,
  border: borders.neutralStrong,
  background: colors.glassStrong,
  color: colors.slate900,
  fontSize: 16,
  fontWeight: 700,
  letterSpacing: 0.4,
  fontFamily: fontStacks.ui,
  padding: "0 12px",
  boxSizing: "border-box",
  boxShadow: shadows.sm,
  textTransform: "uppercase",
  textAlign: "center",
};

const footerRowStyle: CSSProperties = {
  width: "100%",
  maxWidth: 260,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const backButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 40,
};
