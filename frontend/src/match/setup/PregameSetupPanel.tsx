import type { CSSProperties } from "react";
import type { GameState } from "../../../../shared/src/types";
import type { InspectTarget } from "../../inspect";
import { Hand } from "../../components/boards/Hand";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { MatchMenuControl } from "../controls/HandControls";
import { attackButtonStyle, previewKickerStyle } from "../../styles/shared";

export function PregameSetupPanel({
  game,
  activeIndex,
  benchIndexes,
  menuOpen,
  log,
  canSurrender,
  onToggleMenu,
  onSurrender,
  onSetActive,
  onReady,
  onInspect,
  sleeveImage,
}: {
  game: GameState;
  activeIndex: number | null;
  benchIndexes: number[];
  menuOpen: boolean;
  log: string[];
  canSurrender: boolean;
  onToggleMenu: () => void;
  onSurrender: () => void;
  onSetActive: (index: number) => void;
  onReady: () => void;
  onInspect: (target: InspectTarget) => void;
  sleeveImage?: string | null;
}) {
  return (
    <div style={pregamePanelStyle}>
      <div style={pregamePanelHeaderStyle}>
        <div>
          <h2 style={pregameTitleStyle}>Preparation Phase</h2>
        </div>
        <div style={pregameActionRowStyle}>
          <NeutralButton style={attackButtonStyle(activeIndex !== null)} disabled={activeIndex === null} onClick={onReady}>Ready</NeutralButton>
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
      <Hand
        state={game}
        mode="setup"
        setupActiveIndex={activeIndex}
        setupBenchIndexes={benchIndexes}
        onSetupChooseActive={onSetActive}
        onInspect={onInspect}
        sleeveImage={sleeveImage}
      />
    </div>
  );
}

const pregamePanelStyle: CSSProperties = {
  display: "grid",
  background: "rgba(148, 163, 184, 0.08)",
  gap: 0,
};

const pregamePanelHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 5,
};

const pregameTitleStyle: CSSProperties = {
  margin: "2px 0 0",
  color: "#000000",
  fontSize: 30,
  lineHeight: 1.05,
  fontWeight: 950,
};

const pregameActionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};
