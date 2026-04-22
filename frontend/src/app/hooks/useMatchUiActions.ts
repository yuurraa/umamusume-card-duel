import type { Dispatch, SetStateAction } from "react";
import type { GameState, SideState, EnergyType } from "../../../../shared/src/types";
import type { ActionNoticeSource, PendingSelection } from "../../types/ui";
import { canAttack, canAttachEnergy } from "../../game/engine";
import { RETREAT_ENERGY_ORDER } from "../gameUiHelpers";
import type { PlayerIntent } from "../../pvp/playerIntent";

type UseMatchUiActionsArgs = {
  game: GameState;
  player: SideState;
  isAiVsAi: boolean;
  isTurnFlowBlocked: boolean;
  isBusyWithChoice: boolean;
  suppressEndTurnWarningForGame: boolean;
  setGame: Dispatch<SetStateAction<GameState>>;
  setPendingSelection: Dispatch<SetStateAction<PendingSelection | null>>;
  setEndTurnWarningActions: Dispatch<SetStateAction<string[] | null>>;
  submitPlayerIntent: (intent: PlayerIntent) => void;
};

export function useMatchUiActions({
  game,
  player,
  isAiVsAi,
  isTurnFlowBlocked,
  isBusyWithChoice,
  suppressEndTurnWarningForGame,
  setGame,
  setPendingSelection,
  setEndTurnWarningActions,
  submitPlayerIntent,
}: UseMatchUiActionsArgs) {
  const adjustRetreatDiscard = (energyType: EnergyType, delta: 1 | -1) => {
    setPendingSelection((current) => {
      if (!current || current.kind !== "retreatDiscard") return current;
      const available = current.availableEnergyCounts[energyType] ?? 0;
      const selected = current.selectedEnergyCounts[energyType] ?? 0;
      const selectedTotal = Object.values(current.selectedEnergyCounts).reduce((sum, count) => sum + (count ?? 0), 0);
      if (delta === 1 && selectedTotal >= current.retreatCost) return current;
      const nextSelected = Math.max(0, Math.min(available, selected + delta));
      if (nextSelected === selected) return current;
      return {
        ...current,
        selectedEnergyCounts: {
          ...current.selectedEnergyCounts,
          [energyType]: nextSelected,
        },
      };
    });
  };

  const confirmRetreatDiscard = () => {
    setPendingSelection((current) => {
      if (!current || current.kind !== "retreatDiscard") return current;
      const selectedCount = Object.values(current.selectedEnergyCounts).reduce((sum, count) => sum + (count ?? 0), 0);
      if (selectedCount !== current.retreatCost) return current;
      const discardEnergyTypes = RETREAT_ENERGY_ORDER.flatMap((energyType) =>
        Array.from({ length: current.selectedEnergyCounts[energyType] ?? 0 }, () => energyType),
      );
      return { kind: "retreatTarget", discardEnergyTypes };
    });
  };

  const handleEndTurn = () => {
    if (isAiVsAi || isTurnFlowBlocked || game.phase !== "play" || game.currentSide !== "player" || game.gameOver || isBusyWithChoice) return;
    const availableActions: string[] = [];
    if (canAttachEnergy(game, player)) availableActions.push("attach Energy");
    if (canAttack(game, player)) availableActions.push("attack");
    if (availableActions.length > 0 && !suppressEndTurnWarningForGame) {
      setEndTurnWarningActions(availableActions);
      return;
    }
    submitPlayerIntent({ type: "endTurn" });
  };

  const applyPlayerGameUpdate = (update: (state: GameState) => GameState, noticeSource?: ActionNoticeSource) => {
    const next = update(game);
    setGame(next);
    if (!noticeSource) return;
  };

  return {
    adjustRetreatDiscard,
    confirmRetreatDiscard,
    handleEndTurn,
    applyPlayerGameUpdate,
  };
}
