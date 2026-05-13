import type { CSSProperties } from "react";
import type { GameState } from "../../../../shared/src/types";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { colors, overlayBackdropStyle, overlaySurfaceStyle, previewKickerStyle, radius } from "../../styles/shared";

export function GameOverModal({
  game,
  playerName,
  opponentName,
  onPlayAgain,
  onMainMenu,
}: {
  game: GameState;
  playerName: string;
  opponentName: string;
  onPlayAgain: () => void;
  onMainMenu: () => void;
}) {
  const playerWon = game.winner === "player";
  const title = playerWon ? formatWinTitle(playerName) : formatWinTitle(opponentName);
  const winnerLabel = playerWon ? playerName : opponentName;
  const loserLabel = playerWon ? opponentName : playerName;
  const winnerPoints = game.winner ? game.sides[game.winner].points : 0;
  const body = winnerPoints >= 3
    ? `${winnerLabel} reached three points.`
    : formatNoBenchRemaining(loserLabel);

  return (
    <div style={gameOverBackdropStyle}>
      <style>{OVERLAY_FADE_IN_KEYFRAMES}</style>
      <section style={gameOverShellStyle(playerWon)}>
        <div style={resultBadgeStyle(playerWon)}>{playerWon ? "Victory" : "Defeat"}</div>
        <div style={gameOverKickerStyle}>Duel Finished</div>
        <h2 style={gameOverTitleStyle}>{title}</h2>
        <p style={gameOverBodyStyle}>{body}</p>
        <div style={gameOverScoreRowStyle}>
          <ScoreSummary label={playerName} points={game.sides.player.points} highlighted={playerWon} />
          <ScoreSummary label={opponentName} points={game.sides.opponent.points} highlighted={!playerWon} />
        </div>
        <NeutralButton style={gameOverButtonStyle} onClick={onPlayAgain}>Play Again</NeutralButton>
        <NeutralButton style={gameOverSecondaryButtonStyle} onClick={onMainMenu}>Main Menu</NeutralButton>
      </section>
    </div>
  );
}

function formatWinTitle(name: string): string {
  return name.toLowerCase() === "you" ? "You Win" : `${name} Wins`;
}

function formatNoBenchRemaining(name: string): string {
  return name.toLowerCase() === "you"
    ? "You have no benched Umamusume remaining."
    : `${name} has no benched Umamusume remaining.`;
}

function ScoreSummary({ label, points, highlighted }: { label: string; points: number; highlighted: boolean }) {
  return (
    <div style={scoreSummaryStyle(highlighted)}>
      <span style={scoreSummaryLabelStyle}>{label}</span>
      <strong style={scoreSummaryPointsStyle}>{points}</strong>
    </div>
  );
}

const gameOverBackdropStyle: CSSProperties = {
  ...overlayBackdropStyle,
  zIndex: 80,
  animation: "game-over-backdrop-in 260ms ease both",
};

const OVERLAY_FADE_IN_KEYFRAMES = `
@keyframes game-over-backdrop-in {
  from { opacity: 0; backdrop-filter: blur(0); }
  to { opacity: 1; backdrop-filter: blur(6px); }
}

@keyframes game-over-shell-in {
  0% { opacity: 0; transform: translateY(24px) scale(0.94); filter: blur(8px); }
  62% { opacity: 1; transform: translateY(-4px) scale(1.015); filter: blur(0); }
  100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}
`;

function gameOverShellStyle(playerWon: boolean): CSSProperties {
  const hue = playerWon
    ? {
        border: "rgba(22, 101, 52, 0.42)",
        top: "rgba(220, 252, 231, 0.96)",
        bottom: "rgba(187, 247, 208, 0.9)",
        glow: "rgba(22, 101, 52, 0.22)",
      }
    : {
        border: "rgba(153, 27, 27, 0.42)",
        top: "rgba(254, 226, 226, 0.96)",
        bottom: "rgba(254, 202, 202, 0.9)",
        glow: "rgba(153, 27, 27, 0.22)",
      };

  return {
    ...overlaySurfaceStyle,
    width: "min(460px, 100%)",
    padding: 22,
    textAlign: "center",
    border: `1px solid ${hue.border}`,
    background: `linear-gradient(180deg, ${hue.top} 0%, ${hue.bottom} 100%)`,
    color: colors.black,
    textShadow: "none",
    boxShadow: `0 26px 80px ${hue.glow}, 0 22px 68px rgba(17, 24, 39, 0.2)`,
    animation: "game-over-shell-in 420ms cubic-bezier(0.16, 1, 0.3, 1) both",
  };
}

function resultBadgeStyle(playerWon: boolean): CSSProperties {
  return {
    width: "max-content",
    margin: "0 auto 10px",
    borderRadius: radius.pill,
    border: "1px solid rgba(0, 0, 0, 0.2)",
    background: playerWon ? "rgba(134, 239, 172, 0.68)" : "rgba(252, 165, 165, 0.68)",
    color: colors.black,
    textShadow: "none",
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase",
  };
}

const gameOverTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: colors.black,
  textShadow: "none",
  fontSize: 34,
  lineHeight: 1,
  fontWeight: 950,
};

const gameOverKickerStyle: CSSProperties = {
  ...previewKickerStyle,
  color: colors.black,
  textShadow: "none",
};

const gameOverBodyStyle: CSSProperties = {
  margin: "12px 0 0",
  color: colors.black,
  textShadow: "none",
  fontSize: 14,
  lineHeight: 1.4,
  fontWeight: 850,
};

const gameOverScoreRowStyle: CSSProperties = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

function scoreSummaryStyle(highlighted: boolean): CSSProperties {
  return {
    borderRadius: radius.md,
    border: highlighted ? "2px solid rgba(0, 0, 0, 0.34)" : "1px solid rgba(0, 0, 0, 0.14)",
    background: highlighted ? "rgba(255, 255, 255, 0.32)" : "rgba(238, 243, 238, 0.52)",
    padding: highlighted ? 11 : 12,
  };
}

const scoreSummaryLabelStyle: CSSProperties = {
  display: "block",
  color: colors.black,
  textShadow: "none",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
};

const scoreSummaryPointsStyle: CSSProperties = {
  display: "block",
  marginTop: 4,
  color: colors.black,
  textShadow: "none",
  fontSize: 26,
  lineHeight: 1,
  fontWeight: 950,
};

const gameOverButtonStyle: CSSProperties = {
  width: "100%",
  marginTop: 18,
  fontWeight: 950,
};

const gameOverSecondaryButtonStyle: CSSProperties = {
  width: "100%",
  marginTop: 10,
  fontWeight: 950,
};
