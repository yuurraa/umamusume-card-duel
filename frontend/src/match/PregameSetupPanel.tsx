import type { CSSProperties } from "react";
import type { GameState } from "../../../shared/src/types";
import type { InspectTarget } from "../inspect";
import { Hand } from "../components/Hand";
import { NeutralButton } from "../components/NeutralButton";
import { attackButtonStyle, previewKickerStyle } from "../styles/shared";

export function PregameSetupPanel({
  game,
  activeIndex,
  benchIndexes,
  onSetActive,
  onReady,
  onInspect,
}: {
  game: GameState;
  activeIndex: number | null;
  benchIndexes: number[];
  onSetActive: (index: number) => void;
  onReady: () => void;
  onInspect: (target: InspectTarget) => void;
}) {
  const coinFlipCopy = game.firstPlayer === "player" ? "Heads. You went first." : "Tails. Opponent went first.";

  return (
    <div style={pregamePanelStyle}>
      <div style={pregamePanelHeaderStyle}>
        <div>
          <div style={previewKickerStyle}>Preparation Phase</div>
          <h2 style={pregameTitleStyle}>{coinFlipCopy}</h2>
          <p style={pregameBodyStyle}>Move a Basic Umamusume to the active slot, as well as any Basic Umamusume to your bench.</p>
        </div>
        <div style={pregameActionRowStyle}>
          <NeutralButton style={attackButtonStyle(activeIndex !== null)} disabled={activeIndex === null} onClick={onReady}>Ready</NeutralButton>
        </div>
      </div>
      <Hand
        state={game}
        mode="setup"
        setupActiveIndex={activeIndex}
        setupBenchIndexes={benchIndexes}
        onSetupChooseActive={onSetActive}
        onInspect={onInspect}
      />
    </div>
  );
}

const pregamePanelStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const pregamePanelHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
};

const pregameTitleStyle: CSSProperties = {
  margin: "2px 0 0",
  fontSize: 26,
  lineHeight: 1.05,
  fontWeight: 950,
};

const pregameBodyStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#47554c",
  fontSize: 14,
  fontWeight: 800,
  lineHeight: 1.4,
};

const pregameActionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};
