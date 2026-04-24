import type { CSSProperties } from "react";
import { NeutralButton } from "../components/buttons/NeutralButton";
import { colors, glassPanelStyle, uiTextColor, uiTextShadow } from "../styles/shared";
import type { MatchMode } from "../types/ui";

type ModeOption = {
  mode: MatchMode;
  title: string;
  subtitle: string;
  enabled: boolean;
};

const MODE_OPTIONS: ModeOption[] = [
  { mode: "playerVsPlayer", title: "Player vs Player", subtitle: "You against a friend", enabled: true },
  { mode: "playerVsAi", title: "Player vs AI", subtitle: "You against a bot", enabled: true },
  { mode: "aiVsAi", title: "AI vs AI", subtitle: "Watch two bots battle", enabled: true },
];

export function MatchModeScreen({
  onBack,
  onChooseMode,
}: {
  onBack: () => void;
  onChooseMode: (mode: MatchMode) => void;
}) {
  return (
    <section style={screenStyle}>
      <div style={heroStyle}>
        <h1 style={titleStyle}>Choose Match Mode</h1>
        <div style={cardGridStyle}>
          {MODE_OPTIONS.map((option) => (
            <NeutralButton
              key={option.mode}
              disabled={!option.enabled}
              onClick={() => option.enabled && onChooseMode(option.mode)}
              style={modeOptionButtonStyle(option.enabled)}
            >
              <div style={iconRowStyle}>
                {option.mode === "playerVsPlayer" && (
                  <>
                    <PlayerIcon />
                    <VersusLabel />
                    <PlayerIcon mirrored />
                  </>
                )}
                {option.mode === "playerVsAi" && (
                  <>
                    <PlayerIcon />
                    <VersusLabel />
                    <RobotIcon />
                  </>
                )}
                {option.mode === "aiVsAi" && (
                  <>
                    <RobotIcon />
                    <VersusLabel />
                    <RobotIcon mirrored />
                  </>
                )}
              </div>
              <strong style={cardTitleStyle}>{option.title}</strong>
              <span style={cardSubtitleStyle}>{option.subtitle}</span>
            </NeutralButton>
          ))}
        </div>
        <NeutralButton style={backButtonStyle} onClick={onBack}>Back</NeutralButton>
      </div>
    </section>
  );
}

function PlayerIcon({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true" style={iconStyle(mirrored)}>
      <circle cx="22" cy="14" r="8" fill={colors.slate800} />
      <rect x="10" y="24" width="24" height="14" rx="7" fill={colors.slate800} />
    </svg>
  );
}

function RobotIcon({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true" style={iconStyle(mirrored)}>
      <rect x="9" y="10" width="26" height="18" rx="4" fill={colors.slate800} />
      <rect x="14" y="30" width="16" height="8" rx="4" fill={colors.slate800} />
      <circle cx="17" cy="19" r="2.5" fill={colors.slate100} />
      <circle cx="27" cy="19" r="2.5" fill={colors.slate100} />
      <rect x="20.5" y="6" width="3" height="4" rx="1.5" fill={colors.slate800} />
      <circle cx="22" cy="5" r="2" fill={colors.slate800} />
    </svg>
  );
}

function VersusLabel() {
  return <span style={versusStyle}>VS</span>;
}

const screenStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  padding: 16,
};

const heroStyle: CSSProperties = {
  ...glassPanelStyle,
  width: "min(980px, calc(100vw - 36px))",
  display: "grid",
  justifyItems: "center",
  gap: 14,
  padding: "18px 18px 16px",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: "clamp(26px, 4.2vw, 40px)",
  lineHeight: 1,
  fontWeight: 950,
};

const cardGridStyle: CSSProperties = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

function modeOptionButtonStyle(enabled: boolean): CSSProperties {
  return {
    ...backButtonStyle,
    width: "100%",
    minHeight: 170,
    borderRadius: 10,
    border: "1px solid rgba(17, 24, 39, 0.22)",
    opacity: enabled ? 1 : 0.72,
    display: "grid",
    justifyItems: "center",
    alignContent: "center",
    gap: 8,
    textAlign: "center",
    padding: "12px 10px",
  };
}

const iconRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: 42,
};

function iconStyle(mirrored: boolean): CSSProperties {
  return {
    width: 34,
    height: 34,
    transform: mirrored ? "scaleX(-1)" : "none",
  };
}

const versusStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  color: colors.slate700,
  letterSpacing: 0.3,
};

const cardTitleStyle: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.15,
  fontWeight: 900,
};

const cardSubtitleStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.3,
  fontWeight: 700,
  color: colors.slate600,
};

const backButtonStyle: CSSProperties = {
  width: 180,
  minHeight: 44,
  fontSize: 15,
  fontWeight: 900,
};
