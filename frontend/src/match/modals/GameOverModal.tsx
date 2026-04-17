import type { CSSProperties } from "react";
import type { GameState } from "../../../../shared/src/types";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { overlayBackdropStyle, overlaySurfaceStyle, previewKickerStyle } from "../../styles/shared";

export function GameOverModal({ game, onPlayAgain, onMainMenu }: { game: GameState; onPlayAgain: () => void; onMainMenu: () => void }) {
  const playerWon = game.winner === "player";
  const title = playerWon ? "You Win" : "Opponent Wins";
  const latest = game.log[0] ?? (playerWon ? "First to three points." : "The duel is over.");

  return (
    <div style={gameOverBackdropStyle}>
      <section style={gameOverShellStyle(playerWon)}>
        <div style={resultBadgeStyle(playerWon)}>{playerWon ? "Victory" : "Defeat"}</div>
        <div style={previewKickerStyle}>Duel Finished</div>
        <h2 style={gameOverTitleStyle}>{title}</h2>
        <p style={gameOverBodyStyle}>{latest}</p>
        <div style={gameOverScoreRowStyle}>
          <ScoreSummary label="You" points={game.sides.player.points} highlighted={playerWon} />
          <ScoreSummary label="Opponent" points={game.sides.opponent.points} highlighted={!playerWon} />
        </div>
        <NeutralButton style={gameOverButtonStyle} onClick={onPlayAgain}>Play Again</NeutralButton>
        <NeutralButton style={gameOverSecondaryButtonStyle} onClick={onMainMenu}>Main Menu</NeutralButton>
      </section>
    </div>
  );
}

function ScoreSummary({ label, points, highlighted }: { label: string; points: number; highlighted: boolean }) {
  return (
    <div style={scoreSummaryStyle(highlighted)}>
      <span style={scoreSummaryLabelStyle}>{label}</span>
      <strong style={scoreSummaryPointsStyle}>{points}</strong>
    </div>
  );
}

const gameOverBackdropStyle: CSSProperties = { ...overlayBackdropStyle, zIndex: 80 };

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
    boxShadow: `0 26px 80px ${hue.glow}, 0 22px 68px rgba(17, 24, 39, 0.2)`,
  };
}

function resultBadgeStyle(playerWon: boolean): CSSProperties {
  return {
    width: "max-content",
    margin: "0 auto 10px",
    borderRadius: 999,
    border: "1px solid rgba(0, 0, 0, 0.2)",
    background: playerWon ? "rgba(134, 239, 172, 0.68)" : "rgba(252, 165, 165, 0.68)",
    color: "#000000",
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase",
  };
}

const gameOverTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#000000",
  fontSize: 34,
  lineHeight: 1,
  fontWeight: 950,
};

const gameOverBodyStyle: CSSProperties = {
  margin: "12px 0 0",
  color: "#000000",
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
    borderRadius: 8,
    border: highlighted ? "2px solid rgba(0, 0, 0, 0.34)" : "1px solid rgba(0, 0, 0, 0.14)",
    background: highlighted ? "rgba(255, 255, 255, 0.32)" : "rgba(238, 243, 238, 0.52)",
    padding: highlighted ? 11 : 12,
  };
}

const scoreSummaryLabelStyle: CSSProperties = {
  display: "block",
  color: "#000000",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
};

const scoreSummaryPointsStyle: CSSProperties = {
  display: "block",
  marginTop: 4,
  color: "#000000",
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
