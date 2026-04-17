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
      <section style={gameOverShellStyle}>
        <div style={previewKickerStyle}>Duel Finished</div>
        <h2 style={gameOverTitleStyle}>{title}</h2>
        <p style={gameOverBodyStyle}>{latest}</p>
        <div style={gameOverScoreRowStyle}>
          <ScoreSummary label="You" points={game.sides.player.points} accent="#d6519d" />
          <ScoreSummary label="Opponent" points={game.sides.opponent.points} accent="#26312d" />
        </div>
        <NeutralButton style={gameOverButtonStyle} onClick={onPlayAgain}>Play Again</NeutralButton>
        <NeutralButton style={gameOverSecondaryButtonStyle} onClick={onMainMenu}>Main Menu</NeutralButton>
      </section>
    </div>
  );
}

function ScoreSummary({ label, points, accent }: { label: string; points: number; accent: string }) {
  return (
    <div style={scoreSummaryStyle}>
      <span style={scoreSummaryLabelStyle}>{label}</span>
      <strong style={{ ...scoreSummaryPointsStyle, color: accent }}>{points}</strong>
    </div>
  );
}

const gameOverBackdropStyle: CSSProperties = { ...overlayBackdropStyle, zIndex: 80 };

const gameOverShellStyle: CSSProperties = {
  ...overlaySurfaceStyle,
  width: "min(420px, 100%)",
  padding: 20,
  textAlign: "center",
};

const gameOverTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#17211c",
  fontSize: 34,
  lineHeight: 1,
  fontWeight: 950,
};

const gameOverBodyStyle: CSSProperties = {
  margin: "12px 0 0",
  color: "#47554c",
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

const scoreSummaryStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid rgba(100,113,104,0.14)",
  background: "rgba(247,250,248,0.86)",
  padding: 12,
};

const scoreSummaryLabelStyle: CSSProperties = {
  display: "block",
  color: "#647168",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
};

const scoreSummaryPointsStyle: CSSProperties = {
  display: "block",
  marginTop: 4,
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
