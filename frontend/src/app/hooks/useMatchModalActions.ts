import type { Dispatch, SetStateAction } from "react";
import type { GameState } from "../../../../shared/src/types";
import type { InspectTarget } from "../../inspect";
import type { PendingSelection } from "../../types/ui";
import { playerEndTurn } from "../../game/engine";

type UseMatchModalActionsArgs = {
  pendingSelection: PendingSelection | null;
  hasPendingPlayerChoice: boolean;
  startNewGame: () => void;
  cancelPendingSelection: () => void;
  setGame: Dispatch<SetStateAction<GameState>>;
  setDiscardOpen: Dispatch<SetStateAction<boolean>>;
  setEndTurnWarningActions: Dispatch<SetStateAction<string[] | null>>;
  setPreviewTarget: Dispatch<SetStateAction<InspectTarget | null>>;
  setPendingSelection: Dispatch<SetStateAction<PendingSelection | null>>;
  setActionNotice: Dispatch<SetStateAction<string | null>>;
};

export function useMatchModalActions({
  pendingSelection,
  hasPendingPlayerChoice,
  startNewGame,
  cancelPendingSelection,
  setGame,
  setDiscardOpen,
  setEndTurnWarningActions,
  setPreviewTarget,
  setPendingSelection,
  setActionNotice,
}: UseMatchModalActionsArgs) {
  const onOpenDiscard = () => setDiscardOpen(true);
  const onCloseDiscard = () => setDiscardOpen(false);
  const onDiscardInspect = (card: InspectTarget["card"]) => setPreviewTarget({ card });

  const onEndTurnWarningCancel = () => setEndTurnWarningActions(null);
  const onEndTurnWarningConfirm = () => {
    setEndTurnWarningActions(null);
    setGame(playerEndTurn);
  };

  const onDeckScoutClose = () => {
    if (pendingSelection?.kind !== "deckForScout") return;
    setPendingSelection({ kind: "discardForScout", handIndex: pendingSelection.handIndex });
  };

  const onActionNoticeClose = () => setActionNotice(null);
  const onSelectionCancel = hasPendingPlayerChoice ? () => undefined : cancelPendingSelection;
  const onPlayAgain = () => startNewGame();

  return {
    onOpenDiscard,
    onCloseDiscard,
    onDiscardInspect,
    onEndTurnWarningCancel,
    onEndTurnWarningConfirm,
    onDeckScoutClose,
    onActionNoticeClose,
    onSelectionCancel,
    onPlayAgain,
  };
}
