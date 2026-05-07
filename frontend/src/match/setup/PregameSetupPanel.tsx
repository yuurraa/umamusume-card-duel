import type { CSSProperties } from "react";
import type { GameState } from "../../../../shared/src/types";
import type { InspectTarget } from "../../inspect";
import { Hand } from "../../components/boards/Hand";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { MatchMenuControl, TurnPill } from "../controls/HandControls";
import { attackButtonStyle, colors, transitions, uiTextColor, uiTextShadow } from "../../styles/shared";

export function PregameSetupPanel({
  game,
  activeIndex,
  benchIndexes,
  menuOpen,
  log,
  canSurrender,
  onToggleMenu,
  onSurrender,
  onOpenOpponentZones,
  onSetActive,
  onReady,
  canReady,
  canInteract,
  onSwitchPov,
  onInspect,
  sleeveImage,
  handDrawRevealEnabled = true,
  handDeferredRevealCardIds = [],
}: {
  game: GameState;
  activeIndex: number | null;
  benchIndexes: number[];
  menuOpen: boolean;
  log: string[];
  canSurrender: boolean;
  onToggleMenu: () => void;
  onSurrender: () => void;
  onOpenOpponentZones: () => void;
  onSetActive: (index: number) => void;
  onReady: () => void;
  canReady: boolean;
  canInteract: boolean;
  onSwitchPov?: (() => void) | undefined;
  onInspect: (target: InspectTarget) => void;
  sleeveImage?: string | null;
  handDrawRevealEnabled?: boolean;
  handDeferredRevealCardIds?: string[];
}) {
  const setup = game.setup;
  const needsCoinChoice = game.phase === "setup" && !setup?.coinFlipResult;
  const waitingForOpeningHand = game.phase === "setup" && Boolean(setup?.coinFlipResult) && !setup?.openingHandsDealt;
  const setupLabel = needsCoinChoice
    ? "Waiting for opening coin flip..."
    : waitingForOpeningHand
      ? "Drawing opening hand..."
      : !setup?.readyBySide.player
        ? "Click ready to start"
        : (!setup.readyBySide.opponent
          ? "Waiting for opponent..."
          : `Starts in ${Math.max(1, setup.countdownSecondsRemaining ?? 3)}...`);

  return (
    <div style={pregamePanelStyle}>
      <div style={pregamePanelHeaderStyle}>
        <div>
          <h2 style={pregameTitleStyle}>Preparation Phase</h2>
        </div>
        <TurnPill label={setupLabel} />
        <div style={pregameActionRowStyle}>
          {onSwitchPov && (
            <NeutralButton style={attackButtonStyle(true)} onClick={onSwitchPov}>
              Switch POV
            </NeutralButton>
          )}
          <NeutralButton style={attackButtonStyle(activeIndex !== null && canReady)} disabled={activeIndex === null || !canReady} onClick={onReady}>Ready</NeutralButton>
          <button
            type="button"
            style={opponentZonesButtonStyle}
            onClick={onOpenOpponentZones}
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
      <Hand
        state={game}
        mode="setup"
        canPlayCards={canReady && canInteract}
        drawRevealEnabled={handDrawRevealEnabled}
        deferredRevealCardIds={handDeferredRevealCardIds}
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
  background: "transparent",
  gap: 0,
};

const pregamePanelHeaderStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 5,
  minHeight: 44,
};

const pregameTitleStyle: CSSProperties = {
  margin: "2px 0 0",
  color: uiTextColor,
  textShadow: uiTextShadow,
  fontSize: 30,
  lineHeight: 1.05,
  fontWeight: 950,
};

const pregameActionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const opponentZonesButtonStyle: CSSProperties = {
  width: 42,
  height: 42,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "50%",
  border: "1px solid rgba(217, 225, 218, 0.82)",
  background: "rgba(238, 243, 238, 0.82)",
  color: colors.black,
  cursor: "pointer",
  boxShadow: "0 8px 18px rgba(17, 24, 39, 0.08)",
  transition: `background ${transitions.base}, border-color ${transitions.base}, box-shadow ${transitions.base}, transform ${transitions.base}`,
  padding: 0,
};

const opponentZonesImageStyle: CSSProperties = {
  width: 20,
  height: 20,
  objectFit: "contain",
  display: "block",
};
