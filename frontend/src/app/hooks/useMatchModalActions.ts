import type { Dispatch, SetStateAction } from "react";
import type { InspectTarget } from "../../inspect";
import type { AppScreen, PendingSelection } from "../../types/ui";
import type { PlayerIntent } from "../../pvp/playerIntent";

type UseMatchModalActionsArgs = {
  isAiVsAi: boolean;
  isNetworkMatch: boolean;
  pendingSelection: PendingSelection | null;
  hasPendingPlayerChoice: boolean;
  startNewGame: () => void;
  navigateToScreen: (screen: AppScreen) => void;
  cancelPendingSelection: () => void;
  setDiscardOpen: Dispatch<SetStateAction<boolean>>;
  setEndTurnWarningActions: Dispatch<SetStateAction<string[] | null>>;
  setPreviewTarget: Dispatch<SetStateAction<InspectTarget | null>>;
  setPendingSelection: Dispatch<SetStateAction<PendingSelection | null>>;
  setActionNotice: Dispatch<SetStateAction<string | null>>;
  submitPlayerIntent: (intent: PlayerIntent) => void;
};

export function useMatchModalActions({
  isAiVsAi,
  isNetworkMatch,
  pendingSelection,
  hasPendingPlayerChoice,
  startNewGame,
  navigateToScreen,
  cancelPendingSelection,
  setDiscardOpen,
  setEndTurnWarningActions,
  setPreviewTarget,
  setPendingSelection,
  setActionNotice,
  submitPlayerIntent,
}: UseMatchModalActionsArgs) {
  const onOpenDiscard = () => setDiscardOpen(true);
  const onCloseDiscard = () => setDiscardOpen(false);
  const onDiscardInspect = (card: InspectTarget["card"]) => setPreviewTarget({ card });

  const onEndTurnWarningCancel = () => setEndTurnWarningActions(null);
  const onEndTurnWarningConfirm = () => {
    setEndTurnWarningActions(null);
    if (isAiVsAi) return;
    submitPlayerIntent({ type: "endTurn" });
  };

  const onDeckScoutClose = () => {
    if (pendingSelection?.kind === "deckForEvolutionSearch") {
      setPendingSelection(null);
      return;
    }
    if (pendingSelection?.kind !== "deckForScout") return;
    setPendingSelection({ kind: "discardForScout", handIndex: pendingSelection.handIndex });
  };

  const onActionNoticeClose = () => setActionNotice(null);
  const onSelectionCancel = hasPendingPlayerChoice
    ? () => undefined
    : pendingSelection?.kind === "discardForAttackBonus"
      ? () => {
        submitPlayerIntent({
          type: "attack",
          attackIndex: pendingSelection.attackIndex,
          ...(pendingSelection.randomDiscardIndex !== undefined ? { randomDiscardIndex: pendingSelection.randomDiscardIndex } : {}),
        });
        setPendingSelection(null);
      }
      : pendingSelection?.kind === "attackSwitchTarget"
        ? () => {
          submitPlayerIntent({
            type: "attack",
            attackIndex: pendingSelection.attackIndex,
          });
          setPendingSelection(null);
        }
      : pendingSelection?.kind === "attackShuffleSelfChoice"
        ? () => {
          submitPlayerIntent({
            type: "attack",
            attackIndex: pendingSelection.attackIndex,
            useShuffleSelfIntoDeck: false,
          });
          setPendingSelection(null);
        }
      : cancelPendingSelection;
  const onPlayAgain = () => {
    if (isNetworkMatch) {
      navigateToScreen("pvpLobby");
      return;
    }
    startNewGame();
  };

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
